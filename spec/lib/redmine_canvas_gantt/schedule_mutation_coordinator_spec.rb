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

  it 'preserves planned causality through a callback-only relation intermediary' do
    successor = build_schedule_issue(
      'Callback-only successor',
      start_date: Date.new(2027, 1, 5),
      due_date: Date.new(2027, 1, 6)
    )
    intermediary = build_schedule_issue(
      'Callback-only intermediary',
      start_date: Date.new(2027, 1, 3),
      due_date: Date.new(2027, 1, 4)
    )
    predecessor = build_schedule_issue(
      'Callback-only predecessor',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2)
    )
    IssueRelation.create!(
      issue_from: predecessor,
      issue_to: intermediary,
      relation_type: IssueRelation::TYPE_PRECEDES,
      delay: 0
    )
    IssueRelation.create!(
      issue_from: intermediary,
      issue_to: successor,
      relation_type: IssueRelation::TYPE_PRECEDES,
      delay: 0
    )
    [successor, intermediary, predecessor].each(&:reload)

    result = coordinator.call(
      operation_id: 'schedule:callback-only-relation-causality',
      base_revisions: [successor, predecessor].to_h { |issue| [issue.id, issue.lock_version] },
      changes: [
        { task_id: successor.id, start_date: '2027-11-20', due_date: '2027-11-21' },
        { task_id: predecessor.id, start_date: '2027-11-01', due_date: '2027-11-02' }
      ]
    )

    expect(result.status).to eq(:ok)
    expect(predecessor.reload.start_date).to eq(Date.new(2027, 11, 1))
    expect(predecessor.due_date).to eq(Date.new(2027, 11, 2))
    expect(successor.reload.start_date).to eq(Date.new(2027, 11, 20))
    expect(successor.due_date).to eq(Date.new(2027, 11, 21))
  end

  it 'orders an explicit leaf intent after a callback-only derived-parent reschedule' do
    previous_value = Setting.parent_issue_dates
    Setting.parent_issue_dates = 'derived'

    derived_parent = build_schedule_issue(
      'Callback-only derived parent',
      start_date: nil,
      due_date: nil
    )
    planned_leaf = build_schedule_issue(
      'Callback-only derived leaf',
      start_date: Date.new(2027, 1, 5),
      due_date: Date.new(2027, 1, 6),
      parent: derived_parent
    )
    predecessor = build_schedule_issue(
      'Derived-parent predecessor',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2)
    )
    IssueRelation.create!(
      issue_from: predecessor,
      issue_to: derived_parent,
      relation_type: IssueRelation::TYPE_PRECEDES,
      delay: 0
    )
    [derived_parent, planned_leaf, predecessor].each(&:reload)

    scope = coordinator.send(:resolve_callback_scope, [predecessor.id, planned_leaf.id])
    expect(scope[:event_edges]).to include(
      [[:save, predecessor.id], [:reschedule, derived_parent.id]],
      [[:reschedule, derived_parent.id], [:reschedule, planned_leaf.id]],
      [[:reschedule, planned_leaf.id], [:save, planned_leaf.id]]
    )

    result = coordinator.call(
      operation_id: 'schedule:derived-parent-callback-causality',
      base_revisions: [planned_leaf, predecessor].to_h { |issue| [issue.id, issue.lock_version] },
      changes: [
        { task_id: planned_leaf.id, start_date: '2027-11-20', due_date: '2027-11-21' },
        { task_id: predecessor.id, start_date: '2027-11-01', due_date: '2027-11-02' }
      ]
    )

    expect(result.status).to eq(:ok)
    expect(planned_leaf.reload.start_date).to eq(Date.new(2027, 11, 20))
    expect(planned_leaf.due_date).to eq(Date.new(2027, 11, 21))
  ensure
    Setting.parent_issue_dates = previous_value if previous_value
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
    expect(scope[:event_edges]).to include(
      [[:save, issue_a.id], [:reschedule, issue_b.id]],
      [[:reschedule, issue_b.id], [:save, issue_b.id]],
      [[:save, issue_b.id], [:reschedule, issue_c.id]],
      [[:reschedule, issue_c.id], [:save, issue_c.id]]
    )

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

  it 'preserves observable state across relation and multi-level derived hierarchy callbacks' do
    previous_value = Setting.parent_issue_dates
    Setting.parent_issue_dates = 'derived'

    grandparent = build_schedule_issue(
      'Mixed graph grandparent',
      start_date: nil,
      due_date: nil
    )
    parent = build_schedule_issue(
      'Mixed graph parent',
      start_date: nil,
      due_date: nil,
      parent: grandparent
    )
    leaf = build_schedule_issue(
      'Mixed graph leaf',
      start_date: Date.new(2027, 1, 5),
      due_date: Date.new(2027, 1, 6),
      parent: parent
    )
    successor = build_schedule_issue(
      'Mixed graph planned successor',
      start_date: Date.new(2027, 1, 10),
      due_date: Date.new(2027, 1, 11)
    )
    predecessor = build_schedule_issue(
      'Mixed graph planned predecessor',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2)
    )
    IssueRelation.create!(
      issue_from: predecessor,
      issue_to: grandparent,
      relation_type: IssueRelation::TYPE_PRECEDES,
      delay: 0
    )
    IssueRelation.create!(
      issue_from: leaf,
      issue_to: successor,
      relation_type: IssueRelation::TYPE_PRECEDES,
      delay: 0
    )
    [grandparent, parent, leaf, successor, predecessor].each(&:reload)

    original_leaf_dates = [leaf.start_date, leaf.due_date]
    result = coordinator.call(
      operation_id: 'schedule:mixed-relation-derived-causality',
      base_revisions: [successor, predecessor].to_h { |issue| [issue.id, issue.lock_version] },
      changes: [
        { task_id: successor.id, start_date: '2027-11-20', due_date: '2027-11-21' },
        { task_id: predecessor.id, start_date: '2027-11-01', due_date: '2027-11-02' }
      ]
    )

    expect(result.status).to eq(:ok)
    expect(predecessor.reload.start_date).to eq(Date.new(2027, 11, 1))
    expect(predecessor.due_date).to eq(Date.new(2027, 11, 2))
    expect(successor.reload.start_date).to eq(Date.new(2027, 11, 20))
    expect(successor.due_date).to eq(Date.new(2027, 11, 21))

    leaf.reload
    parent.reload
    grandparent.reload
    expect([leaf.start_date, leaf.due_date]).not_to eq(original_leaf_dates)
    expect([parent.start_date, parent.due_date]).to eq([leaf.start_date, leaf.due_date])
    expect([grandparent.start_date, grandparent.due_date]).to eq([leaf.start_date, leaf.due_date])

    callback_ids = [grandparent.id, parent.id, leaf.id]
    expect(result.entities.map { |entity| entity[:id] }).to include(predecessor.id, successor.id, *callback_ids)
    expect(result.revisions.keys).to include(predecessor.id, successor.id, *callback_ids)
    result.entities.each do |entity|
      issue = Issue.find(entity[:id])
      expect(entity[:start_date]).to eq(issue.start_date&.iso8601)
      expect(entity[:due_date]).to eq(issue.due_date&.iso8601)
      expect(entity[:lock_version]).to eq(issue.lock_version)
      expect(result.revisions.fetch(issue.id)).to eq(issue.lock_version)
    end
  ensure
    Setting.parent_issue_dates = previous_value if previous_value
  end

  it 'keeps deep derived-hierarchy callback discovery and full mutation query growth linear' do
    previous_value = Setting.parent_issue_dates
    Setting.parent_issue_dates = 'derived'

    build_chain = lambda do |depth, prefix|
      root = build_schedule_issue(
        "#{prefix} root",
        start_date: Date.new(2027, 1, 1),
        due_date: Date.new(2027, 1, 2)
      )
      cursor = root
      (depth - 1).times do |index|
        cursor = build_schedule_issue(
          "#{prefix} node #{index + 1}",
          start_date: Date.new(2027, 1, 1),
          due_date: Date.new(2027, 1, 2),
          parent: cursor
        )
      end
      root
    end

    measure = lambda do |depth, prefix|
      root = build_chain.call(depth, prefix)
      predecessor = build_schedule_issue(
        "#{prefix} predecessor",
        start_date: Date.new(2027, 1, 1),
        due_date: Date.new(2027, 1, 2)
      )
      IssueRelation.create!(
        issue_from: predecessor,
        issue_to: root,
        relation_type: IssueRelation::TYPE_PRECEDES,
        delay: 0
      )
      predecessor.reload

      scope = nil
      scope_queries = sql_query_count do
        scope = coordinator.send(:resolve_callback_scope, [predecessor.id])
      end
      expect(scope[:ids].size).to eq(depth + 1)
      # A chain of N hierarchy nodes has N downward reschedule edges and N
      # upward/save edges, including the relation seed, i.e. exactly 2N.
      expect(scope[:event_edges].size).to eq(depth * 2)

      result = nil
      mutation_queries = sql_query_count do
        Issue.transaction do
          result = coordinator.call(
            operation_id: "schedule:deep-query-scale-#{depth}",
            base_revisions: { predecessor.id => predecessor.lock_version },
            changes: [{ task_id: predecessor.id, start_date: '2027-11-01', due_date: '2027-11-02' }]
          )
          raise ActiveRecord::Rollback
        end
      end
      expect(result.status).to eq(:ok), result.inspect

      [scope_queries, mutation_queries, scope[:ids].size, scope[:event_edges].size]
    end

    sq40, mq40, issues40, edges40 = measure.call(40, 'Deep 40')
    sq80, mq80, issues80, edges80 = measure.call(80, 'Deep 80')

    expect(sq40).to be > 0
    expect(mq40).to be > 0
    expect(sq80).to be <= (sq40 * 2.75)
    expect(mq80).to be <= (mq40 * 2.75)
    expect(issues80).to eq((issues40 * 2) - 1)
    expect(edges80).to eq(edges40 * 2)
  ensure
    Setting.parent_issue_dates = previous_value if previous_value
  end
end
