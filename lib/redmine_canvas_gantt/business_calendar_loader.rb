require 'digest'
require 'yaml'
require_relative 'business_calendar'

module RedmineCanvasGantt
  class BusinessCalendarLoader
    class ConfigurationError < StandardError; end

    MAX_FILE_SIZE = 1 * 1024 * 1024
    MAX_CALENDARS = 100
    MAX_DAYS = 10_000
    MAX_BASE_DEPTH = 20
    CALENDAR_ID_PATTERN = /\A[A-Za-z0-9_-]{1,64}\z/
    ISO_DATE_PATTERN = /\A\d{4}-\d{2}-\d{2}\z/
    SETTINGS_KEYS = %w[schema_version default_calendar project_calendars].freeze
    FILE_KEYS = %w[schema_version calendar source days].freeze
    CALENDAR_KEYS = %w[id name base non_working_week_days managed].freeze
    DAY_KEYS = %w[date name type].freeze
    DAY_TYPES = %w[working non_working].freeze

    attr_reader :directory

    def initialize(directory:, fallback_non_working_week_days:, logger: nil)
      @directory = File.expand_path(directory.to_s)
      @fallback_non_working_week_days = normalize_fallback_week_days(fallback_non_working_week_days)
      @logger = logger
    end

    def fingerprint
      return 'missing' unless File.directory?(@directory)

      entries = calendar_files(include_settings: true).map do |path|
        stat = File.stat(path)
        [relative_path(path), stat.mtime.to_f, stat.size].join(':')
      end
      Digest::SHA256.hexdigest(entries.join("\n"))
    end

    def load(revision: fingerprint)
      unless File.directory?(@directory)
        return snapshot(revision: revision, settings: {}, calendars: {})
      end

      settings = load_settings
      definitions = load_calendar_definitions
      validate_calendar_references!(settings, definitions)
      calendars = resolve_calendars(definitions)
      snapshot(revision: revision, settings: settings, calendars: calendars)
    end

    private

    def snapshot(revision:, settings:, calendars:)
      RedmineCanvasGantt::BusinessCalendarSnapshot.new(
        status: 'ok',
        revision: revision,
        default_calendar_id: settings['default_calendar'],
        project_calendars: settings.fetch('project_calendars', {}),
        calendars: calendars,
        warnings: []
      )
    end

    def load_settings
      path = File.join(@directory, 'settings.yml')
      return {} unless File.file?(path)

      data = load_yaml(path)
      require_mapping!(data, path)
      validate_keys!(data, SETTINGS_KEYS, path)
      validate_schema_version!(data, path)

      default_calendar = data['default_calendar']
      validate_calendar_id!(default_calendar, "#{path}: default_calendar") unless default_calendar.nil?

      project_calendars = data.fetch('project_calendars', {})
      require_mapping!(project_calendars, "#{path}: project_calendars")
      project_calendars.each do |identifier, calendar_id|
        unless identifier.is_a?(String) && identifier.present? && identifier.length <= 255
          raise ConfigurationError, "#{path}: project_calendars contains an invalid project identifier"
        end
        validate_calendar_id!(calendar_id, "#{path}: project_calendars.#{identifier}")
      end

      {
        'default_calendar' => default_calendar,
        'project_calendars' => project_calendars.dup.freeze
      }.freeze
    end

    def load_calendar_definitions
      definitions = {}
      files = calendar_files(include_settings: false)
      if files.size > MAX_CALENDARS
        raise ConfigurationError, "#{@directory}: calendar count exceeds #{MAX_CALENDARS}"
      end

      files.each do |path|
        data = load_yaml(path)
        require_mapping!(data, path)
        validate_keys!(data, FILE_KEYS, path)
        validate_schema_version!(data, path)
        require_mapping!(data['source'], "#{path}: source") if data.key?('source')
        definition = normalize_calendar(data, path)
        id = definition.fetch(:id)
        if definitions.key?(id)
          raise ConfigurationError, "#{path}: duplicate calendar.id #{id.inspect}"
        end

        definitions[id] = definition
      end
      definitions.freeze
    end

    def normalize_calendar(data, path)
      calendar = data['calendar']
      require_mapping!(calendar, "#{path}: calendar")
      validate_keys!(calendar, CALENDAR_KEYS, "#{path}: calendar")

      id = calendar['id']
      validate_calendar_id!(id, "#{path}: calendar.id")
      name = calendar['name']
      unless name.is_a?(String) && name.present? && name.length <= 255
        raise ConfigurationError, "#{path}: calendar.name must be a non-empty string of at most 255 characters"
      end

      base = calendar['base']
      validate_calendar_id!(base, "#{path}: calendar.base") unless base.nil?
      validate_managed!(calendar['managed'], path) if calendar.key?('managed')
      week_days = normalize_week_days(calendar['non_working_week_days'], path) if calendar.key?('non_working_week_days')

      days = Array(data.fetch('days', []))
      unless data.fetch('days', []).is_a?(Array)
        raise ConfigurationError, "#{path}: days must be an array"
      end
      raise ConfigurationError, "#{path}: days count exceeds #{MAX_DAYS}" if days.size > MAX_DAYS

      normalized_days = {}
      days.each_with_index do |entry, index|
        location = "#{path}: days[#{index}]"
        require_mapping!(entry, location)
        validate_keys!(entry, DAY_KEYS, location)
        date = normalize_date(entry['date'], location)
        raise ConfigurationError, "#{location}: duplicate date #{date.iso8601}" if normalized_days.key?(date)

        day_name = entry['name']
        unless day_name.is_a?(String) && day_name.present? && day_name.length <= 255
          raise ConfigurationError, "#{location}: name must be a non-empty string of at most 255 characters"
        end
        type = entry['type']
        raise ConfigurationError, "#{location}: type must be working or non_working" unless DAY_TYPES.include?(type)

        normalized_days[date] = { name: day_name, type: type }.freeze
      end

      {
        id: id.freeze,
        name: name.freeze,
        base: base&.freeze,
        non_working_week_days: week_days,
        days: normalized_days.freeze,
        path: path.freeze
      }.freeze
    end

    def resolve_calendars(definitions)
      resolved = {}
      resolving = []

      resolve = lambda do |id|
        return resolved[id] if resolved.key?(id)
        if resolving.include?(id)
          cycle = (resolving.drop_while { |entry| entry != id } + [id]).join(' -> ')
          raise ConfigurationError, "calendar base cycle detected: #{cycle}"
        end
        raise ConfigurationError, "calendar base does not exist: #{id}" unless definitions.key?(id)
        raise ConfigurationError, "calendar base depth exceeds #{MAX_BASE_DEPTH}: #{id}" if resolving.size >= MAX_BASE_DEPTH

        definition = definitions.fetch(id)
        resolving << id
        base = definition[:base] ? resolve.call(definition[:base]) : nil
        days = base ? base.days.merge(definition[:days]) : definition[:days]
        if days.size > MAX_DAYS
          raise ConfigurationError, "#{definition[:path]}: resolved days count exceeds #{MAX_DAYS}"
        end
        week_days = definition[:non_working_week_days] || base&.non_working_week_days || @fallback_non_working_week_days
        calendar = RedmineCanvasGantt::BusinessCalendar.new(
          id: id,
          name: definition[:name],
          non_working_week_days: week_days,
          days: days
        )
        resolved[id] = calendar
        resolving.pop
        calendar
      end

      definitions.each_key { |id| resolve.call(id) }
      resolved.freeze
    end

    def validate_calendar_references!(settings, definitions)
      referenced = [settings['default_calendar'], *settings.fetch('project_calendars', {}).values].compact
      missing = referenced.uniq.reject { |id| definitions.key?(id) }
      return if missing.empty?

      raise ConfigurationError, "settings.yml: unknown calendar id(s): #{missing.join(', ')}"
    end

    def load_yaml(path)
      ensure_safe_path!(path)
      size = File.size(path)
      raise ConfigurationError, "#{path}: file exceeds #{MAX_FILE_SIZE} bytes" if size > MAX_FILE_SIZE

      content = File.binread(path)
      content = content.gsub(/^(\s*(?:-\s+)?date\s*:\s*)(\d{4}-\d{2}-\d{2})(\s*(?:#.*)?)$/) do
        "#{Regexp.last_match(1)}\"#{Regexp.last_match(2)}\"#{Regexp.last_match(3)}"
      end
      YAML.safe_load(
        content,
        permitted_classes: [],
        permitted_symbols: [],
        aliases: false,
        filename: path
      ) || {}
    rescue Psych::Exception, Errno::ENOENT, Errno::EACCES => e
      raise ConfigurationError, "#{path}: #{e.message}"
    end

    def calendar_files(include_settings:)
      return [] unless File.directory?(@directory)

      Dir.glob(File.join(@directory, '**', '*')).select { |path| File.symlink?(path) }.each do |path|
        ensure_safe_path!(path)
      end
      pattern = File.join(@directory, '**', '*.{yml,yaml}')
      Dir.glob(pattern, File::FNM_EXTGLOB).sort.filter do |path|
        File.file?(path) && (include_settings || relative_path(path) != 'settings.yml')
      end.tap { |paths| paths.each { |path| ensure_safe_path!(path) } }
    end

    def ensure_safe_path!(path)
      root = File.realpath(@directory)
      resolved = File.realpath(path)
      return if resolved.start_with?("#{root}#{File::SEPARATOR}")

      raise ConfigurationError, "#{path}: symlink resolves outside calendar directory"
    rescue Errno::ENOENT, Errno::EACCES => e
      raise ConfigurationError, "#{path}: #{e.message}"
    end

    def relative_path(path)
      path.delete_prefix("#{@directory}#{File::SEPARATOR}")
    end

    def validate_schema_version!(data, location)
      return if data['schema_version'] == 1

      raise ConfigurationError, "#{location}: schema_version must be 1"
    end

    def validate_keys!(mapping, allowed, location)
      unknown = mapping.keys.reject { |key| key.is_a?(String) && allowed.include?(key) }
      return if unknown.empty?

      raise ConfigurationError, "#{location}: unknown key(s): #{unknown.map(&:inspect).join(', ')}"
    end

    def require_mapping!(value, location)
      return if value.is_a?(Hash)

      raise ConfigurationError, "#{location}: must be a mapping"
    end

    def validate_calendar_id!(value, location)
      return if value.is_a?(String) && CALENDAR_ID_PATTERN.match?(value)

      raise ConfigurationError, "#{location}: must match #{CALENDAR_ID_PATTERN.inspect}"
    end

    def validate_managed!(value, path)
      return if value == true || value == false

      raise ConfigurationError, "#{path}: calendar.managed must be true or false"
    end

    def normalize_week_days(value, path)
      unless value.is_a?(Array) && value.all? { |day| day.is_a?(Integer) && day.between?(1, 7) } && value.uniq.size == value.size
        raise ConfigurationError, "#{path}: calendar.non_working_week_days must contain unique ISO weekdays 1..7"
      end
      if value.size >= 7
        raise ConfigurationError, "#{path}: calendar.non_working_week_days must leave at least one weekly working day"
      end
      value.map { |day| day % 7 }.sort.freeze
    end

    def normalize_fallback_week_days(value)
      normalized = Array(value).filter_map do |day|
        parsed = Integer(day, exception: false)
        parsed % 7 if parsed&.between?(1, 7)
      end.uniq.sort
      (normalized.size >= 7 ? [] : normalized).freeze
    end

    def normalize_date(value, location)
      unless value.is_a?(String) && ISO_DATE_PATTERN.match?(value)
        raise ConfigurationError, "#{location}: date must use YYYY-MM-DD"
      end
      Date.iso8601(value)
    rescue Date::Error
      raise ConfigurationError, "#{location}: date is invalid"
    end
  end
end
