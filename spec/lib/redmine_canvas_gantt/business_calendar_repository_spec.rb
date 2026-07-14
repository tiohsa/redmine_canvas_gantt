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
