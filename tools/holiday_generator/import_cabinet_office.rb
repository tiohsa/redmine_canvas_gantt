#!/usr/bin/env ruby

require 'date'
require 'fileutils'
require 'optparse'
require 'tempfile'
require 'yaml'

class CabinetOfficeHolidayImporter
  MAX_FILE_SIZE = 1 * 1024 * 1024
  MAX_DAYS = 10_000
  CALENDAR_ID_PATTERN = /\A[A-Za-z0-9_-]{1,64}\z/
  DATE_PATTERN = /\A(\d{4})\/(\d{1,2})\/(\d{1,2})\z/
  HOLIDAY_NAME = 'Japanese public holiday'

  def initialize(input:, output:, calendar_id:, name:, force: false)
    @input_path = File.expand_path(input.to_s)
    @output_path = File.expand_path(output.to_s)
    @calendar_id = calendar_id.to_s
    @name = name.to_s
    @force = force
  end

  def run
    validate_options!
    reject_same_path!
    input = read_input
    days = parse_days(input)
    payload = build_payload(days)
    content = YAML.dump(payload)
    raise ArgumentError, "generated calendar exceeds #{MAX_FILE_SIZE} bytes" if content.bytesize > MAX_FILE_SIZE

    ensure_output_writable!
    write_atomically(content)
    puts "Imported #{days.size} holidays at #{@output_path}"
    @output_path
  end

  private

  def validate_options!
    raise ArgumentError, 'calendar-id must contain only letters, numbers, hyphens, or underscores (maximum 64 characters)' unless CALENDAR_ID_PATTERN.match?(@calendar_id)
    raise ArgumentError, 'name must contain non-whitespace text and be at most 255 characters' unless @name.length <= 255 && !@name.strip.empty?
  end

  def reject_same_path!
    if File.exist?(@input_path) && File.exist?(@output_path) && File.identical?(@input_path, @output_path)
      raise ArgumentError, 'input and output must not resolve to the same path'
    end
    input_real = File.exist?(@input_path) ? File.realpath(@input_path) : @input_path
    output_real = File.exist?(@output_path) ? File.realpath(@output_path) : @output_path
    raise ArgumentError, 'input and output must not resolve to the same path' if input_real == output_real
  end

  def read_input
    raise ArgumentError, "Input does not exist: #{@input_path}" unless File.file?(@input_path)

    size = File.size(@input_path)
    raise ArgumentError, "input exceeds #{MAX_FILE_SIZE} bytes" if size > MAX_FILE_SIZE

    File.binread(@input_path)
  end

  def parse_days(content)
    raise ArgumentError, 'CSV header is missing' if content.empty?

    days_by_date = {}
    content.each_line.with_index do |line, index|
      next if index.zero?

      row_number = index + 1
      line = line.sub(/(?:\r\n|\n|\r)\z/n, '')
      next if line.strip.empty?

      comma = line.index(','.b)
      raise ArgumentError, "row #{row_number} must contain a comma" unless comma

      date_field = line.byteslice(0, comma)
      match = DATE_PATTERN.match(date_field)
      raise ArgumentError, "row #{row_number} has an invalid date format" unless match

      year, month, day = match.captures.map(&:to_i)
      unless year.positive? && Date.valid_date?(year, month, day)
        raise ArgumentError, "row #{row_number} has an invalid date"
      end

      date = Date.new(year, month, day).iso8601
      raise ArgumentError, "duplicate date #{date}" if days_by_date.key?(date)

      days_by_date[date] = {
        'date' => date,
        'name' => HOLIDAY_NAME,
        'type' => 'non_working'
      }
      raise ArgumentError, "generated calendar exceeds #{MAX_DAYS} days" if days_by_date.size > MAX_DAYS
    end

    raise ArgumentError, 'CSV contains no holiday dates' if days_by_date.empty?

    days_by_date.values.sort_by { |entry| entry.fetch('date') }
  end

  def build_payload(days)
    {
      'schema_version' => 1,
      'calendar' => {
        'id' => @calendar_id,
        'name' => @name,
        'non_working_week_days' => [6, 7],
        'managed' => true
      },
      'source' => {
        'provider' => 'cabinet_office_japan'
      },
      'days' => days
    }
  end

  def ensure_output_writable!
    return unless File.exist?(@output_path)
    raise ArgumentError, "Output already exists: #{@output_path} (use --force for a managed calendar)" unless @force

    size = File.size(@output_path)
    raise ArgumentError, "existing output exceeds #{MAX_FILE_SIZE} bytes" if size > MAX_FILE_SIZE

    content = File.binread(@output_path).gsub(/^(\s*(?:-\s+)?date\s*:\s*)(\d{4}-\d{2}-\d{2})(\s*(?:#.*)?)$/) do
      "#{Regexp.last_match(1)}\"#{Regexp.last_match(2)}\"#{Regexp.last_match(3)}"
    end
    existing = YAML.safe_load(
      content,
      permitted_classes: [],
      permitted_symbols: [],
      aliases: false,
      filename: @output_path
    )
    calendar = existing.is_a?(Hash) ? existing['calendar'] : nil
    managed = calendar.is_a?(Hash) && calendar['managed'] == true
    raise ArgumentError, "Refusing to overwrite unmanaged calendar: #{@output_path}" unless managed
  rescue Psych::Exception => e
    raise ArgumentError, "cannot verify existing output: #{e.message}"
  end

  def write_atomically(content)
    FileUtils.mkdir_p(File.dirname(@output_path))
    Tempfile.create(['cabinet-office-calendar-', '.yml'], File.dirname(@output_path)) do |temporary|
      temporary.write(content)
      temporary.flush
      temporary.fsync
      temporary.close
      File.rename(temporary.path, @output_path)
    end
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    options = {}
    parser = OptionParser.new do |opts|
      opts.banner = 'Usage: ruby import_cabinet_office.rb --input CSV --calendar-id ID --name NAME --output PATH [--force]'
      opts.on('--input PATH', 'Cabinet Office syukujitsu.csv file') { |value| options[:input] = value }
      opts.on('--calendar-id ID', 'calendar id') { |value| options[:calendar_id] = value }
      opts.on('--name NAME', 'calendar display name') { |value| options[:name] = value }
      opts.on('--output PATH', 'output YAML path') { |value| options[:output] = value }
      opts.on('--force', 'replace an existing managed calendar') { options[:force] = true }
    end
    parser.parse!
    required = %i[input calendar_id name output]
    missing = required.reject { |key| options[key] }
    abort("Missing required option(s): #{missing.join(', ')}\n#{parser}") unless missing.empty?

    CabinetOfficeHolidayImporter.new(**options).run
  rescue OptionParser::ParseError, ArgumentError, Psych::Exception => e
    abort(e.message)
  end
end
