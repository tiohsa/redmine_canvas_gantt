require 'digest'
require 'csv'
require 'yaml'
require_relative 'business_calendar'

module RedmineCanvasGantt
  class BusinessCalendarLoader
    class ConfigurationError < StandardError
      attr_reader :diagnostic

      def initialize(message, diagnostic: nil)
        super(message)
        @diagnostic = (diagnostic || {
          code: 'INVALID_CONFIGURATION',
          message: 'Calendar configuration is invalid.'
        }).freeze
      end
    end

    MAX_FILE_SIZE = 1 * 1024 * 1024
    MAX_CSV_HOLIDAYS = 10_000
    DIAGNOSTIC_VALUE_MAX_LENGTH = 128
    DIAGNOSTIC_TEXT_MAX_LENGTH = 512
    MAX_CALENDARS = 100
    MAX_DAYS = 10_000
    MAX_BASE_DEPTH = 20
    CALENDAR_ID_PATTERN = /\A[A-Za-z0-9_-]{1,64}\z/
    ISO_DATE_PATTERN = /\A\d{4}-\d{2}-\d{2}\z/
    CSV_DATE_PATTERN = /\A[0-9]{4}\/[0-9]{1,2}\/[0-9]{1,2}\z/
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

      entries = tracked_files.map do |path|
        unless File.exist?(path) || File.symlink?(path)
          next "#{relative_path(path)}:missing"
        end
        size = File.size(path)
        if relative_path(path) == 'holiday.csv'
          if size > MAX_FILE_SIZE
            raise configuration_error("#{path}: file exceeds #{MAX_FILE_SIZE} bytes", file: path)
          end

          [relative_path(path), Digest::SHA256.file(path).hexdigest].join(':')
        else
          stat = File.stat(path)
          [relative_path(path), stat.mtime.to_f, stat.size].join(':')
        end
      end
      Digest::SHA256.hexdigest(entries.join("\n"))
    rescue ConfigurationError
      raise
    rescue SystemCallError => e
      raise configuration_error("#{@directory}: #{e.message}", file: @directory,
                                detail: 'Calendar files could not be inspected.')
    end

    def load(revision: fingerprint)
      unless File.directory?(@directory)
        return snapshot(revision: revision, settings: {}, calendars: {})
      end

      settings = load_settings
      if File.exist?(File.join(@directory, 'holiday.csv')) || File.symlink?(File.join(@directory, 'holiday.csv'))
        settings = { 'default_calendar' => 'global', 'project_calendars' => {}.freeze }.freeze
      end
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

    def configuration_error(message, file: nil, code: 'INVALID_CONFIGURATION', line: nil, value: nil, detail: nil)
      source = file.to_s.b.split(':'.b, 2).first
      safe_file = safe_diagnostic_file(source) if file
      safe_message_bytes = (detail || (value.nil? ? message : 'Calendar configuration value is invalid.')).to_s.b
      unless source.empty?
        replacement = safe_file || 'calendar file'
        safe_message_bytes = safe_message_bytes.gsub(source, replacement.b)
      end
      directory_bytes = @directory.to_s.b
      safe_message_bytes = safe_message_bytes.gsub(directory_bytes, ''.b)
      safe_message = sanitize_diagnostic_text(safe_message_bytes, max_length: DIAGNOSTIC_TEXT_MAX_LENGTH)
      error_message_bytes = if detail || !value.nil?
                              location = [safe_file, ("line #{line}" if line)].compact.join(': ')
                              location.empty? ? safe_message_bytes : "#{location}: ".b + safe_message_bytes
                            else
                              safe_message_bytes
                            end
      diagnostic = {
        code: sanitize_diagnostic_text(code, max_length: 128),
        file: safe_file && sanitize_diagnostic_text(safe_file, max_length: 128),
        line: line,
        message: safe_message
      }
      diagnostic[:value] = sanitize_diagnostic_text(value, max_length: DIAGNOSTIC_VALUE_MAX_LENGTH) unless value.nil?
      ConfigurationError.new(
        sanitize_diagnostic_text(error_message_bytes, max_length: DIAGNOSTIC_TEXT_MAX_LENGTH),
        diagnostic: diagnostic.compact
      )
    end

    def safe_diagnostic_file(source)
      return if source.empty?

      source_text = source.dup.force_encoding(Encoding::UTF_8)
      return unless source_text.valid_encoding?

      absolute = File.expand_path(source_text, @directory)
      relative = absolute.delete_prefix("#{@directory}#{File::SEPARATOR}")
      return if relative == absolute || relative.empty?
      return if relative.include?("\\")
      return if relative.split(File::SEPARATOR).any? { |part| part.empty? || part == '.' || part == '..' }
      return unless %w[.csv .yml .yaml].include?(File.extname(relative))
      return if relative.bytesize > 128

      root = File.realpath(@directory)
      target = File.exist?(absolute) || File.symlink?(absolute) ? absolute : File.dirname(absolute)
      resolved = File.realpath(target)
      return unless resolved.start_with?("#{root}#{File::SEPARATOR}")
      relative
    rescue ArgumentError, EncodingError, SystemCallError
      nil
    end

    def sanitize_diagnostic_text(value, max_length:)
      text = value.to_s.dup
      normalized = if text.encoding == Encoding::BINARY
                     text.force_encoding(Encoding::UTF_8).scrub("\uFFFD")
                   else
                     text.encode(Encoding::UTF_8, invalid: :replace, undef: :replace, replace: "\uFFFD")
                   end
      normalized.each_char.take(max_length).join.freeze
    rescue EncodingError
      value.to_s.b.force_encoding(Encoding::BINARY).encode(
        Encoding::UTF_8, invalid: :replace, undef: :replace, replace: "\uFFFD"
      ).each_char.take(max_length).join.freeze
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
          raise configuration_error("#{path}: project_calendars contains an invalid project identifier", file: path)
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
      holiday_path = File.join(@directory, 'holiday.csv')
      if File.exist?(holiday_path) || File.symlink?(holiday_path)
        yaml_files = calendar_files(include_settings: true)
        unless yaml_files.empty?
          raise configuration_error("#{yaml_files.first}: YAML files cannot be mixed with holiday.csv", file: yaml_files.first)
        end
        definitions['global'] = load_csv_calendar(holiday_path)
        return definitions.freeze
      end

      files = calendar_files(include_settings: false)
      if files.size > MAX_CALENDARS
        raise configuration_error("#{@directory}: calendar count exceeds #{MAX_CALENDARS}", file: @directory)
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
          raise configuration_error("#{path}: duplicate calendar.id #{id.inspect}", file: path, value: id,
                                    detail: 'duplicate calendar.id.')
        end

        definitions[id] = definition
      end
      definitions.freeze
    end

    def load_csv_calendar(path)
      ensure_safe_path!(path)
      unless File.file?(path)
        raise configuration_error("#{path}: must be a regular file", file: path)
      end
      size = File.size(path)
      raise configuration_error("#{path}: file exceeds #{MAX_FILE_SIZE} bytes", file: path) if size > MAX_FILE_SIZE

      days = {}
      records = 0
      # Holiday names and headers are ignored, so the CSV can be parsed as
      # bytes. The only interpreted field is an ASCII date in column one.
      content = File.binread(path).force_encoding(Encoding::ASCII_8BIT)
      CSV.parse(content).each_with_index do |row, index|
        next if index.zero? # The first row is the required header.
        next if row.empty?

        date_value = row[0]
        if date_value.nil? || date_value.empty?
          raise configuration_error("#{path}: row #{index + 1}: first column must contain a date",
                                    file: path, code: 'INVALID_DATE', line: index + 1,
                                    detail: 'The first column must contain a date.')
        end
        unless CSV_DATE_PATTERN.match?(date_value)
          raise configuration_error("#{path}: row #{index + 1}: date must use YYYY/M/D",
                                    file: path, code: 'INVALID_DATE', line: index + 1,
                                    value: date_value, detail: 'Date must use YYYY/M/D.')
        end

        year, month, day = date_value.split('/').map(&:to_i)
        date = Date.new(year, month, day)
        if days.key?(date)
          raise configuration_error("#{path}: row #{index + 1}: duplicate date #{date.iso8601}",
                                    file: path, code: 'DUPLICATE_DATE', line: index + 1,
                                    value: date_value, detail: 'duplicate date.')
        end
        records += 1
        if records > MAX_CSV_HOLIDAYS
          raise configuration_error("#{path}: holiday count exceeds #{MAX_CSV_HOLIDAYS}", file: path, line: index + 1)
        end

        days[date] = { name: 'Holiday'.freeze, type: 'non_working'.freeze }.freeze
      rescue Date::Error, ArgumentError => e
        raise configuration_error("#{path}: row #{index + 1}: invalid date (#{date_value}: #{e.message})",
                                  file: path, code: 'INVALID_DATE', line: index + 1,
                                  value: date_value, detail: 'date is invalid (invalid date).')
      end
      raise configuration_error("#{path}: contains no holidays", file: path, code: 'EMPTY_CSV') if days.empty?

      {
        id: 'global'.freeze,
        name: 'Global holidays'.freeze,
        base: nil,
        non_working_week_days: nil,
        days: days.freeze,
        path: path.freeze
      }.freeze
    rescue ConfigurationError
      raise
    rescue CSV::MalformedCSVError, EncodingError, IOError, SystemCallError => e
      raise configuration_error("#{path}: #{e.message}", file: path, code: 'INVALID_CSV',
                                line: e.respond_to?(:line_number) ? e.line_number : nil,
                                detail: 'The holiday CSV could not be parsed.')
    end

    def normalize_calendar(data, path)
      calendar = data['calendar']
      require_mapping!(calendar, "#{path}: calendar")
      validate_keys!(calendar, CALENDAR_KEYS, "#{path}: calendar")

      id = calendar['id']
      validate_calendar_id!(id, "#{path}: calendar.id")
      name = calendar['name']
      unless name.is_a?(String) && name.present? && name.length <= 255
        raise configuration_error("#{path}: calendar.name must be a non-empty string of at most 255 characters", file: path)
      end

      base = calendar['base']
      validate_calendar_id!(base, "#{path}: calendar.base") unless base.nil?
      validate_managed!(calendar['managed'], path) if calendar.key?('managed')
      week_days = normalize_week_days(calendar['non_working_week_days'], path) if calendar.key?('non_working_week_days')

      days = Array(data.fetch('days', []))
      unless data.fetch('days', []).is_a?(Array)
        raise configuration_error("#{path}: days must be an array", file: path)
      end
      raise configuration_error("#{path}: days count exceeds #{MAX_DAYS}", file: path) if days.size > MAX_DAYS

      normalized_days = {}
      days.each_with_index do |entry, index|
        location = "#{path}: days[#{index}]"
        require_mapping!(entry, location)
        validate_keys!(entry, DAY_KEYS, location)
        date = normalize_date(entry['date'], location)
        if normalized_days.key?(date)
          raise configuration_error("#{location}: duplicate date #{date.iso8601}", file: path,
                                    code: 'DUPLICATE_DATE', value: date.to_s, detail: 'duplicate date.')
        end

        day_name = entry['name']
        unless day_name.is_a?(String) && day_name.present? && day_name.length <= 255
          raise configuration_error("#{location}: name must be a non-empty string of at most 255 characters", file: path)
        end
        type = entry['type']
        raise configuration_error("#{location}: type must be working or non_working", file: path) unless DAY_TYPES.include?(type)

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
        definition = definitions[id]
        source_path = definition&.fetch(:path, nil) || definitions[resolving.last]&.fetch(:path, nil)
        if resolving.include?(id)
          cycle = (resolving.drop_while { |entry| entry != id } + [id]).join(' -> ')
          raise configuration_error("calendar base cycle detected: #{cycle}", file: source_path, value: cycle,
                                    detail: 'calendar base cycle detected.')
        end
        unless definition
          raise configuration_error("calendar base does not exist: #{id}", file: source_path,
                                    code: 'UNKNOWN_CALENDAR_ID', value: id,
                                    detail: 'calendar base does not exist.')
        end
        if resolving.size >= MAX_BASE_DEPTH
          raise configuration_error("calendar base depth exceeds #{MAX_BASE_DEPTH}: #{id}", file: definition[:path],
                                    value: id, detail: 'Calendar base depth limit was exceeded.')
        end

        resolving << id
        base = definition[:base] ? resolve.call(definition[:base]) : nil
        days = base ? base.days.merge(definition[:days]) : definition[:days]
        if days.size > MAX_DAYS
          raise configuration_error("#{definition[:path]}: resolved days count exceeds #{MAX_DAYS}", file: definition[:path])
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

      raise configuration_error("settings.yml: unknown calendar id(s): #{missing.join(', ')}",
                                file: File.join(@directory, 'settings.yml'), code: 'UNKNOWN_CALENDAR_ID',
                                value: missing.join(', '),
                                detail: 'A referenced calendar ID does not exist (unknown calendar).')
    end

    def load_yaml(path)
      ensure_safe_path!(path)
      size = File.size(path)
      raise configuration_error("#{path}: file exceeds #{MAX_FILE_SIZE} bytes", file: path) if size > MAX_FILE_SIZE

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
    rescue Psych::SyntaxError => e
      raise configuration_error("#{path}: #{e.problem}", file: path, code: 'YAML_SYNTAX',
                                line: e.line, detail: e.problem)
    rescue Psych::Exception, Errno::ENOENT, Errno::EACCES => e
      raise configuration_error("#{path}: #{e.message}", file: path, detail: 'Calendar file could not be read.')
    end

    def calendar_files(include_settings:)
      return [] unless File.directory?(@directory)

      Dir.glob(File.join(@directory, '**', '*.{yml,yaml}'), File::FNM_EXTGLOB).select { |path| File.symlink?(path) }.each do |path|
        ensure_safe_path!(path)
      end
      pattern = File.join(@directory, '**', '*.{yml,yaml}')
      Dir.glob(pattern, File::FNM_EXTGLOB).sort.filter do |path|
        File.file?(path) && (include_settings || relative_path(path) != 'settings.yml')
      end.tap { |paths| paths.each { |path| ensure_safe_path!(path) } }
    end

    def tracked_files
      files = calendar_files(include_settings: true)
      holiday_path = File.join(@directory, 'holiday.csv')
      if File.exist?(holiday_path) || File.symlink?(holiday_path)
        ensure_safe_path!(holiday_path)
        files << holiday_path
      end
      files.uniq.sort
    end

    def ensure_safe_path!(path)
      root = File.realpath(@directory)
      resolved = File.realpath(path)
      return if resolved.start_with?("#{root}#{File::SEPARATOR}")

      raise configuration_error("#{path}: symlink resolves outside calendar directory", file: path)
    rescue Errno::ENOENT, Errno::EACCES => e
      raise configuration_error("#{path}: #{e.message}", file: path, detail: 'Calendar path could not be resolved safely.')
    end

    def relative_path(path)
      path.delete_prefix("#{@directory}#{File::SEPARATOR}")
    end

    def validate_schema_version!(data, location)
      return if data['schema_version'] == 1

      raise configuration_error("#{location}: schema_version must be 1", file: location)
    end

    def validate_keys!(mapping, allowed, location)
      unknown = mapping.keys.reject { |key| key.is_a?(String) && allowed.include?(key) }
      return if unknown.empty?

      raise configuration_error("#{location}: unknown key(s): #{unknown.map(&:inspect).join(', ')}", file: location)
    end

    def require_mapping!(value, location)
      return if value.is_a?(Hash)

      raise configuration_error("#{location}: must be a mapping", file: location)
    end

    def validate_calendar_id!(value, location)
      return if value.is_a?(String) && CALENDAR_ID_PATTERN.match?(value)

      raise configuration_error("#{location}: must match #{CALENDAR_ID_PATTERN.inspect}", file: location)
    end

    def validate_managed!(value, path)
      return if value == true || value == false

      raise configuration_error("#{path}: calendar.managed must be true or false", file: path)
    end

    def normalize_week_days(value, path)
      unless value.is_a?(Array) && value.all? { |day| day.is_a?(Integer) && day.between?(1, 7) } && value.uniq.size == value.size
        raise configuration_error("#{path}: calendar.non_working_week_days must contain unique ISO weekdays 1..7", file: path)
      end
      if value.size >= 7
        raise configuration_error("#{path}: calendar.non_working_week_days must leave at least one weekly working day", file: path)
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
        raise configuration_error("#{location}: date must use YYYY-MM-DD", file: location, code: 'INVALID_DATE',
                                  value: value, detail: 'date must use YYYY-MM-DD.')
      end
      Date.iso8601(value)
    rescue Date::Error
      raise configuration_error("#{location}: date is invalid", file: location, code: 'INVALID_DATE',
                                value: value, detail: 'date is invalid.')
    end
  end
end
