require 'tmpdir'
require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/business_calendar_loader'

RSpec.describe RedmineCanvasGantt::BusinessCalendarLoader do
  around do |example|
    Dir.mktmpdir('business-calendars') do |directory|
      @directory = directory
      example.run
    end
  end

  def write(relative_path, content)
    path = File.join(@directory, relative_path)
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, content)
    path
  end

  def loader(directory: @directory, fallback: [6, 7])
    described_class.new(directory: directory, fallback_non_working_week_days: fallback)
  end

  def calendar_yaml(id:, name: id, base: nil, week_days: nil, days: [])
    calendar_lines = ["  id: #{id}", "  name: #{name}"]
    calendar_lines << "  base: #{base}" if base
    calendar_lines << "  non_working_week_days: [#{week_days.join(', ')}]" if week_days
    day_lines = days.flat_map do |day|
      [
        "  - date: #{day.fetch(:date)}",
        "    name: #{day.fetch(:name)}",
        "    type: #{day.fetch(:type)}"
      ]
    end
    lines = ["schema_version: 1", 'calendar:'] + calendar_lines
    lines += ['days:'] + day_lines unless days.empty?
    lines.join("\n") + "\n"
  end

  it 'loads recursive calendars, settings, inheritance, and working overrides' do
    write('settings.yml', <<~YAML)
      schema_version: 1
      default_calendar: company-japan
      project_calendars:
        japan-project: company-japan
    YAML
    write('generated/JP.yml', calendar_yaml(
      id: 'JP',
      name: 'Japan',
      week_days: [6, 7],
      days: [{ date: '2027-08-11', name: 'Mountain Day', type: 'non_working' }]
    ))
    write('custom/company-japan.yaml', calendar_yaml(
      id: 'company-japan',
      name: 'Japan Company',
      base: 'JP',
      days: [
        { date: '2027-08-11', name: 'Substitute workday', type: 'working' },
        { date: '2027-08-12', name: 'Summer holiday', type: 'non_working' }
      ]
    ))

    snapshot = loader.load
    calendar = snapshot.calendars.fetch('company-japan')

    expect(snapshot.status).to eq('ok')
    expect(snapshot.default_calendar_id).to eq('company-japan')
    expect(snapshot.project_calendars).to eq('japan-project' => 'company-japan')
    expect(calendar.day_info(Date.new(2027, 8, 11))).to include(type: 'working', source: 'override')
    expect(calendar.day_info(Date.new(2027, 8, 12))).to include(type: 'non_working', source: 'override')
    expect(calendar.day_info(Date.new(2027, 8, 14))).to include(type: 'non_working', source: 'weekly')
    expect(calendar).to be_frozen
    expect(calendar.days).to be_frozen
  end

  it 'uses Redmine weekdays when a calendar and its bases omit weekdays' do
    write('custom.yml', calendar_yaml(id: 'custom', week_days: nil))

    calendar = loader(fallback: [3, 7]).load.calendars.fetch('custom')

    expect(calendar.non_working_week_days).to eq([0, 3])
  end

  it 'treats a missing directory as an empty valid configuration' do
    snapshot = loader(directory: File.join(@directory, 'missing')).load

    expect(snapshot.status).to eq('ok')
    expect(snapshot.calendars).to eq({})
    expect(snapshot.default_calendar_id).to be_nil
  end

  {
    'syntax error' => "schema_version: [\n",
    'unsupported schema' => "schema_version: 2\ncalendar: {}\n",
    'unknown key' => "schema_version: 1\nunknown: true\ncalendar: {}\n"
  }.each do |description, yaml|
    it "rejects #{description}" do
      write('invalid.yml', yaml)

      expect { loader.load }.to raise_error(described_class::ConfigurationError)
    end
  end

  it 'rejects invalid dates and types' do
    write('invalid.yml', calendar_yaml(
      id: 'invalid',
      days: [{ date: '2027-02-30', name: 'Invalid', type: 'holiday' }]
    ))

    expect { loader.load }.to raise_error(described_class::ConfigurationError, /date is invalid/)
  end

  it 'rejects an invalid day type when the date is valid' do
    write('invalid.yml', calendar_yaml(
      id: 'invalid',
      days: [{ date: '2027-02-28', name: 'Invalid', type: 'holiday' }]
    ))

    expect { loader.load }.to raise_error(described_class::ConfigurationError, /type must be working or non_working/)
  end

  it 'rejects calendars with no weekly working day' do
    write('invalid.yml', calendar_yaml(id: 'invalid', week_days: [1, 2, 3, 4, 5, 6, 7]))

    expect { loader.load }.to raise_error(described_class::ConfigurationError, /at least one weekly working day/)
  end

  it 'rejects duplicate calendar ids' do
    write('one.yml', calendar_yaml(id: 'duplicate'))
    write('nested/two.yml', calendar_yaml(id: 'duplicate'))

    expect { loader.load }.to raise_error(described_class::ConfigurationError, /duplicate calendar.id/)
  end

  it 'rejects duplicate dates within a file' do
    write('duplicate.yml', calendar_yaml(
      id: 'duplicate-days',
      days: [
        { date: '2027-01-01', name: 'One', type: 'non_working' },
        { date: '2027-01-01', name: 'Two', type: 'working' }
      ]
    ))

    expect { loader.load }.to raise_error(described_class::ConfigurationError, /duplicate date/)
  end

  it 'rejects missing and cyclic bases' do
    write('missing.yml', calendar_yaml(id: 'missing', base: 'unknown'))
    expect { loader.load }.to raise_error(described_class::ConfigurationError, /does not exist/)

    FileUtils.rm_f(File.join(@directory, 'missing.yml'))
    write('one.yml', calendar_yaml(id: 'one', base: 'two'))
    write('two.yml', calendar_yaml(id: 'two', base: 'one'))
    expect { loader.load }.to raise_error(described_class::ConfigurationError, /cycle/)
  end

  it 'rejects settings references to unknown calendars' do
    write('settings.yml', <<~YAML)
      schema_version: 1
      default_calendar: missing
    YAML

    expect { loader.load }.to raise_error(described_class::ConfigurationError, /unknown calendar/)
  end

  it 'rejects aliases and unsafe object tags' do
    write('alias.yml', <<~YAML)
      schema_version: 1
      calendar: &calendar
        id: alias
        name: Alias
      source: *calendar
    YAML
    expect { loader.load }.to raise_error(described_class::ConfigurationError)

    FileUtils.rm_f(File.join(@directory, 'alias.yml'))
    write('object.yml', "--- !ruby/object:Object {}\n")
    expect { loader.load }.to raise_error(described_class::ConfigurationError)
  end

  it 'rejects a symlink that resolves outside the calendar root' do
    outside = File.join(File.dirname(@directory), "#{File.basename(@directory)}-outside.yml")
    File.write(outside, calendar_yaml(id: 'outside'))
    File.symlink(outside, File.join(@directory, 'outside.yml'))

    expect { loader.load }.to raise_error(described_class::ConfigurationError, /outside calendar directory/)
  ensure
    FileUtils.rm_f(outside) if outside
  end
end
