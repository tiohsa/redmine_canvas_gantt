require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/schedule_mutation_coordinator'

RSpec.describe RedmineCanvasGantt::ScheduleMutationCoordinator, type: :model do
  fixtures :projects, :users, :roles, :members, :member_roles,
           :trackers, :issue_statuses, :workflows, :enumerations, :issues

  let(:current_user) { User.find(2) }
  let(:planned_issues) { Issue.where(project_id: Issue.find(1).project_id).order(:id).limit(2).to_a }
  let(:payload_builder) do
    instance_double('DataPayloadBuilder').tap do |builder|
      allow(builder).to receive(:build_task_state) do |issue|
        {
          id: issue.id,
          start_date: issue.start_date&.iso8601,
          due_date: issue.due_date&.iso8601,
          lock_version: issue.lock_version
        }
      end
    end
  end
  let(:coordinator) do
    described_class.new(
      current_user: current_user,
      project_scope_ids: [planned_issues.first.project_id],
      payload_builder: payload_builder
    )
  end

  before { User.current = current_user }

  def build_schedule_issue(subject, start_date:, due_date:, parent: nil)
    source = Issue.find(1)
    Issue.create!(
      project: source.project,
      tracker: source.tracker,
      status: source.status,
      author: current_user,
      subject: subject,
      start_date: start_date,
      due_date: due_date,
      parent: parent
    )
  end

  def sql_query_count
    count = 0
    subscriber = lambda do |_name, _start, _finish, _id, payload|
      next if payload[:cached] || payload[:name] == 'SCHEMA'
      next if payload[:sql].to_s.match?(/\A(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/i)

      count += 1
    end
    ActiveSupport::Notifications.subscribed(subscriber, 'sql.active_record') { yield }
    count
  end

  it 'persists a multi-issue plan through one transaction without a self-conflict' do
    expect(planned_issues.length).to eq(2)
    base_revisions = planned_issues.to_h { |issue| [issue.id, issue.lock_version] }
    result = coordinator.call(
      operation_id: 'schedule:real-self-conflict',
      base_revisions: base_revisions,
      changes: planned_issues.map.with_index do |issue, index|
        { task_id: issue.id, start_date: "2027-02-#{10 + index}", due_date: "2027-02-#{12 + index}" }
      end
    )

    expect(result.status).to eq(:ok)
    expect(result.entities.map { |entity| entity[:id] }).to include(*planned_issues.map(&:id))
    expect(planned_issues.map(&:id).map { |id| result.revisions.fetch(id) }).to all(be > 0)
  end

  it 'applies a reverse-id precedes plan in causal order before final reconciliation' do
    successor = build_schedule_issue(
      'Reverse ID successor',
      start_date: Date.new(2027, 1, 2),
      due_date: Date.new(2027, 1, 3)
    )
    predecessor = build_schedule_issue(
      'Reverse ID predecessor',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 1)
    )
    IssueRelation.create!(
      issue_from: predecessor,
      issue_to: successor,
      relation_type: IssueRelation::TYPE_PRECEDES,
      delay: 0
    )
    successor.reload
    predecessor.reload

    result = coordinator.call(
      operation_id: 'schedule:reverse-id-causality',
      base_revisions: [successor, predecessor].to_h { |issue| [issue.id, issue.lock_version] },
      changes: [
        { task_id: successor.id, start_date: '2027-11-20', due_date: '2027-11-21' },
        { task_id: predecessor.id, start_date: '2027-11-01', due_date: '2027-11-02' }
      ]
    )

    expect(result.status).to eq(:ok)
    expect(successor.reload.start_date).to eq(Date.new(2027, 11, 20))
    expect(successor.due_date).to eq(Date.new(2027, 11, 21))
    expect(predecessor.reload.start_date).to eq(Date.new(2027, 11, 1))
    expect(predecessor.due_date).to eq(Date.new(2027, 11, 2))
  end

  it 'returns the complete multi-hop relation callback closure' do
    issue_a = build_schedule_issue(
      'Closure A',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2)
    )
    issue_b = build_schedule_issue(
      'Closure B',
      start_date: Date.new(2027, 1, 3),
      due_date: Date.new(2027, 1, 4)
    )
    issue_c = build_schedule_issue(
      'Closure C',
      start_date: Date.new(2027, 1, 5),
      due_date: Date.new(2027, 1, 6)
    )
    IssueRelation.create!(issue_from: issue_a, issue_to: issue_b, relation_type: IssueRelation::TYPE_PRECEDES, delay: 0)
    IssueRelation.create!(issue_from: issue_b, issue_to: issue_c, relation_type: IssueRelation::TYPE_PRECEDES, delay: 0)

    scope = coordinator.send(:resolve_callback_scope, [issue_a.id])

    expect(scope[:ids]).to include(issue_a.id, issue_b.id, issue_c.id)
    expect(scope[:apply_edges]).to include([issue_a.id, issue_b.id], [issue_b.id, issue_c.id])

    result = coordinator.call(
      operation_id: 'schedule:relation-causality',
      base_revisions: { issue_a.id => issue_a.reload.lock_version },
      changes: [{ task_id: issue_a.id, start_date: '2027-11-01', due_date: '2027-11-02' }]
    )

    expect(result.status).to eq(:ok)
    expect(result.entities.map { |entity| entity[:id] }).to include(issue_a.id, issue_b.id, issue_c.id)
    expect(result.revisions).to include(issue_a.id, issue_b.id, issue_c.id)
  end

  it 'returns ancestor callback entities for a derived parent hierarchy' do
    previous_value = Setting.parent_issue_dates
    Setting.parent_issue_dates = 'derived'

    grandparent = build_schedule_issue(
      'Derived grandparent',
      start_date: nil,
      due_date: nil
    )
    parent = build_schedule_issue(
      'Derived parent',
      start_date: nil,
      due_date: nil,
      parent: grandparent
    )
    child = build_schedule_issue(
      'Derived child',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2),
      parent: parent
    )
    [grandparent, parent, child].each(&:reload)

    result = coordinator.call(
      operation_id: 'schedule:ancestor-causality',
      base_revisions: { child.id => child.lock_version },
      changes: [{ task_id: child.id, start_date: '2027-12-01', due_date: '2027-12-02' }]
    )

    expect(result.status).to eq(:ok)
    expect(result.entities.map { |entity| entity[:id] }).to include(grandparent.id, parent.id, child.id)
    expect(result.revisions).to include(grandparent.id, parent.id, child.id)
  ensure
    Setting.parent_issue_dates = previous_value if previous_value
  end

  it 'rejects an external revision before writing any planned issue' do
    expect(planned_issues.length).to eq(2)
    original_dates = planned_issues.to_h { |issue| [issue.id, issue.start_date] }
    base_revisions = planned_issues.to_h { |issue| [issue.id, issue.lock_version] }
    planned_issues.first.update!(subject: 'external schedule conflict')

    result = coordinator.call(
      operation_id: 'schedule:external-conflict',
      base_revisions: base_revisions,
      changes: planned_issues.map { |issue| { task_id: issue.id, start_date: '2027-03-01' } }
    )

    expect(result.status).to eq(:conflict)
    expect(Issue.where(id: planned_issues.map(&:id)).to_h { |issue| [issue.id, issue.start_date] })
      .to eq(original_dates)
  end

  it 'rolls back all planned writes when one schedule change is invalid' do
    expect(planned_issues.length).to eq(2)
    original = planned_issues.to_h { |issue| [issue.id, [issue.start_date, issue.due_date, issue.lock_version]] }
    result = coordinator.call(
      operation_id: 'schedule:atomic-validation',
      base_revisions: planned_issues.to_h { |issue| [issue.id, issue.lock_version] },
      changes: [
        { task_id: planned_issues[0].id, start_date: '2027-04-10', due_date: '2027-04-11' },
        { task_id: planned_issues[1].id, start_date: 'invalid-date' }
      ]
    )

    expect(result.status).to eq(:validation_error)
    expect(Issue.where(id: planned_issues.map(&:id)).to_h { |issue| [issue.id, [issue.start_date, issue.due_date, issue.lock_version]] })
      .to eq(original)
  end

  it 'keeps schedule coordinator query growth within the O(N) gate' do
    source = Issue.find(1)
    generated = 200.times.map do |index|
      Issue.create!(
        project: source.project,
        tracker: source.tracker,
        status: source.status,
        author: current_user,
        subject: "Canvas query scale #{index}"
      )
    end
    generated.each(&:reload)

    measure = lambda do |issues|
      result = nil
      query_count = sql_query_count do
        Issue.transaction do
          result = coordinator.call(
            operation_id: "schedule:query-scale-#{issues.length}",
            base_revisions: issues.to_h { |issue| [issue.id, issue.lock_version] },
            changes: issues.map do |issue|
              { task_id: issue.id, start_date: '2027-09-01', due_date: '2027-09-02' }
            end
          )
          raise ActiveRecord::Rollback
        end
      end
      expect(result.status).to eq(:ok), result.inspect
      query_count
    end

    q100 = measure.call(generated.first(100))
    q200 = measure.call(generated)

    expect(q100).to be > 0
    expect(q200).to be <= (q100 * 2.5)
  end
end
