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

  it 'moves a valid precedes pair left against the causally materialized predecessor' do
    predecessor = build_schedule_issue(
      'Left shift predecessor',
      start_date: Date.new(2027, 9, 13),
      due_date: Date.new(2027, 9, 14)
    )
    successor = build_schedule_issue(
      'Left shift successor',
      start_date: Date.new(2027, 9, 15),
      due_date: Date.new(2027, 9, 16)
    )
    IssueRelation.create!(
      issue_from: predecessor,
      issue_to: successor,
      relation_type: IssueRelation::TYPE_PRECEDES,
      delay: 0
    )
    predecessor.reload
    successor.reload
    evaluator = RedmineCanvasGantt::IssueDraftEvaluator.new(
      current_user: current_user,
      project_scope_ids: [predecessor.project_id]
    )
    allow(evaluator).to receive(:evaluate).and_call_original
    causal_coordinator = described_class.new(
      current_user: current_user,
      project_scope_ids: [predecessor.project_id],
      payload_builder: payload_builder,
      evaluator: evaluator
    )

    result = causal_coordinator.call(
      operation_id: 'schedule:valid-left-shift',
      base_revisions: [predecessor, successor].to_h { |issue| [issue.id, issue.lock_version] },
      changes: [
        { task_id: predecessor.id, start_date: '2027-09-09', due_date: '2027-09-10' },
        { task_id: successor.id, start_date: '2027-09-13', due_date: '2027-09-14' }
      ]
    )

    expect(result.status).to eq(:ok), result.errors.inspect
    expect(predecessor.reload).to have_attributes(
      start_date: Date.new(2027, 9, 9),
      due_date: Date.new(2027, 9, 10)
    )
    expect(successor.reload).to have_attributes(
      start_date: Date.new(2027, 9, 13),
      due_date: Date.new(2027, 9, 14)
    )
    expect(evaluator).to have_received(:evaluate).twice
  end

  it 'preserves the same precedes constraint when moving a pair right' do
    predecessor = build_schedule_issue(
      'Right shift predecessor',
      start_date: Date.new(2027, 9, 9),
      due_date: Date.new(2027, 9, 10)
    )
    successor = build_schedule_issue(
      'Right shift successor',
      start_date: Date.new(2027, 9, 13),
      due_date: Date.new(2027, 9, 14)
    )
    IssueRelation.create!(
      issue_from: predecessor,
      issue_to: successor,
      relation_type: IssueRelation::TYPE_PRECEDES,
      delay: 0
    )
    predecessor.reload
    successor.reload

    result = coordinator.call(
      operation_id: 'schedule:valid-right-shift',
      base_revisions: [predecessor, successor].to_h { |issue| [issue.id, issue.lock_version] },
      changes: [
        { task_id: predecessor.id, start_date: '2027-09-13', due_date: '2027-09-14' },
        { task_id: successor.id, start_date: '2027-09-15', due_date: '2027-09-16' }
      ]
    )

    expect(result.status).to eq(:ok), result.errors.inspect
    expect(predecessor.reload.due_date).to eq(Date.new(2027, 9, 14))
    expect(successor.reload.start_date).to eq(Date.new(2027, 9, 15))
  end

  it 'moves a valid three-issue precedes chain left in causal order' do
    issue_a = build_schedule_issue('Left chain A', start_date: Date.new(2027, 9, 13), due_date: Date.new(2027, 9, 14))
    issue_b = build_schedule_issue('Left chain B', start_date: Date.new(2027, 9, 15), due_date: Date.new(2027, 9, 16))
    issue_c = build_schedule_issue('Left chain C', start_date: Date.new(2027, 9, 17), due_date: Date.new(2027, 9, 20))
    IssueRelation.create!(issue_from: issue_a, issue_to: issue_b, relation_type: IssueRelation::TYPE_PRECEDES, delay: 0)
    IssueRelation.create!(issue_from: issue_b, issue_to: issue_c, relation_type: IssueRelation::TYPE_PRECEDES, delay: 0)
    issues = [issue_a, issue_b, issue_c].each(&:reload)

    result = coordinator.call(
      operation_id: 'schedule:valid-three-node-left-shift',
      base_revisions: issues.to_h { |issue| [issue.id, issue.lock_version] },
      changes: [
        { task_id: issue_a.id, start_date: '2027-09-09', due_date: '2027-09-10' },
        { task_id: issue_b.id, start_date: '2027-09-13', due_date: '2027-09-14' },
        { task_id: issue_c.id, start_date: '2027-09-15', due_date: '2027-09-16' }
      ]
    )

    expect(result.status).to eq(:ok), result.errors.inspect
    expect(issues.map { |issue| issue.reload.start_date }).to eq([
      Date.new(2027, 9, 9),
      Date.new(2027, 9, 13),
      Date.new(2027, 9, 15)
    ])
  end

  it 'applies a reverse-id left shift in causal order before final reconciliation' do
    successor = build_schedule_issue(
      'Reverse ID successor',
      start_date: Date.new(2027, 9, 15),
      due_date: Date.new(2027, 9, 16)
    )
    predecessor = build_schedule_issue(
      'Reverse ID predecessor',
      start_date: Date.new(2027, 9, 13),
      due_date: Date.new(2027, 9, 14)
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
        { task_id: successor.id, start_date: '2027-09-13', due_date: '2027-09-14' },
        { task_id: predecessor.id, start_date: '2027-09-09', due_date: '2027-09-10' }
      ]
    )

    expect(result.status).to eq(:ok), result.errors.inspect
    expect(successor.reload.start_date).to eq(Date.new(2027, 9, 13))
    expect(successor.due_date).to eq(Date.new(2027, 9, 14))
    expect(predecessor.reload.start_date).to eq(Date.new(2027, 9, 9))
    expect(predecessor.due_date).to eq(Date.new(2027, 9, 10))
  end

  it 'rejects a successor moved before an unchanged external predecessor' do
    external_predecessor = build_schedule_issue(
      'External predecessor',
      start_date: Date.new(2027, 9, 13),
      due_date: Date.new(2027, 9, 14)
    )
    successor = build_schedule_issue(
      'Externally constrained successor',
      start_date: Date.new(2027, 9, 15),
      due_date: Date.new(2027, 9, 16)
    )
    IssueRelation.create!(
      issue_from: external_predecessor,
      issue_to: successor,
      relation_type: IssueRelation::TYPE_PRECEDES,
      delay: 0
    )
    external_predecessor.reload
    successor.reload
    original = [successor.start_date, successor.due_date, successor.lock_version]

    result = coordinator.call(
      operation_id: 'schedule:invalid-external-predecessor',
      base_revisions: { successor.id => successor.lock_version },
      changes: [{ task_id: successor.id, start_date: '2027-09-13', due_date: '2027-09-14' }]
    )

    expect(result.status).to eq(:validation_error)
    expect(result.errors.join(' ')).to include('preceding issues')
    expect(successor.reload.attributes.values_at('start_date', 'due_date', 'lock_version')).to eq(original)
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

  it 'rejects a later planned permission failure before evaluating or writing the first issue' do
    first, second = planned_issues
    original = planned_issues.to_h { |issue| [issue.id, [issue.start_date, issue.due_date, issue.lock_version]] }
    evaluator = RedmineCanvasGantt::IssueDraftEvaluator.new(
      current_user: current_user,
      project_scope_ids: [first.project_id]
    )
    allow(evaluator).to receive(:evaluate).and_call_original
    permission_coordinator = described_class.new(
      current_user: current_user,
      project_scope_ids: [first.project_id],
      payload_builder: payload_builder,
      evaluator: evaluator
    )
    allow(permission_coordinator).to receive(:editable?) { |issue| issue.id != second.id }

    result = permission_coordinator.call(
      operation_id: 'schedule:permission-precondition',
      base_revisions: planned_issues.to_h { |issue| [issue.id, issue.lock_version] },
      changes: planned_issues.map do |issue|
        { task_id: issue.id, start_date: '2027-03-01', due_date: '2027-03-02' }
      end
    )

    expect(result.status).to eq(:forbidden)
    expect(result.errors).to include('Permission denied')
    expect(evaluator).not_to have_received(:evaluate)
    expect(Issue.where(id: planned_issues.map(&:id)).to_h do |issue|
      [issue.id, [issue.start_date, issue.due_date, issue.lock_version]]
    end).to eq(original)
  end

  it 'returns an operation-level conflict after the bounded topology retry budget' do
    klass = Class.new(described_class) do
      attr_reader :scope_calls

      private

      def resolve_callback_scope(seed_ids)
        @scope_calls = @scope_calls.to_i + 1
        super.merge(signature: [@scope_calls])
      end
    end
    planned_issue = planned_issues.first
    coordinator = klass.new(
      current_user: current_user,
      project_scope_ids: [planned_issue.project_id],
      payload_builder: payload_builder
    )

    result = coordinator.call(
      operation_id: 'schedule:topology-retry-exhausted',
      base_revisions: { planned_issue.id => planned_issue.lock_version },
      changes: [{ task_id: planned_issue.id, start_date: '2027-03-01', due_date: '2027-03-02' }]
    )

    expect(result.status).to eq(:conflict)
    expect(result.entities).to eq([])
    expect(result.revisions).to eq({})
    expect(result.invalidated_entity_ids).to eq([])
    expect(result.conflict).to be_nil
    expect(result.failure).to eq(
      kind: 'conflict',
      resource_role: 'scope',
      resource_type: 'schedule_scope',
      remote_availability: 'needs_refresh'
    )
    expect(coordinator.scope_calls).to eq(described_class::MAX_ATTEMPTS * 2)
  end

  it 'rolls back earlier planned, relation callback, parent, lock-version, and journal writes when a later node is invalid' do
    previous_value = Setting.parent_issue_dates
    Setting.parent_issue_dates = 'derived'
    parent = build_schedule_issue('Rollback derived parent', start_date: nil, due_date: nil)
    issue_a = build_schedule_issue(
      'Rollback A',
      start_date: Date.new(2027, 9, 13),
      due_date: Date.new(2027, 9, 14),
      parent: parent
    )
    issue_b = build_schedule_issue('Rollback B', start_date: Date.new(2027, 9, 15), due_date: Date.new(2027, 9, 16))
    issue_c = build_schedule_issue('Rollback C', start_date: Date.new(2027, 9, 17), due_date: Date.new(2027, 9, 20))
    IssueRelation.create!(issue_from: issue_a, issue_to: issue_b, relation_type: IssueRelation::TYPE_PRECEDES, delay: 0)
    IssueRelation.create!(issue_from: issue_b, issue_to: issue_c, relation_type: IssueRelation::TYPE_PRECEDES, delay: 0)
    planned = [issue_a, issue_b, issue_c].each(&:reload)
    observed = [parent, *planned].each(&:reload)
    original = observed.to_h do |issue|
      [issue.id, [issue.start_date, issue.due_date, issue.lock_version, issue.journals.count]]
    end

    result = coordinator.call(
      operation_id: 'schedule:atomic-validation',
      base_revisions: planned.to_h { |issue| [issue.id, issue.lock_version] },
      changes: [
        { task_id: issue_a.id, start_date: '2027-10-01', due_date: '2027-10-04' },
        { task_id: issue_b.id, start_date: '2027-10-05', due_date: '2027-10-06' },
        { task_id: issue_c.id, start_date: '2027-10-07', due_date: '2027-10-06' }
      ]
    )

    expect(result.status).to eq(:validation_error)
    expect(observed.to_h do |issue|
      issue.reload
      [issue.id, [issue.start_date, issue.due_date, issue.lock_version, issue.journals.count]]
    end)
      .to eq(original)
  ensure
    Setting.parent_issue_dates = previous_value if previous_value
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
