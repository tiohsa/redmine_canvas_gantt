require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/project_calendar_resolver'
require 'json'

RSpec.describe RedmineCanvasGantt::ProjectCalendarResolver do
  def calendar(id, non_working_week_days: [0, 6], days: {})
    RedmineCanvasGantt::BusinessCalendar.new(
      id: id,
      name: id,
      non_working_week_days: non_working_week_days,
      days: days
    )
  end

  def snapshot(default: nil, assignments: {}, calendars: {})
    RedmineCanvasGantt::BusinessCalendarSnapshot.new(
      status: 'ok',
      revision: 'revision',
      default_calendar_id: default,
      project_calendars: assignments,
      calendars: calendars
    )
  end

  it 'resolves direct, nearest parent, and default assignments' do
    calendars = { 'direct' => calendar('direct'), 'parent' => calendar('parent'), 'default' => calendar('default') }
    repository = instance_double(
      RedmineCanvasGantt::BusinessCalendarRepository,
      snapshot: snapshot(
        default: 'default',
        assignments: { 'child' => 'direct', 'parent' => 'parent' },
        calendars: calendars
      )
    )
    resolver = described_class.new(repository: repository, fallback_non_working_week_days: [6, 7])
    parent = instance_double(Project, id: 2, identifier: 'parent')
    direct = instance_double(Project, id: 3, identifier: 'child', ancestors: [parent])
    inherited = instance_double(Project, id: 4, identifier: 'inherited', ancestors: [parent])
    root = instance_double(Project, id: 5, identifier: 'root', ancestors: [])

    expect(resolver.calendar_id_for(direct)).to eq('direct')
    expect(resolver.calendar_id_for(inherited)).to eq('parent')
    expect(resolver.calendar_id_for(root)).to eq('default')
  end

  it 'uses explicit working days over holidays and weekends' do
    workday = Date.new(2027, 1, 3)
    custom = calendar(
      'custom',
      days: { workday => { name: 'Substitute workday', type: 'working' } }
    )
    repository = instance_double(
      RedmineCanvasGantt::BusinessCalendarRepository,
      snapshot: snapshot(default: 'custom', calendars: { 'custom' => custom })
    )
    resolver = described_class.new(repository: repository, fallback_non_working_week_days: [6, 7])
    project = instance_double(Project, id: 1, identifier: 'project', ancestors: [])

    expect(resolver.working_day?(workday, project: project)).to be(true)
    expect(resolver.add_working_days(Date.new(2027, 1, 2), 1, project: project)).to eq(workday)
  end

  it 'normalizes dates toward the requested working-day boundary' do
    custom = calendar(
      'custom',
      days: { Date.new(2027, 1, 4) => { name: 'Company holiday', type: 'non_working' } }
    )
    repository = instance_double(
      RedmineCanvasGantt::BusinessCalendarRepository,
      snapshot: snapshot(default: 'custom', calendars: { 'custom' => custom })
    )
    resolver = described_class.new(repository: repository, fallback_non_working_week_days: [6, 7])
    project = instance_double(Project, id: 1, identifier: 'project', ancestors: [])

    expect(resolver.next_working_day(Date.new(2027, 1, 4), project: project)).to eq(Date.new(2027, 1, 5))
    expect(resolver.previous_working_day(Date.new(2027, 1, 4), project: project)).to eq(Date.new(2027, 1, 1))
  end

  it 'rejects interval normalization when working-day correction would invert the range' do
    custom = calendar(
      'custom',
      days: { Date.new(2027, 1, 4) => { name: 'Company holiday', type: 'non_working' } }
    )
    repository = instance_double(
      RedmineCanvasGantt::BusinessCalendarRepository,
      snapshot: snapshot(default: 'custom', calendars: { 'custom' => custom })
    )
    resolver = described_class.new(repository: repository, fallback_non_working_week_days: [6, 7])
    project = instance_double(Project, id: 1, identifier: 'project', ancestors: [])

    expect(resolver.normalize_date_interval(
      start_date: Date.new(2027, 1, 4),
      due_date: Date.new(2027, 1, 4),
      changed_fields: %i[start_date due_date],
      project: project,
      mode: :direct_edit
    )).to eq(
      valid: false,
      start_date: Date.new(2027, 1, 5),
      due_date: Date.new(2027, 1, 1),
      error: :invalid_interval
    )
  end

  it 'matches the shared frontend/backend interval vectors' do
    fixture_path = File.expand_path('../../../spa/src/utils/calendarDateIntervalVectors.json', __dir__)
    fixture = JSON.parse(File.read(fixture_path))
    raw_payload = fixture.fetch('calendarPayload')
    calendars = raw_payload.fetch('calendars').transform_values do |raw_calendar|
      calendar(
        raw_calendar.fetch('id'),
        non_working_week_days: raw_calendar.fetch('non_working_week_days'),
        days: raw_calendar.fetch('days').each_with_object({}) do |(date, info), result|
          result[Date.iso8601(date)] = { name: info.fetch('name'), type: info.fetch('type') }
        end
      )
    end
    repository = instance_double(
      RedmineCanvasGantt::BusinessCalendarRepository,
      snapshot: snapshot(
        default: raw_payload.fetch('default_calendar_id'),
        assignments: raw_payload.fetch('project_calendar_ids'),
        calendars: calendars
      )
    )
    resolver = described_class.new(repository: repository, fallback_non_working_week_days: [6, 7])

    fixture.fetch('cases').each do |test_case|
      project = instance_double(Project, id: test_case.fetch('projectId').to_i, identifier: test_case.fetch('projectId'), ancestors: [])
      result = resolver.normalize_date_interval(
        start_date: test_case['startDate'] && Date.iso8601(test_case['startDate']),
        due_date: test_case['dueDate'] && Date.iso8601(test_case['dueDate']),
        changed_fields: test_case.fetch('changedFields').map(&:to_sym),
        project: project,
        mode: test_case.fetch('mode').to_sym
      )
      expected = test_case.fetch('expected')

      expect(result[:valid]).to eq(expected.fetch('valid')), test_case.fetch('name')
      expect(result[:start_date]&.iso8601).to eq(expected['startDate']), test_case.fetch('name')
      expect(result[:due_date]&.iso8601).to eq(expected['dueDate']), test_case.fetch('name')
      expect(result[:error]&.to_s).to eq(expected['error']) if expected['error']
    end
  end

  it 'falls back to Redmine weekdays without an assigned calendar' do
    repository = instance_double(
      RedmineCanvasGantt::BusinessCalendarRepository,
      snapshot: snapshot
    )
    resolver = described_class.new(repository: repository, fallback_non_working_week_days: [7])
    project = instance_double(Project, id: 1, identifier: 'project', ancestors: [])

    expect(resolver.working_day?(Date.new(2027, 1, 3), project: project)).to be(false)
    expect(resolver.working_day?(Date.new(2027, 1, 4), project: project)).to be(true)
  end

  it 'serializes resolved project assignments with JavaScript weekday numbers' do
    custom = calendar('custom', non_working_week_days: [0, 6])
    repository = instance_double(
      RedmineCanvasGantt::BusinessCalendarRepository,
      snapshot: snapshot(default: 'custom', calendars: { 'custom' => custom })
    )
    resolver = described_class.new(repository: repository, fallback_non_working_week_days: [6, 7])
    project = instance_double(Project, id: 9, identifier: 'project', ancestors: [])

    payload = resolver.payload(projects: [project])

    expect(payload[:defaultCalendarId]).to eq('custom')
    expect(payload[:projectCalendarIds]).to eq('9' => 'custom')
    expect(payload.dig(:calendars, 'custom', :nonWorkingWeekDays)).to eq([0, 6])
  end

  it 'does not expose calendars unrelated to visible projects' do
    visible = calendar('visible')
    hidden = calendar('hidden')
    repository = instance_double(
      RedmineCanvasGantt::BusinessCalendarRepository,
      snapshot: snapshot(
        default: 'visible',
        assignments: { 'visible-project' => 'visible', 'hidden-project' => 'hidden' },
        calendars: { 'visible' => visible, 'hidden' => hidden }
      )
    )
    resolver = described_class.new(repository: repository, fallback_non_working_week_days: [6, 7])
    project = instance_double(Project, id: 1, identifier: 'visible-project', ancestors: [])

    payload = resolver.payload(projects: [project])

    expect(payload[:calendars].keys).to eq(['visible'])
    expect(payload[:calendars]).not_to have_key('hidden')
  end

  it 'includes the default and inherited calendars required by visible projects' do
    parent = calendar('parent')
    default = calendar('default')
    repository = instance_double(
      RedmineCanvasGantt::BusinessCalendarRepository,
      snapshot: snapshot(
        default: 'default',
        assignments: { 'parent' => 'parent' },
        calendars: { 'parent' => parent, 'default' => default }
      )
    )
    resolver = described_class.new(repository: repository, fallback_non_working_week_days: [6, 7])
    ancestor = instance_double(Project, id: 2, identifier: 'parent')
    project = instance_double(Project, id: 3, identifier: 'child', ancestors: [ancestor])

    payload = resolver.payload(projects: [project])

    expect(payload[:calendars].keys).to contain_exactly('parent', 'default')
    expect(payload[:projectCalendarIds]).to eq('3' => 'parent')
  end
end
