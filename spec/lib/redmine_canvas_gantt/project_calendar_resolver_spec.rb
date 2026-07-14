require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/project_calendar_resolver'

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
end
