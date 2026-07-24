#!/usr/bin/env ruby

require 'date'
require 'fileutils'
require 'optparse'
require 'tempfile'
require 'time'
require 'yaml'
require 'holidays'

CALENDAR_ID_PATTERN = /\A[A-Za-z0-9_-]{1,64}\z/

begin
options = {}
parser = OptionParser.new do |opts|
  opts.banner = 'Usage: bundle exec ruby generate.rb --region REGION --calendar-id ID --name NAME --from YEAR --to YEAR --output PATH [--force]'
  opts.on('--region REGION', 'holidays region (for example jp or us)') { |value| options[:region] = value }
  opts.on('--calendar-id ID', 'calendar id') { |value| options[:calendar_id] = value }
  opts.on('--name NAME', 'calendar display name') { |value| options[:name] = value }
  opts.on('--from YEAR', Integer, 'first year') { |value| options[:from] = value }
  opts.on('--to YEAR', Integer, 'last year') { |value| options[:to] = value }
  opts.on('--output PATH', 'output YAML path') { |value| options[:output] = value }
  opts.on('--force', 'replace an existing managed calendar') { options[:force] = true }
end
parser.parse!

required = %i[region calendar_id name from to output]
missing = required.reject { |key| options[key] }
abort("Missing required option(s): #{missing.join(', ')}\n#{parser}") unless missing.empty?
abort('calendar-id must contain only letters, numbers, hyphens, or underscores (maximum 64 characters)') unless CALENDAR_ID_PATTERN.match?(options[:calendar_id])
abort('name must be between 1 and 255 characters') unless options[:name].length.between?(1, 255)
abort('--from must not be later than --to') if options[:from] > options[:to]
abort('year range must be between 1900 and 9999') unless options[:from].between?(1900, 9999) && options[:to].between?(1900, 9999)

output_path = File.expand_path(options[:output])

if File.exist?(output_path)
  abort("Output already exists: #{output_path} (use --force for a managed calendar)") unless options[:force]

  content = File.binread(output_path).gsub(/^(\s*(?:-\s+)?date\s*:\s*)(\d{4}-\d{2}-\d{2})(\s*(?:#.*)?)$/) do
    "#{Regexp.last_match(1)}\"#{Regexp.last_match(2)}\"#{Regexp.last_match(3)}"
  end
  existing = YAML.safe_load(
    content,
    permitted_classes: [],
    permitted_symbols: [],
    aliases: false,
    filename: output_path
  )
  managed = existing.is_a?(Hash) && existing.dig('calendar', 'managed') == true
  abort("Refusing to overwrite unmanaged calendar: #{output_path}") unless managed
end

region = options[:region].downcase.to_sym
abort("Unsupported holidays region: #{options[:region]}") unless Holidays.available_regions.include?(region)
from_date = Date.new(options[:from], 1, 1)
to_date = Date.new(options[:to], 12, 31)
days = Holidays.between(from_date, to_date, region).map do |holiday|
  {
    'date' => holiday.fetch(:date).iso8601,
    'name' => holiday.fetch(:name).to_s,
    'type' => 'non_working'
  }
end.sort_by { |day| day.fetch('date') }
abort('Generated calendar exceeds the runtime limit of 10,000 days') if days.size > 10_000

payload = {
  'schema_version' => 1,
  'calendar' => {
    'id' => options[:calendar_id],
    'name' => options[:name],
    'non_working_week_days' => [6, 7],
    'managed' => true
  },
  'source' => {
    'provider' => 'holidays/holidays',
    'package_version' => Gem.loaded_specs.fetch('holidays').version.to_s,
    'generated_at' => Time.now.utc.iso8601,
    'region' => options[:region].downcase,
    'years' => {
      'from' => options[:from],
      'to' => options[:to]
    }
  },
  'days' => days
}

FileUtils.mkdir_p(File.dirname(output_path))
Tempfile.create(['business-calendar-', '.yml'], File.dirname(output_path)) do |temporary|
  temporary.write(YAML.dump(payload))
  temporary.flush
  temporary.fsync
  temporary.close
  File.rename(temporary.path, output_path)
end

puts "Generated #{days.size} holidays at #{output_path}"
rescue OptionParser::ParseError, Psych::Exception, KeyError => e
  abort(e.message)
end
