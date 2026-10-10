require 'tmpdir'
require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/business_calendar_loader'
require_relative '../../../lib/redmine_canvas_gantt/project_calendar_resolver'

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

  it 'loads a single global holiday CSV with Redmine weekdays and no project mapping' do
    write('holiday.csv', "任意のヘッダー,任意の列名\n2026/1/1,元日,working,ignored\n2026/09/22,休日,anything\n".encode(Encoding::Windows_31J))
    write('settings.csv', "ignored,legacy\n")
    write('calendars.csv', "also,ignored\n")
    write('project_calendars.csv', "ignored,too\n")

    snapshot = loader(fallback: [3, 7]).load
    calendar = snapshot.calendars.fetch('global')

    expect(snapshot.default_calendar_id).to eq('global')
    expect(snapshot.project_calendars).to eq({})
    expect(snapshot.calendars.keys).to eq(['global'])
    expect(calendar.name).to eq('Global holidays')
    expect(calendar.non_working_week_days).to eq([0, 3])
    expect(calendar.day_info(Date.new(2026, 1, 1))).to include(type: 'non_working', source: 'override')
    expect(calendar.day_info(Date.new(2026, 9, 22))).to include(type: 'non_working', source: 'override')
    expect(calendar.day_info(Date.new(2026, 1, 4))).to include(type: 'non_working', source: 'weekly')
  end

  it 'loads the YAML-only CI fixture with a valid US inheritance and company holiday' do
    directory = File.expand_path('../../../spa/tests/e2e-redmine/fixtures/business_calendars', __dir__)
    snapshot = loader(directory: directory).load
    company = snapshot.calendars.fetch('company-us')

    expect(snapshot.status).to eq('ok')
    expect(snapshot.default_calendar_id).to eq('company-us')
    expect(company.day_info(Date.new(2027, 8, 12))).to include(
      name: 'Company summer holiday', type: 'non_working', source: 'override'
    )
    expect(company.day_info(Date.new(2027, 7, 4))).to include(
      name: 'Independence Day', type: 'non_working'
    )
  end

  it 'resolves the dedicated CSV fixture as one global calendar for multiple projects' do
    directory = File.expand_path('../../../spa/tests/e2e-redmine/fixtures/business_calendars_csv', __dir__)
    snapshot = loader(directory: directory).load
    repository = instance_double(RedmineCanvasGantt::BusinessCalendarRepository, snapshot: snapshot)
    resolver = RedmineCanvasGantt::ProjectCalendarResolver.new(
      repository: repository, fallback_non_working_week_days: [6, 7]
    )
    first_project = instance_double(Project, id: 1, identifier: 'first', ancestors: [])
    second_project = instance_double(Project, id: 2, identifier: 'second', ancestors: [])

    expect(snapshot.status).to eq('ok')
    expect(snapshot.default_calendar_id).to eq('global')
    expect(snapshot.project_calendars).to eq({})
    expect(snapshot.calendars.keys).to eq(['global'])
    expect(snapshot.calendars.fetch('global').days.fetch(Date.new(2027, 2, 11))).to eq(
      name: 'Holiday', type: 'non_working'
    )
    payload = resolver.payload(projects: [])
    expect(payload).to include(
      status: 'ok', defaultCalendarId: 'global',
      projectCalendarIds: {}
    )
    expect(payload.fetch(:calendars).fetch('global')).to include(
      id: 'global', nonWorkingWeekDays: [0, 6]
    )
    expect(payload.fetch(:calendars).fetch('global').fetch(:days).fetch('2027-02-11')).to include(
      name: 'Holiday', type: 'non_working'
    )
    # Snapshot assignments are explicit overrides; the public payload reports
    # resolved project IDs, which inherit the default global calendar.
    resolved_payload = resolver.payload(projects: [first_project, second_project])
    expect(resolved_payload.fetch(:projectCalendarIds)).to eq(
      '1' => 'global', '2' => 'global'
    )
    [first_project, second_project].each do |project|
      expect(resolver.calendar_id_for(project)).to eq('global')
      expect(resolver.day_info(Date.new(2027, 2, 11), project: project)).to include(
        name: 'Holiday', type: 'non_working'
      )
    end
  end

  it 'ignores all CSV files except the root holiday.csv' do
    write('settings.csv', "key,value\nschema_version,1\n")
    write('calendars.csv', "id,name,file\nJP,Japan,holidays/jp.csv\n")
    write('project_calendars.csv', "project_identifier,calendar_id\nwork,JP\n")
    write('holidays/jp.csv', "date,name\n2026/1/1,Ignored\n")
    write('holiday.csv', "unread header\n2026/1/2,Holiday\n")

    expect(loader.load.calendars.keys).to eq(['global'])
    expect(loader.load.calendars.fetch('global').days.keys).to eq([Date.new(2026, 1, 2)])
  end

  it 'loads the bundled one-file CSV example' do
    directory = File.expand_path('../../../examples/business_calendars_csv', __dir__)
    snapshot = loader(directory: directory).load

    expect(snapshot.default_calendar_id).to eq('global')
    expect(snapshot.project_calendars).to eq({})
    expect(snapshot.calendars.keys).to eq(['global'])
    expect(snapshot.calendars.fetch('global').days.keys).to include(Date.new(2026, 1, 1))
  end

  it 'rejects malformed, duplicate, invalid, empty, and excessive holiday dates' do
    write('holiday.csv', "header\n2026-01-01,New Year\n")
    expect { loader.load }.to raise_error(described_class::ConfigurationError, /YYYY\/M\/D/)

    write('holiday.csv', "header\n2026/1/1,New Year\n2026/01/01,duplicate\n")
    expect { loader.load }.to raise_error(described_class::ConfigurationError, /duplicate date/)

    write('holiday.csv', "header\n2026/2/30,Invalid\n")
    expect { loader.load }.to raise_error(described_class::ConfigurationError, /invalid date/)

    write('holiday.csv', "header\n,Missing date\n")
    expect { loader.load }.to raise_error(described_class::ConfigurationError, /first column/)

    write('holiday.csv', "header\n")
    expect { loader.load }.to raise_error(described_class::ConfigurationError, /contains no holidays/)

    write('holiday.csv', "header\n\"2026/1/1,Holiday\n")
    expect { loader.load }.to raise_error(described_class::ConfigurationError)

    rows = (0..10_000).map do |offset|
      date = Date.new(2000, 1, 1) + offset
      "#{date.year}/#{date.month}/#{date.day},Holiday"
    end
    write('holiday.csv', "header\n#{rows.join("\n")}\n")
    expect { loader.load }.to raise_error(described_class::ConfigurationError, /holiday count exceeds/)
  end

  it 'rejects YAML configuration mixed with the root holiday CSV' do
    write('holiday.csv', "header\n2026/1/1,Holiday\n")
    write('settings.yml', "schema_version: 1\n")

    expect { loader.load }.to raise_error(described_class::ConfigurationError, /YAML files cannot be mixed/)
  end

  it 'rejects holiday CSV files larger than one MiB and symlinks outside the root' do
    write('holiday.csv', "header\n#{'x' * described_class::MAX_FILE_SIZE}\n")
    expect { loader.load }.to raise_error(described_class::ConfigurationError, /file exceeds/)

    outside = File.join(File.dirname(@directory), "#{File.basename(@directory)}-outside.csv")
    File.write(outside, "header\n2026/1/1,Holiday\n")
    FileUtils.rm(File.join(@directory, 'holiday.csv'))
    File.symlink(outside, File.join(@directory, 'holiday.csv'))
    expect { loader.load }.to raise_error(described_class::ConfigurationError, /outside calendar directory/)
  ensure
    FileUtils.rm_f(outside) if outside
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
