require 'tmpdir'
require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/business_calendar_repository'

RSpec.describe RedmineCanvasGantt::BusinessCalendarRepository do
  around do |example|
    Dir.mktmpdir('business-calendar-repository') do |directory|
      @directory = directory
      example.run
    end
  end

  def write_calendar(name: 'Calendar', type: 'non_working')
    File.write(File.join(@directory, 'calendar.yml'), <<~YAML)
      schema_version: 1
      calendar:
        id: test
        name: #{name}
      days:
        - date: 2027-01-04
          name: Special day
          type: #{type}
    YAML
  end

  def repository(clock:)
    loader = RedmineCanvasGantt::BusinessCalendarLoader.new(
      directory: @directory,
      fallback_non_working_week_days: [6, 7]
    )
    described_class.send(:new, loader: loader, reload_interval: 0, clock: -> { clock.fetch(:now) }, logger: logger)
  end

  let(:logger) { instance_double(Logger, error: nil, warn: nil) }

  it 'reloads changed files and changes revision' do
    clock = { now: 0.0 }
    write_calendar(name: 'Before')
    subject_repository = repository(clock: clock)
    before = subject_repository.snapshot

    clock[:now] = 1.0
    write_calendar(name: 'After change')
    after = subject_repository.snapshot

    expect(after.revision).not_to eq(before.revision)
    expect(after.calendars.fetch('test').name).to eq('After change')
  end

  it 'reloads global holiday CSV changes and removes dates deleted from the file' do
    clock = { now: 0.0 }
    csv_path = File.join(@directory, 'holiday.csv')
    File.write(csv_path, "header\n2027/1/1,Ignored name\n2027/1/2,Also ignored\n")
    subject_repository = repository(clock: clock)
    before = subject_repository.snapshot
    expect(before.calendars.fetch('global').days.keys).to contain_exactly(Date.new(2027, 1, 1), Date.new(2027, 1, 2))

    clock[:now] = 1.0
    File.write(csv_path, "different header\n2027/1/1,Renamed\n")
    after = subject_repository.snapshot

    expect(after.revision).not_to eq(before.revision)
    expect(after.calendars.fetch('global').days.keys).to eq([Date.new(2027, 1, 1)])
  end

  it 'detects same-size CSV content changes after the mtime is restored' do
    clock = { now: 0.0 }
    csv_path = File.join(@directory, 'holiday.csv')
    File.write(csv_path, "header\n2027/1/1,Holiday\n")
    subject_repository = repository(clock: clock)
    before = subject_repository.snapshot
    original_mtime = File.mtime(csv_path)
    original_size = File.size(csv_path)

    File.write(csv_path, "header\n2027/1/2,Holiday\n")
    expect(File.size(csv_path)).to eq(original_size)
    File.utime(original_mtime, original_mtime, csv_path)
    expect(File.mtime(csv_path)).to eq(original_mtime)
    clock[:now] = 1.0
    after = subject_repository.snapshot

    expect(after.revision).not_to eq(before.revision)
    expect(after.calendars.fetch('global').days.keys).to eq([Date.new(2027, 1, 2)])
  end

  it 'retains the previous snapshot for invalid CSV and recovers when corrected' do
    clock = { now: 0.0 }
    csv_path = File.join(@directory, 'holiday.csv')
    File.write(csv_path, "header\n2027/1/1,Holiday\n")
    subject_repository = repository(clock: clock)
    valid = subject_repository.snapshot

    clock[:now] = 1.0
    File.write(csv_path, "header\n2027/2/30,Invalid\n")
    expect(subject_repository.snapshot).to equal(valid)
    expect(subject_repository.validation_state).to include(
      validation_status: 'stale',
      diagnostic: include(code: 'INVALID_DATE', file: 'holiday.csv', line: 2, value: '2027/2/30')
    )
    expect(logger).to have_received(:warn).with(/invalid date/)

    clock[:now] = 2.0
    File.write(csv_path, "new header\n2027/1/2,Holiday\n")
    recovered = subject_repository.snapshot
    expect(recovered).not_to equal(valid)
    expect(recovered.calendars.fetch('global').days.keys).to eq([Date.new(2027, 1, 2)])
    expect(subject_repository.validation_state).to include(validation_status: 'valid', diagnostic: nil)
  end

  it 'keeps an initial invalid CSV on fallback and records an invalid diagnostic across repeated checks' do
    clock = { now: 0.0 }
    File.write(File.join(@directory, 'holiday.csv'), "header\n2027/2/30,Invalid\n")
    subject_repository = repository(clock: clock)

    fallback = subject_repository.snapshot
    expect(fallback.status).to eq('error')
    expect(fallback.calendars).to be_empty
    expect(subject_repository.validation_state).to include(
      snapshot: fallback,
      validation_status: 'invalid',
      diagnostic: include(code: 'INVALID_DATE', file: 'holiday.csv', line: 2, value: '2027/2/30')
    )

    clock[:now] = 1.0
    expect(subject_repository.snapshot).to equal(fallback)
    expect(subject_repository.validation_state[:validation_status]).to eq('invalid')
  end

  it 'reports YAML syntax and unknown calendar reference diagnostics with safe filenames' do
    clock = { now: 0.0 }
    File.write(File.join(@directory, 'calendar.yml'), "schema_version: 1\ncalendar: [broken\n")
    subject_repository = repository(clock: clock)
    subject_repository.snapshot
    expect(subject_repository.validation_state[:diagnostic]).to include(
      code: 'YAML_SYNTAX', file: 'calendar.yml', line: 2
    )
    expect(subject_repository.validation_state[:diagnostic][:message]).not_to include(@directory)

    FileUtils.rm(File.join(@directory, 'calendar.yml'))
    File.write(File.join(@directory, 'settings.yml'), "schema_version: 1\ndefault_calendar: missing\n")
    clock[:now] = 1.0
    subject_repository.snapshot
    expect(subject_repository.validation_state[:diagnostic]).to include(
      code: 'UNKNOWN_CALENDAR_ID', file: 'settings.yml', value: 'missing'
    )
  end

  it 'clears the latest failure when the accepted fingerprint is restored' do
    clock = { now: 0.0 }
    csv_path = File.join(@directory, 'holiday.csv')
    valid_content = "header\n2027/1/1,Holiday\n"
    File.write(csv_path, valid_content)
    valid_mtime = File.mtime(csv_path)
    subject_repository = repository(clock: clock)
    valid = subject_repository.snapshot

    File.write(csv_path, "header\n2027/2/30,Invalid\n")
    clock[:now] = 1.0
    expect(subject_repository.snapshot).to equal(valid)
    expect(subject_repository.validation_state[:validation_status]).to eq('stale')

    File.write(csv_path, valid_content)
    File.utime(valid_mtime, valid_mtime, csv_path)
    clock[:now] = 2.0
    expect(subject_repository.snapshot).to equal(valid)
    expect(subject_repository.validation_state).to include(validation_status: 'valid', diagnostic: nil)
  end

  it 'retains the valid snapshot for duplicate, oversized, and escaping-symlink CSV reloads' do
    clock = { now: 0.0 }
    csv_path = File.join(@directory, 'holiday.csv')
    File.write(csv_path, "header\n2027/1/1,Holiday\n")
    subject_repository = repository(clock: clock)
    valid = subject_repository.snapshot

    ["header\n2027/1/2,Holiday\n2027/1/2,Duplicate\n",
     "header\n#{'x' * RedmineCanvasGantt::BusinessCalendarLoader::MAX_FILE_SIZE}\n"].each_with_index do |content, index|
      File.write(csv_path, content)
      clock[:now] = index + 1.0
      expect(subject_repository.snapshot).to equal(valid)
    end

    outside = File.join(File.dirname(@directory), "#{File.basename(@directory)}-outside.csv")
    File.write(outside, "header\n2027/1/2,Holiday\n")
    FileUtils.rm(csv_path)
    File.symlink(outside, csv_path)
    clock[:now] = 3.0

    expect(subject_repository.snapshot).to equal(valid)
    expect(logger).to have_received(:warn).with(/reload failed/).at_least(:once)
  ensure
    FileUtils.rm_f(outside) if outside
  end

  it 'reloads to weekday fallback when holiday.csv is deleted and can recover when it returns' do
    clock = { now: 0.0 }
    csv_path = File.join(@directory, 'holiday.csv')
    File.write(csv_path, "header\n2027/1/1,Holiday\n")
    subject_repository = repository(clock: clock)
    csv_snapshot = subject_repository.snapshot
    expect(csv_snapshot.default_calendar_id).to eq('global')

    clock[:now] = 1.0
    FileUtils.rm(csv_path)
    fallback = subject_repository.snapshot
    expect(fallback).not_to equal(csv_snapshot)
    expect(fallback.calendars).to eq({})
    expect(fallback.default_calendar_id).to be_nil

    clock[:now] = 2.0
    File.write(csv_path, "header\n2027/1/3,Holiday\n")
    recovered = subject_repository.snapshot
    expect(recovered).not_to equal(fallback)
    expect(recovered.calendars.fetch('global').days.keys).to eq([Date.new(2027, 1, 3)])
  end

  it 'rejects mixed YAML configuration and ignores other CSV files' do
    clock = { now: 0.0 }
    csv_path = File.join(@directory, 'holiday.csv')
    File.write(csv_path, "header\n2027/1/1,Holiday\n")
    subject_repository = repository(clock: clock)
    valid = subject_repository.snapshot

    File.write(File.join(@directory, 'settings.csv'), "nonsense\n")
    File.write(File.join(@directory, 'calendars.csv'), "nonsense\n")
    File.write(File.join(@directory, 'project_calendars.csv'), "nonsense\n")
    File.write(File.join(@directory, 'unreferenced.csv'), "nonsense\n")
    clock[:now] = 1.0
    expect(subject_repository.snapshot).to equal(valid)

    clock[:now] = 2.0
    File.write(File.join(@directory, 'calendar.yml'), <<~YAML)
      schema_version: 1
      calendar:
        id: extra
        name: Extra
    YAML
    expect(subject_repository.snapshot).to equal(valid)

    clock[:now] = 3.0
    FileUtils.rm(File.join(@directory, 'calendar.yml'))
    expect(subject_repository.snapshot).to equal(valid)
  end

  it 'retains the last valid snapshot when holiday.csv becomes an escaping symlink' do
    clock = { now: 0.0 }
    csv_path = File.join(@directory, 'holiday.csv')
    File.write(csv_path, "header\n2027/1/1,Holiday\n")
    subject_repository = repository(clock: clock)
    valid = subject_repository.snapshot
    outside = File.join(File.dirname(@directory), "#{File.basename(@directory)}-outside.csv")
    File.write(outside, "header\n2027/1/1,Holiday\n")

    FileUtils.rm(csv_path)
    File.symlink(outside, csv_path)
    clock[:now] = 1.0
    retained = subject_repository.snapshot

    expect(retained).to equal(valid)
    expect(logger).to have_received(:warn).with(/outside calendar directory/)
  ensure
    FileUtils.rm_f(outside) if outside
  end

  it 'changes revision when only file mtime changes' do
    clock = { now: 0.0 }
    write_calendar(name: 'Same')
    subject_repository = repository(clock: clock)
    before = subject_repository.snapshot

    path = File.join(@directory, 'calendar.yml')
    changed_time = File.mtime(path) + 5
    File.utime(changed_time, changed_time, path)
    clock[:now] = 1.0
    after = subject_repository.snapshot

    expect(after.revision).not_to eq(before.revision)
  end

  it 'keeps the last valid snapshot when reload validation fails' do
    clock = { now: 0.0 }
    write_calendar(name: 'Valid')
    subject_repository = repository(clock: clock)
    valid = subject_repository.snapshot

    clock[:now] = 1.0
    File.write(File.join(@directory, 'calendar.yml'), "schema_version: [\n")
    retained = subject_repository.snapshot

    expect(retained).to equal(valid)
    expect(logger).to have_received(:warn).with(/reload failed/)
  end

  it 'returns an error snapshot when the initial load is invalid' do
    File.write(File.join(@directory, 'calendar.yml'), "schema_version: [\n")
    clock = { now: 0.0 }

    snapshot = repository(clock: clock).snapshot

    expect(snapshot.status).to eq('error')
    expect(snapshot.error).to include('calendar.yml')
    expect(logger).to have_received(:error).with(/load failed/)
  end

  it 'uses the default reload interval for invalid and negative values' do
    loader = instance_double(RedmineCanvasGantt::BusinessCalendarLoader)

    invalid = described_class.send(:new, loader: loader, reload_interval: 'invalid')
    negative = described_class.send(:new, loader: loader, reload_interval: '-1')

    expect(invalid.instance_variable_get(:@reload_interval)).to eq(described_class::DEFAULT_RELOAD_INTERVAL)
    expect(negative.instance_variable_get(:@reload_interval)).to eq(described_class::DEFAULT_RELOAD_INTERVAL)
  end
end
