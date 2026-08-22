require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/schedule_mutation_coordinator'
require 'thread'
require 'timeout'

RSpec.describe RedmineCanvasGantt::ScheduleMutationCoordinator, 'callback topology concurrency', type: :model do
  # These examples intentionally use committed records and two real database
  # connections. Transactional fixtures would hide the setup from the worker
  # connection and turn the test back into a mock-only race simulation.
  self.use_transactional_tests = false

  fixtures :projects, :users, :roles, :members, :member_roles,
           :trackers, :issue_statuses, :workflows, :enumerations, :issues

  class ConcurrencyPayloadBuilder
    def build_task_state(issue)
      {
        id: issue.id,
        start_date: issue.start_date&.iso8601,
        due_date: issue.due_date&.iso8601,
        lock_version: issue.lock_version
      }
    end
  end

  around do |example|
    @created_issue_ids = []
    @created_relation_ids = []
    @original_parent_issue_dates = Setting.parent_issue_dates
    User.current = User.find(2)
    example.run
  ensure
    ids = Array(@created_issue_ids).uniq
    relation_ids = Array(@created_relation_ids).uniq
    IssueRelation.where(id: relation_ids).delete_all unless relation_ids.empty?
    unless ids.empty?
      IssueRelation.where(issue_from_id: ids).or(IssueRelation.where(issue_to_id: ids)).delete_all
      Issue.where(id: ids).order(id: :desc).each do |issue|
        issue.destroy
      rescue StandardError
        Issue.where(id: issue.id).delete_all
      end
    end
    Setting.parent_issue_dates = @original_parent_issue_dates if @original_parent_issue_dates
    Setting.clear_cache if Setting.respond_to?(:clear_cache)
    User.current = nil
  end

  def build_committed_issue(subject, start_date:, due_date:, parent: nil)
    source = Issue.find(1)
    issue = Issue.create!(
      project: source.project,
      tracker: source.tracker,
      status: source.status,
      author: User.find(2),
      subject: subject,
      start_date: start_date,
      due_date: due_date,
      parent: parent
    )
    @created_issue_ids << issue.id
    issue
  end

  def create_committed_precedes(issue_from, issue_to)
    relation = IssueRelation.create!(
      issue_from: issue_from,
      issue_to: issue_to,
      relation_type: IssueRelation::TYPE_PRECEDES,
      delay: 0
    )
    @created_relation_ids << relation.id
    relation
  end

  def schedule_state(issue)
    issue.reload
    [issue.start_date, issue.due_date, issue.lock_version.to_i]
  end

  def mysql_family?
    Issue.connection.adapter_name.to_s.match?(/mysql|trilogy/i)
  end

  def barrier_coordinator_class
    Class.new(described_class) do
      def initialize(scope_ready:, resume_scope:, **kwargs)
        @scope_ready = scope_ready
        @resume_scope = resume_scope
        @pause_first_scope = true
        super(**kwargs)
      end

      private

      def resolve_callback_scope(seed_ids)
        scope = super
        if @pause_first_scope
          @pause_first_scope = false
          @scope_ready << true
          @resume_scope.pop
        end
        scope
      end
    end
  end

  def run_barrier_schedule(planned_issue, start_date:, due_date:)
    skip 'deterministic READ COMMITTED barrier currently requires the MySQL/MariaDB CI adapter' unless mysql_family?

    scope_ready = Queue.new
    resume_scope = Queue.new
    results = Queue.new
    errors = Queue.new
    project_id = planned_issue.project_id
    planned_id = planned_issue.id
    base_revision = planned_issue.reload.lock_version.to_i
    klass = barrier_coordinator_class

    worker = Thread.new do
      Issue.connection_pool.with_connection do |connection|
        begin
          # MariaDB CI normally uses REPEATABLE READ. READ COMMITTED makes the
          # topology change visible to later callback queries and exercises the
          # PostgreSQL-like race window deterministically for this test.
          connection.execute('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED')
          current_user = User.find(2)
          User.current = current_user
          coordinator = klass.new(
            scope_ready: scope_ready,
            resume_scope: resume_scope,
            current_user: current_user,
            project_scope_ids: [project_id],
            payload_builder: ConcurrencyPayloadBuilder.new
          )
          results << coordinator.call(
            operation_id: "schedule:barrier-#{planned_id}",
            base_revisions: { planned_id => base_revision },
            changes: [{ task_id: planned_id, start_date: start_date, due_date: due_date }]
          )
        rescue StandardError => error
          errors << error
          scope_ready << false
        ensure
          User.current = nil
          connection.execute('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ') rescue nil
        end
      end
    end

    barrier_signal = Timeout.timeout(15) { scope_ready.pop }
    raise errors.pop unless barrier_signal

    topology_value = yield
    resume_scope << true
    worker.join(15)
    raise 'Schedule mutation barrier worker did not finish' if worker.alive?
    raise errors.pop unless errors.empty?

    [results.pop, topology_value]
  ensure
    resume_scope << true if defined?(worker) && worker&.alive?
    worker&.join(1)
  end

  def expect_no_incomplete_success(result, callback_issue, callback_baseline)
    expect([:ok, :conflict]).to include(result.status)
    return if result.status == :conflict

    callback_after = schedule_state(callback_issue)
    return if callback_after == callback_baseline

    entity = result.entities.find { |entry| entry[:id].to_i == callback_issue.id }
    expect(entity).not_to be_nil,
      'callback changed an Issue that was omitted from the canonical response'
    expect(entity[:start_date]).to eq(callback_after[0]&.iso8601)
    expect(entity[:due_date]).to eq(callback_after[1]&.iso8601)
    expect(entity[:lock_version]).to eq(callback_after[2])
    expect(result.revisions.fetch(callback_issue.id)).to eq(callback_after[2]),
      'callback changed an Issue whose canonical revision was stale'
  end

  it 'does not return an incomplete success when a precedes relation is added after callback-scope resolution' do
    successor = build_committed_issue(
      'Barrier relation-add successor',
      start_date: Date.new(2027, 1, 10),
      due_date: Date.new(2027, 1, 11)
    )
    predecessor = build_committed_issue(
      'Barrier relation-add predecessor',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2)
    )
    result, callback_baseline = run_barrier_schedule(
      predecessor,
      start_date: '2027-11-01',
      due_date: '2027-11-02'
    ) do
      create_committed_precedes(predecessor.reload, successor.reload)
      schedule_state(successor)
    end

    expect_no_incomplete_success(result, successor, callback_baseline)
  end

  it 'does not return an incomplete success when a precedes relation is deleted after callback-scope resolution' do
    successor = build_committed_issue(
      'Barrier relation-delete successor',
      start_date: Date.new(2027, 1, 10),
      due_date: Date.new(2027, 1, 11)
    )
    predecessor = build_committed_issue(
      'Barrier relation-delete predecessor',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2)
    )
    relation = create_committed_precedes(predecessor, successor)
    result, callback_baseline = run_barrier_schedule(
      predecessor,
      start_date: '2027-11-01',
      due_date: '2027-11-02'
    ) do
      relation.reload.destroy!
      schedule_state(successor)
    end

    expect_no_incomplete_success(result, successor, callback_baseline)
  end

  it 'does not return an incomplete success when a relation delay changes after callback-scope resolution' do
    successor = build_committed_issue(
      'Barrier relation-delay successor',
      start_date: Date.new(2027, 1, 10),
      due_date: Date.new(2027, 1, 11)
    )
    predecessor = build_committed_issue(
      'Barrier relation-delay predecessor',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2)
    )
    relation = create_committed_precedes(predecessor, successor)
    result, callback_baseline = run_barrier_schedule(
      predecessor,
      start_date: '2027-11-01',
      due_date: '2027-11-02'
    ) do
      relation.reload.update!(delay: 1)
      schedule_state(successor)
    end

    expect_no_incomplete_success(result, successor, callback_baseline)
  end

  it 'does not return an incomplete success when a relation type changes after callback-scope resolution' do
    successor = build_committed_issue(
      'Barrier relation-type successor',
      start_date: Date.new(2027, 1, 10),
      due_date: Date.new(2027, 1, 11)
    )
    predecessor = build_committed_issue(
      'Barrier relation-type predecessor',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2)
    )
    relation = create_committed_precedes(predecessor, successor)
    result, callback_baseline = run_barrier_schedule(
      predecessor,
      start_date: '2027-11-01',
      due_date: '2027-11-02'
    ) do
      relation.reload.update!(relation_type: IssueRelation::TYPE_RELATES)
      schedule_state(successor)
    end

    expect_no_incomplete_success(result, successor, callback_baseline)
  end

  it 'does not return an incomplete success when a callback-only leaf is reparented into a derived branch' do
    Setting.parent_issue_dates = 'derived'
    Setting.clear_cache if Setting.respond_to?(:clear_cache)

    derived_root = build_committed_issue(
      'Barrier derived root',
      start_date: nil,
      due_date: nil
    )
    build_committed_issue(
      'Barrier existing leaf',
      start_date: Date.new(2027, 1, 5),
      due_date: Date.new(2027, 1, 6),
      parent: derived_root
    )
    incoming_leaf = build_committed_issue(
      'Barrier incoming leaf',
      start_date: Date.new(2027, 1, 10),
      due_date: Date.new(2027, 1, 11)
    )
    predecessor = build_committed_issue(
      'Barrier derived predecessor',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2)
    )
    create_committed_precedes(predecessor, derived_root)
    [derived_root, incoming_leaf, predecessor].each(&:reload)
    result, callback_baseline = run_barrier_schedule(
      predecessor,
      start_date: '2027-11-01',
      due_date: '2027-11-02'
    ) do
      incoming_leaf.reload.update!(parent: derived_root.reload)
      schedule_state(incoming_leaf)
    end

    expect_no_incomplete_success(result, incoming_leaf, callback_baseline)
  ensure
    Setting.parent_issue_dates = @original_parent_issue_dates if @original_parent_issue_dates
    Setting.clear_cache if Setting.respond_to?(:clear_cache)
  end

  it 'does not return an incomplete success when a callback-only leaf leaves a derived branch' do
    Setting.parent_issue_dates = 'derived'
    Setting.clear_cache if Setting.respond_to?(:clear_cache)

    derived_root = build_committed_issue(
      'Barrier reparent-out root',
      start_date: nil,
      due_date: nil
    )
    build_committed_issue(
      'Barrier reparent-out existing leaf',
      start_date: Date.new(2027, 1, 5),
      due_date: Date.new(2027, 1, 6),
      parent: derived_root
    )
    outgoing_leaf = build_committed_issue(
      'Barrier reparent-out leaf',
      start_date: Date.new(2027, 1, 10),
      due_date: Date.new(2027, 1, 11),
      parent: derived_root
    )
    predecessor = build_committed_issue(
      'Barrier reparent-out predecessor',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2)
    )
    create_committed_precedes(predecessor, derived_root)
    [derived_root, outgoing_leaf, predecessor].each(&:reload)
    result, callback_baseline = run_barrier_schedule(
      predecessor,
      start_date: '2027-11-01',
      due_date: '2027-11-02'
    ) do
      outgoing_leaf.reload.update!(parent: nil)
      schedule_state(outgoing_leaf)
    end

    expect_no_incomplete_success(result, outgoing_leaf, callback_baseline)
  ensure
    Setting.parent_issue_dates = @original_parent_issue_dates if @original_parent_issue_dates
    Setting.clear_cache if Setting.respond_to?(:clear_cache)
  end

  it 'does not return an incomplete success when a callback-only child is added after callback-scope resolution' do
    Setting.parent_issue_dates = 'derived'
    Setting.clear_cache if Setting.respond_to?(:clear_cache)

    derived_root = build_committed_issue(
      'Barrier child-add root',
      start_date: nil,
      due_date: nil
    )
    build_committed_issue(
      'Barrier child-add existing leaf',
      start_date: Date.new(2027, 1, 5),
      due_date: Date.new(2027, 1, 6),
      parent: derived_root
    )
    predecessor = build_committed_issue(
      'Barrier child-add predecessor',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2)
    )
    create_committed_precedes(predecessor, derived_root)
    [derived_root, predecessor].each(&:reload)
    result, callback_baseline = run_barrier_schedule(
      predecessor,
      start_date: '2027-11-01',
      due_date: '2027-11-02'
    ) do
      added_leaf = build_committed_issue(
        'Barrier child-add incoming leaf',
        start_date: Date.new(2027, 1, 10),
        due_date: Date.new(2027, 1, 11),
        parent: derived_root.reload
      )
      schedule_state(added_leaf)
    end

    added_leaf = Issue.where(subject: 'Barrier child-add incoming leaf').order(id: :desc).first
    expect(added_leaf).not_to be_nil
    expect_no_incomplete_success(result, added_leaf, callback_baseline)
  ensure
    Setting.parent_issue_dates = @original_parent_issue_dates if @original_parent_issue_dates
    Setting.clear_cache if Setting.respond_to?(:clear_cache)
  end

  it 'does not return an incomplete success when a callback-only child is deleted after callback-scope resolution' do
    Setting.parent_issue_dates = 'derived'
    Setting.clear_cache if Setting.respond_to?(:clear_cache)

    derived_root = build_committed_issue(
      'Barrier child-delete root',
      start_date: nil,
      due_date: nil
    )
    deleted_leaf = build_committed_issue(
      'Barrier child-delete leaf',
      start_date: Date.new(2027, 1, 5),
      due_date: Date.new(2027, 1, 6),
      parent: derived_root
    )
    predecessor = build_committed_issue(
      'Barrier child-delete predecessor',
      start_date: Date.new(2027, 1, 1),
      due_date: Date.new(2027, 1, 2)
    )
    create_committed_precedes(predecessor, derived_root)
    [derived_root, deleted_leaf, predecessor].each(&:reload)
    result, callback_baseline = run_barrier_schedule(
      predecessor,
      start_date: '2027-11-01',
      due_date: '2027-11-02'
    ) do
      deleted_leaf.reload.destroy!
      schedule_state(derived_root)
    end

    expect_no_incomplete_success(result, derived_root, callback_baseline)
  ensure
    Setting.parent_issue_dates = @original_parent_issue_dates if @original_parent_issue_dates
    Setting.clear_cache if Setting.respond_to?(:clear_cache)
  end
end
