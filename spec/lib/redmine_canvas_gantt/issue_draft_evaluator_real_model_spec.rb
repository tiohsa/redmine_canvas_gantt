require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/issue_draft_evaluator'
require_relative '../../../lib/redmine_canvas_gantt/edit_meta_payload_builder'

RSpec.describe RedmineCanvasGantt::IssueDraftEvaluator, type: :model do
  fixtures :projects, :users, :roles, :members, :member_roles,
           :trackers, :issue_statuses, :workflows, :enumerations, :issues

  let(:current_user) { User.find(2) }
  let(:issue) { Issue.find(1) }
  let(:evaluator) do
    described_class.new(
      current_user: current_user,
      project_scope_ids: Project.pluck(:id)
    )
  end

  before do
    User.current = current_user
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

  it 'evaluates the persisted Issue instance without turning it into a new record' do
    original_subject = issue.subject

    result = evaluator.evaluate(
      issue: issue,
      intent: { subject: "#{original_subject} preview", lock_version: issue.lock_version }
    )

    expect(result).to be_valid
    expect(result.issue).to be(issue)
    expect(result.issue).not_to be_new_record
    expect(result.issue).to be_subject_changed
    expect(result.issue.subject_was).to eq(original_subject)
    expect(result.issue.current_journal.user).to eq(current_user)
    expect(Issue.find(issue.id).subject).to eq(original_subject)
  end

  it 'rejects a same-project tracker that safe_attributes silently ignores' do
    result = evaluator.evaluate(
      issue: issue,
      intent: { tracker_id: 999_999, lock_version: issue.lock_version }
    )

    expect(result.violations).to include(include(field: 'tracker_id', code: 'not_accepted'))
  end

  it 'rejects a status that the current workflow silently ignores' do
    result = evaluator.evaluate(
      issue: issue,
      intent: { status_id: 999_999, lock_version: issue.lock_version }
    )

    expect(result.violations).to include(include(field: 'status_id', code: 'not_accepted'))
  end

  it 'does not treat successive draft statuses as persisted workflow transitions' do
    role = Member.find_by!(user_id: current_user.id, project_id: issue.project_id).roles.first
    workflow_tracker = Tracker.create!(
      name: 'Canvas draft workflow tracker',
      default_status: issue.status
    )
    issue.project.trackers << workflow_tracker
    preview_issue = Issue.create!(
      project: issue.project,
      tracker: workflow_tracker,
      status: issue.status,
      author: current_user,
      subject: 'Canvas draft workflow issue'
    )
    intermediate_status = IssueStatus.create!(name: 'Canvas draft intermediate', position: 90)
    closed_status = IssueStatus.create!(name: 'Canvas draft closed', position: 91, is_closed: true)
    WorkflowTransition.create!(
      role_id: role.id,
      tracker_id: workflow_tracker.id,
      old_status_id: preview_issue.status_id,
      new_status_id: intermediate_status.id
    )
    WorkflowTransition.create!(
      role_id: role.id,
      tracker_id: workflow_tracker.id,
      old_status_id: intermediate_status.id,
      new_status_id: closed_status.id
    )
    persisted_status_id = preview_issue.status_id

    intermediate = evaluator.evaluate(
      issue: preview_issue,
      intent: { status_id: intermediate_status.id, lock_version: preview_issue.lock_version }
    )
    fresh_issue = Issue.find(preview_issue.id)
    closed = evaluator.evaluate(
      issue: fresh_issue,
      intent: { status_id: closed_status.id, lock_version: fresh_issue.lock_version }
    )

    expect(intermediate).to be_valid
    expect(intermediate.issue).to be_status_id_changed
    expect(intermediate.issue.status_id_was).to eq(persisted_status_id)
    expect(closed.violations).to include(include(field: 'status_id', code: 'not_accepted'))
    expect(closed.issue.status_id).to eq(persisted_status_id)
    expect(closed.issue.status_id_was).to eq(persisted_status_id)
  end

  it 'moves from a source-only tracker to an explicitly requested destination tracker with real dirty state' do
    source_project = issue.project
    destination_project = Project.find(2)
    source_tracker = Tracker.find(1)
    destination_tracker = Tracker.find(2)
    role = Member.find_by!(user_id: current_user.id, project_id: source_project.id).roles.first
    destination_member = Member.find_or_create_by!(user_id: current_user.id, project_id: destination_project.id)
    destination_member.roles << role unless destination_member.roles.include?(role)
    source_project.trackers = [source_tracker]
    destination_project.trackers = [destination_tracker]
    issue.update_columns(project_id: source_project.id, tracker_id: source_tracker.id, assigned_to_id: User.find(3).id)
    issue.reload
    evaluator = described_class.new(
      current_user: current_user,
      project_scope_ids: [source_project.id, destination_project.id]
    )

    result = evaluator.evaluate(
      issue: issue,
      intent: {
        project_id: destination_project.id,
        tracker_id: destination_tracker.id,
        lock_version: issue.lock_version
      }
    )

    expect(result).to be_valid
    expect(result.issue).to be_project_id_changed
    expect(result.issue.project_id_was).to eq(source_project.id)
    expect(result.issue).to be_tracker_id_changed
    expect(result.issue.tracker_id_was).to eq(source_tracker.id)
    expect(result.issue.tracker_id).to eq(destination_tracker.id)
    expect(result.issue.assigned_to_id).to eq(User.find(3).id)
    expect(result.issue.assigned_to_id_was).to eq(User.find(3).id)
    expect(Issue.find(issue.id)).to have_attributes(
      project_id: source_project.id,
      tracker_id: source_tracker.id,
      assigned_to_id: User.find(3).id
    )
  end

  it 'evaluates destination-only editable fields after Project and Tracker changes' do
    source_project = issue.project
    destination_project = Project.find(2)
    source_tracker = Tracker.find(1)
    destination_tracker = Tracker.find(2)
    role = Member.find_by!(user_id: current_user.id, project_id: source_project.id).roles.first
    destination_member = Member.find_or_create_by!(user_id: current_user.id, project_id: destination_project.id)
    destination_member.roles << role unless destination_member.roles.include?(role)
    source_project.trackers = [source_tracker]
    destination_project.trackers = [destination_tracker]
    source_tracker_bits = source_tracker.fields_bits
    destination_tracker_bits = destination_tracker.fields_bits

    begin
      source_tracker.core_fields = source_tracker.core_fields - ['estimated_hours']
      destination_tracker.core_fields = destination_tracker.core_fields | ['estimated_hours']
      source_tracker.save!
      destination_tracker.save!
      issue.update_columns(
        project_id: source_project.id,
        tracker_id: source_tracker.id,
        estimated_hours: 1
      )
      issue.reload

      result = described_class.new(
        current_user: current_user,
        project_scope_ids: [source_project.id, destination_project.id]
      ).evaluate(
        issue: issue,
        intent: {
          project_id: destination_project.id,
          tracker_id: destination_tracker.id,
          estimated_hours: 4,
          lock_version: issue.lock_version
        }
      )

      expect(result).to be_valid
      expect(result.issue).to have_attributes(
        project_id: destination_project.id,
        tracker_id: destination_tracker.id,
        estimated_hours: 4.0
      )
    ensure
      source_tracker.update_columns(fields_bits: source_tracker_bits)
      destination_tracker.update_columns(fields_bits: destination_tracker_bits)
      source_tracker.reload
      destination_tracker.reload
    end
  end

  it 'matches Redmine single-apply Project plus previous Category behavior' do
    source_project = issue.project
    destination_project = Project.find(2)
    source_tracker = Tracker.find(1)
    role = Member.find_by!(user_id: current_user.id, project_id: source_project.id).roles.first
    destination_member = Member.find_or_create_by!(user_id: current_user.id, project_id: destination_project.id)
    destination_member.roles << role unless destination_member.roles.include?(role)
    source_project.trackers = [source_tracker]
    destination_project.trackers = [source_tracker]
    source_category = IssueCategory.create!(project: source_project, name: 'Canvas source category')
    issue.update_columns(project_id: source_project.id, tracker_id: source_tracker.id, category_id: source_category.id)
    issue.reload

    direct_issue = Issue.find(issue.id)
    direct_issue.init_journal(current_user)
    direct_issue.safe_attributes = {
      project_id: destination_project.id,
      category_id: source_category.id
    }.stringify_keys

    evaluated_issue = Issue.find(issue.id)
    result = described_class.new(
      current_user: current_user,
      project_scope_ids: [source_project.id, destination_project.id]
    ).evaluate(
      issue: evaluated_issue,
      intent: {
        project_id: destination_project.id,
        category_id: source_category.id,
        lock_version: evaluated_issue.lock_version
      }
    )

    expect(result.issue).to have_attributes(
      project_id: direct_issue.project_id,
      category_id: direct_issue.category_id
    )
    if direct_issue.category_id != source_category.id
      expect(result.violations).to include(include(field: 'category_id', code: 'not_accepted'))
    else
      expect(result.violations).not_to include(include(field: 'category_id', code: 'not_accepted'))
    end
    expect(Issue.find(issue.id)).to have_attributes(
      project_id: source_project.id,
      category_id: source_category.id
    )
  end

  it 'keeps a previous assignee outside destination candidates on a project-only move' do
    source_project = issue.project
    destination_project = Project.find(2)
    shared_tracker = Tracker.find(1)
    previous_assignee = User.find(3)
    role = Member.find_by!(user_id: current_user.id, project_id: source_project.id).roles.first
    destination_member = Member.find_or_create_by!(user_id: current_user.id, project_id: destination_project.id)
    destination_member.roles << role unless destination_member.roles.include?(role)
    source_project.trackers = [shared_tracker]
    destination_project.trackers = [shared_tracker]
    Member.where(user_id: previous_assignee.id, project_id: destination_project.id).delete_all
    issue.update_columns(
      project_id: source_project.id,
      tracker_id: shared_tracker.id,
      assigned_to_id: previous_assignee.id
    )
    issue.reload
    evaluator = described_class.new(
      current_user: current_user,
      project_scope_ids: [source_project.id, destination_project.id]
    )

    result = evaluator.evaluate(
      issue: issue,
      intent: { project_id: destination_project.id, lock_version: issue.lock_version }
    )

    expect(destination_project.assignable_users.map(&:id)).not_to include(previous_assignee.id)
    expect(result).to be_valid
    expect(result.user_intent).not_to have_key(:tracker_id)
    expect(result.issue).to have_attributes(
      project_id: destination_project.id,
      tracker_id: shared_tracker.id,
      assigned_to_id: previous_assignee.id,
      assigned_to_id_was: previous_assignee.id
    )
    expect(Issue.find(issue.id)).to have_attributes(
      project_id: source_project.id,
      assigned_to_id: previous_assignee.id
    )
  end

  it 'materializes a destination tracker fallback and shared version capability without persisting the move' do
    source_project = issue.project
    destination_project = Project.find(2)
    source_tracker = Tracker.find(1)
    destination_tracker = Tracker.find(2)
    role = Member.find_by!(user_id: current_user.id, project_id: source_project.id).roles.first
    destination_member = Member.find_or_create_by!(user_id: current_user.id, project_id: destination_project.id)
    destination_member.roles << role unless destination_member.roles.include?(role)
    source_project.trackers = [source_tracker]
    destination_project.trackers = [destination_tracker]
    shared_version = Version.create!(project: source_project, name: 'Canvas shared version', sharing: 'system')
    issue.update_columns(project_id: source_project.id, tracker_id: source_tracker.id)
    issue.reload
    evaluator = described_class.new(
      current_user: current_user,
      project_scope_ids: [source_project.id, destination_project.id]
    )

    result = evaluator.evaluate(
      issue: issue,
      intent: { project_id: destination_project.id, lock_version: issue.lock_version }
    )

    expect(result).to be_valid
    expect(result.materialized).to include(
      project_id: destination_project.id,
      tracker_id: destination_tracker.id
    )
    expect(result.normalizations).to include(
      include(field: 'tracker_id', from: source_tracker.id, to: destination_tracker.id, source: 'policy')
    )
    expect(result.issue.assignable_versions.map(&:id)).to include(shared_version.id)
    payload = RedmineCanvasGantt::EditMetaPayloadBuilder.new(current_user: current_user).build(
      issue: issue,
      persisted_task: { id: issue.id },
      editable: {},
      custom_fields: [],
      custom_field_values: {},
      permissions: {},
      project_scope_ids: [source_project.id, destination_project.id],
      capability_issue: result.issue
    )
    expect(payload.dig(:options, :versions)).to include(id: shared_version.id, name: shared_version.name)
    expect(Issue.find(issue.id)).to have_attributes(
      project_id: source_project.id,
      tracker_id: source_tracker.id
    )
  end

  it 'keeps preview SQL query count constant at 1, 100, and 1000 visible issues' do
    template = issue.attributes.except('id')
    Issue.where.not(id: issue.id).delete_all
    query_counts = [1, 100, 1000].map do |target_count|
      existing_count = Issue.where(project_id: issue.project_id).count
      missing_count = target_count - existing_count
      if missing_count.positive?
        Issue.insert_all!(missing_count.times.map do |index|
          template.merge(
            'subject' => "Canvas preview scale #{target_count}-#{index}",
            'created_on' => Time.current,
            'updated_on' => Time.current
          )
        end)
      end

      preview_issue = Issue.find(issue.id)
      evaluator.evaluate(
        issue: preview_issue,
        intent: { subject: "warm #{target_count}", lock_version: preview_issue.lock_version }
      )
      preview_issue.reload
      sql_query_count do
        evaluator.evaluate(
          issue: preview_issue,
          intent: { subject: "measured #{target_count}", lock_version: preview_issue.lock_version }
        )
      end
    end

    expect(query_counts.uniq).to contain_exactly(query_counts.first)
  end

  it 'keeps draft preview within five SQL queries of the legacy target preview' do
    legacy_issue = Issue.find(issue.id)
    evaluator.evaluate(issue: legacy_issue, intent: { tracker_id: legacy_issue.tracker_id })
    legacy_issue.reload
    legacy_query_count = sql_query_count do
      evaluator.evaluate(issue: legacy_issue, intent: { tracker_id: legacy_issue.tracker_id })
    end

    draft_issue = Issue.find(issue.id)
    evaluator.evaluate(
      issue: draft_issue,
      intent: { tracker_id: draft_issue.tracker_id, lock_version: draft_issue.lock_version }
    )
    draft_issue.reload
    draft_query_count = sql_query_count do
      evaluator.evaluate(
        issue: draft_issue,
        intent: { tracker_id: draft_issue.tracker_id, lock_version: draft_issue.lock_version }
      )
    end

    expect(draft_query_count).to be <= legacy_query_count + 5
  end
end
