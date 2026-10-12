require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/issue_selector'
require_relative '../../../lib/redmine_canvas_gantt/data_payload_budget'

RSpec.describe RedmineCanvasGantt::IssueSelector, type: :model do
  fixtures :projects, :users, :roles, :members, :member_roles,
           :trackers, :issue_statuses, :workflows, :enumerations, :issues

  let(:current_user) { User.find(2) }
  let(:tracker) { Tracker.find(1) }
  let(:open_status) { IssueStatus.where(is_closed: false).first }
  let(:closed_status) { IssueStatus.where(is_closed: true).first }
  let(:issue_includes) { [:status, :project, { custom_values: :custom_field }] }

  before { User.current = current_user }

  def create_project(identifier, user: current_user)
    project = Project.create!(
      name: identifier.humanize,
      identifier: identifier,
      is_public: false,
      enabled_module_names: ['issue_tracking']
    )
    project.trackers = [tracker]
    role = Role.create!(name: "#{identifier} issue viewer", permissions: [:view_issues])
    Member.create!(project: project, user: user, roles: [role])
    project
  end

  def create_issue(project:, subject:, author: current_user, status: open_status, is_private: false)
    Issue.create!(
      project: project,
      tracker: tracker,
      status: status,
      author: author,
      subject: subject,
      is_private: is_private
    )
  end

  def select_issues(project_ids:, state: {}, redmine_project_ids: nil, scope_only: false, budget: nil)
    scoped_selector = described_class.new(
      issue_scope: Issue.visible(current_user).includes(*issue_includes),
      issue_includes: issue_includes,
      current_user: current_user,
      data_payload_budget: budget
    )
    scoped_selector.call(
      query_issue_scope: nil,
      project_ids: project_ids,
      redmine_project_ids: redmine_project_ids,
      state: {
        selected_status_ids: [],
        selected_version_ids: [],
        selected_assignee_ids: [],
        selected_tracker_ids: [],
        sort_config: nil
      }.merge(state),
      scope_only: scope_only
    )
  end

  it 'preserves Redmine visibility for non-admins, private issues, closed issues, closed projects, and selected projects' do
    expect(current_user).not_to be_admin

    selected_project = create_project('canvas-selector-selected')
    other_visible_project = create_project('canvas-selector-other-visible')
    hidden_project = create_project('canvas-selector-hidden', user: User.find(3))
    closed_project = create_project('canvas-selector-closed-project')
    create_issue(project: closed_project, subject: 'Closed project issue')
    closed_project.update_columns(status: Project::STATUS_CLOSED)

    selected_issue = create_issue(project: selected_project, subject: 'Selected open issue')
    closed_issue = create_issue(
      project: selected_project,
      subject: 'Selected closed issue',
      status: closed_status
    )
    private_issue = create_issue(
      project: selected_project,
      subject: 'Private issue',
      author: User.find(3),
      is_private: true
    )
    other_project_issue = create_issue(project: other_visible_project, subject: 'Other selected project')
    hidden_project_issue = create_issue(project: hidden_project, subject: 'Non-member private project')

    candidate_project_ids = [selected_project.id, other_visible_project.id, hidden_project.id, closed_project.id]
    selected = select_issues(project_ids: candidate_project_ids)
    expected_visible_ids = Issue.visible(current_user).where(project_id: candidate_project_ids).pluck(:id)
    expect(selected.map(&:id)).to match_array(expected_visible_ids)
    expect(selected.map(&:id)).to include(selected_issue.id, closed_issue.id, other_project_issue.id)
    expect(selected.map(&:id)).not_to include(private_issue.id, hidden_project_issue.id)

    selected_project_only = select_issues(project_ids: [selected_project.id])
    expect(selected_project_only.map(&:id)).to contain_exactly(selected_issue.id, closed_issue.id)
    expect(selected_project_only.map(&:id)).not_to include(private_issue.id, hidden_project_issue.id)
  end

  it 'preloads multiple custom values without multiplying issue rows' do
    project = create_project('canvas-selector-custom-values')
    issues = 3.times.map do |index|
      create_issue(project: project, subject: "Custom value issue #{index}")
    end
    custom_fields = 3.times.map do |index|
      IssueCustomField.create!(
        name: "Canvas selector field #{index}",
        field_format: 'string',
        is_for_all: true
      )
    end
    issues.each do |issue|
      custom_fields.each_with_index do |custom_field, index|
        CustomValue.create!(
          customized: issue,
          custom_field: custom_field,
          value: "issue-#{issue.id}-field-#{index}"
        )
      end
    end

    sql = []
    subscriber = lambda do |_name, _start, _finish, _id, payload|
      next if payload[:cached] || payload[:name] == 'SCHEMA'

      sql << payload[:sql].to_s
    end
    selected = nil
    ActiveSupport::Notifications.subscribed(subscriber, 'sql.active_record') do
      selected = select_issues(
        project_ids: [project.id],
        state: { sort_config: { key: 'subject', direction: 'desc' } }
      )
      selected.each { |issue| issue.custom_values.load }
    end

    expect(selected.map(&:id)).to match_array(issues.map(&:id))
    expect(selected.map(&:id).uniq.size).to eq(issues.size)
    expect(selected.map(&:subject)).to eq(selected.map(&:subject).sort.reverse)
    expect(selected).to all(satisfy { |issue| issue.association(:custom_values).loaded? })
    expect(sql.any? { |statement| statement.match?(/JOIN\s+["`]?custom_values/i) }).to be(false)
    expect(sql.any? { |statement| statement.match?(/FROM\s+["`]?custom_values/i) }).to be(true)
  end

  it 'counts unique visible issues against the limit plus one budget' do
    project = create_project('canvas-selector-budget')
    issues = 3.times.map do |index|
      create_issue(project: project, subject: "Budget issue #{index}")
    end
    budget = RedmineCanvasGantt::DataPayloadBudget.new(
      environment: { 'REDMINE_CANVAS_GANTT_MAX_DATA_ISSUES' => '2' }
    )

    expect {
      select_issues(project_ids: [project.id], budget: budget)
    }.to raise_error(RedmineCanvasGantt::DataPayloadBudget::Exceeded) { |error|
      expect(error.resource).to eq('issues')
      expect(error.limit).to eq(2)
      expect(error.actual).to eq(issues.size)
    }
  end

  it 'keeps project filters in workload scope while removing eager loading and ordering' do
    selected_project = create_project('canvas-selector-workload-selected')
    other_project = create_project('canvas-selector-workload-other')
    selected_issue = create_issue(project: selected_project, subject: 'Workload selected')
    create_issue(project: other_project, subject: 'Workload other')

    scope = select_issues(
      project_ids: [selected_project.id, other_project.id],
      redmine_project_ids: [selected_project.id],
      state: { sort_config: { key: 'subject', direction: 'desc' } },
      scope_only: true
    )

    expect(scope).to be_a(ActiveRecord::Relation)
    expect(scope.includes_values).to be_empty
    expect(scope.preload_values).to be_empty
    expect(scope.order_values).to be_empty
    expect(scope.pluck(:id)).to contain_exactly(selected_issue.id)
  end
end
