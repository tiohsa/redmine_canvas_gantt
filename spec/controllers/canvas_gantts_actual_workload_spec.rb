require_relative '../spec_helper'

RSpec.describe CanvasGanttsController, type: :controller do
  fixtures :projects, :users, :roles, :members, :member_roles, :enabled_modules,
           :trackers, :issue_statuses, :issues, :enumerations, :time_entries, :queries

  let(:project) { Project.find(1) }
  let(:issue) { Issue.find(1) }
  let(:date) { Date.new(2026, 9, 7) }

  before do
    project.enable_module!(:canvas_gantt)
    controller.send(:start_user_session, User.find(1))
    User.current = User.find(1)
    TimeEntry.delete_all
  end

  def entry(hours:, user_id: 2, issue_id: 1, spent_on: date)
    TimeEntry.create!(project: Issue.find(issue_id).project, issue_id: issue_id, user_id: user_id,
                      author_id: 1, activity_id: TimeEntryActivity.first.id, hours: hours, spent_on: spent_on)
  end

  def fetch_actual(extra = {})
    get :actual_workload, params: { project_id: project.id, format: :json,
      from: date.iso8601, to: date.iso8601, include_closed: '1', leaf_only: '0' }.merge(extra)
  end

  it 'aggregates repeated entries by worker, date and issue, without leaking other dates/projects or issue-less time' do
    other_project = Issue.find(4).project
    other_project.enable_module!(:time_tracking)

    entry(hours: 2)
    entry(hours: 1)
    entry(hours: 4, user_id: 3)
    entry(hours: 5, spent_on: date - 1)
    entry(hours: 6, issue_id: 4)

    TimeEntry.create!(
      project: project,
      user_id: 2,
      author_id: 1,
      activity_id: TimeEntryActivity.first.id,
      hours: 2,
      spent_on: date
    )

    fetch_actual(canvas_project_ids: [project.id.to_s])

    expect(response).to have_http_status(:ok)

    rows = JSON.parse(response.body).fetch('entries')
    expect(rows.map { |row| [row['userId'], row['hours']] })
      .to contain_exactly([2, 3.0], [3, 4.0])

    expect(rows).to all(
      include('issueId' => '1', 'spentOn' => date.iso8601)
    )
  end

  it 'keeps child issues but excludes an unrelated visible project from data and actual workload' do
    child = Project.create!(name: 'Canvas child', identifier: 'canvas-gantt-child', parent: project, is_public: true)
    child.enable_module!(:issue_tracking)
    child.enable_module!(:time_tracking)
    child.enable_module!(:canvas_gantt)
    child_issue = issue.copy
    child_issue.project = child
    child_issue.subject = 'Child scope issue'
    child_issue.save!
    outside_issue = Issue.find(4)
    outside_issue.project.enable_module!(:time_tracking)
    entry(hours: 2, user_id: 1, issue_id: child_issue.id)
    entry(hours: 3, user_id: 1, issue_id: outside_issue.id)
    selection = [child.id.to_s, outside_issue.project_id.to_s]

    get :data, params: { project_id: project.id, format: :json, canvas_project_ids: selection }
    expect(response).to have_http_status(:ok)
    tasks = JSON.parse(response.body).fetch('tasks')
    data_ids = tasks.map { |task| task.fetch('id') }
    expect(data_ids).to include(child_issue.id)
    expect(data_ids).not_to include(outside_issue.id)
    expect(tasks.find { |task| task.fetch('id') == child_issue.id }.fetch('spent_hours')).to eq(2.0)

    get :data, params: { project_id: project.id, format: :json, member_projects_only: '1' }
    expect(response).to have_http_status(:ok)
    option_ids = JSON.parse(response.body).fetch('filter_options').fetch('projects').map { |option| option.fetch('id') }
    expect(option_ids).to include(project.id, child.id)
    expect(option_ids).not_to include(outside_issue.project_id)

    fetch_actual(canvas_project_ids: selection)
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).fetch('entries').map { |row| row['issueId'] })
      .to eq([child_issue.id.to_s])
  end

  it 'shows member candidates without target Canvas access and reads only explicitly selected external tasks' do
    outside_issue = Issue.find(4)
    outside_project = outside_issue.project
    outside_project.update_column(:status, Project::STATUS_ACTIVE)
    outside_project.enable_module!(:time_tracking)
    expect(User.current.allowed_to?(:view_canvas_gantt, outside_project)).to be(false)
    entry(hours: 3, user_id: 1, issue_id: outside_issue.id)
    tree_project_ids = project.self_and_descendants.pluck(:id).map(&:to_s)

    get :data, params: { project_id: project.id, format: :json, member_projects_only: '1' }

    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body.fetch('tasks').map { |task| task.fetch('id') }).not_to include(outside_issue.id)
    expect(body.fetch('project_scope')).to eq(
      'root_project_id' => project.id.to_s,
      'candidate_mode' => 'member_all',
      'selection_explicit' => false,
      'selected_project_ids' => [],
      'effective_project_ids' => tree_project_ids
    )
    candidate = body.fetch('filter_options').fetch('projects').find do |option|
      option.fetch('id') == outside_project.id
    end
    expect(candidate).to include(
      'identifier' => outside_project.identifier,
      'selectable' => true
    )

    get :data, params: {
      project_id: project.id,
      format: :json,
      member_projects_only: '1',
      canvas_project_ids: [outside_project.id.to_s]
    }

    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body.fetch('tasks').map { |task| task.fetch('id') }).to include(outside_issue.id)
    expect(body.fetch('project_scope')).to include(
      'selection_explicit' => true,
      'selected_project_ids' => [outside_project.id.to_s],
      'effective_project_ids' => [outside_project.id.to_s]
    )
    expect(body.fetch('tasks').find { |task| task.fetch('id') == outside_issue.id }.fetch('spent_hours')).to eq(3.0)

    fetch_actual(member_projects_only: '1', canvas_project_ids: [outside_project.id.to_s])
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).fetch('entries').map { |row| row.fetch('issueId') })
      .to eq([outside_issue.id.to_s])

    get :data, params: {
      project_id: project.id,
      format: :json,
      canvas_project_ids: [outside_project.id.to_s]
    }

    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).fetch('tasks').map { |task| task.fetch('id') })
      .not_to include(outside_issue.id)
  end

  it 'requires explicit member mode and a server-authorized project scope for cross-root writes' do
    outside_issue = Issue.find(4)
    outside_project = outside_issue.project
    outside_project.update_column(:status, Project::STATUS_ACTIVE)
    expect(User.current.allowed_to?(:view_canvas_gantt, outside_project)).to be(false)
    original_subject = outside_issue.subject
    attributes = ->(subject) { { subject: subject, lock_version: outside_issue.reload.lock_version } }

    patch :update, params: {
      project_id: project.id,
      id: outside_issue.id,
      format: :json,
      canvas_project_ids: [outside_project.id.to_s],
      task: attributes.call('URL only scope')
    }
    expect(response).to have_http_status(:not_found)
    expect(outside_issue.reload.subject).to eq(original_subject)

    patch :update, params: {
      project_id: project.id,
      id: outside_issue.id,
      format: :json,
      member_projects_only: '1',
      task: attributes.call('Mode without selection')
    }
    expect(response).to have_http_status(:not_found)
    expect(outside_issue.reload.subject).to eq(original_subject)

    patch :update, params: {
      project_id: project.id,
      id: outside_issue.id,
      format: :json,
      member_projects_only: '1',
      canvas_project_ids: [outside_project.id.to_s],
      task: attributes.call('Authorized cross-root edit')
    }

    expect(response).to have_http_status(:ok)
    expect(outside_issue.reload.subject).to eq('Authorized cross-root edit')
  end

  it 'keeps filtered baseline snapshots inside the root project tree' do
    outside_issue = Issue.find(4)
    outside_project = outside_issue.project
    outside_project.update_column(:status, Project::STATUS_ACTIVE)
    outside_project.enable_module!(:canvas_gantt)

    post :save_baseline, params: {
      project_id: project.id,
      format: :json,
      scope: 'filtered',
      member_projects_only: '1',
      canvas_project_ids: [outside_project.id.to_s]
    }

    expect(response).to have_http_status(:ok)
    task_states = JSON.parse(response.body).fetch('baseline').fetch('tasks_by_issue_id')
    expect(task_states.keys).not_to include(outside_issue.id.to_s)
  end

  it 'returns no data or actual workload for an explicit empty project selection' do
    entry(hours: 2)
    get :data, params: { project_id: project.id, format: :json, canvas_project_ids: ['none'] }
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).fetch('tasks')).to eq([])

    fetch_actual(canvas_project_ids: ['none'])
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).fetch('entries')).to eq([])
  end

  it 'rejects missing, reversed and excessive date ranges' do
    [ { from: '' }, { from: '2026-09-08' }, { to: '2040-01-01' } ].each do |params|
      fetch_actual(params)
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  it 'accepts an inclusive 730-day range and includes entries on both boundaries' do
    entry(hours: 2)
    entry(hours: 3, spent_on: date + 729)
    entry(hours: 4, spent_on: date + 730)

    fetch_actual(to: (date + 729).iso8601)

    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).fetch('entries').map { |row| row['hours'] }).to contain_exactly(2.0, 3.0)
  end

  it 'rejects a 731-day range using the existing invalid-range error contract' do
    fetch_actual(to: (date + 730).iso8601)

    expect(response).to have_http_status(:unprocessable_entity)
    expect(JSON.parse(response.body)).to eq('error' => 'Invalid workload date range')
  end

  it 'keeps a physical parent out of leaf-only results when its child is excluded by the query' do
    child = issue.copy
    child.subject = 'Filtered child'
    child.parent_issue_id = issue.id
    child.save!
    entry(hours: 3)
    filter = { set_filter: '1', f: ['issue_id'], op: { issue_id: '=' }, v: { issue_id: [issue.id.to_s] } }

    fetch_actual(filter)
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).fetch('entries').map { |row| row['issueId'] }).to eq([issue.id.to_s])
    fetch_actual(filter.merge(leaf_only: '1'))
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).fetch('entries')).to eq([])
  end

  it 'applies closed and leaf filters independently of estimates and scheduling' do
    issue.update_columns(start_date: nil, due_date: nil, estimated_hours: nil)
    entry(hours: 3)
    fetch_actual
    expect(JSON.parse(response.body)['entries'].size).to eq(1)
    issue.update_column(:status_id, IssueStatus.where(is_closed: true).first.id)
    fetch_actual(include_closed: '0')
    expect(JSON.parse(response.body)['entries']).to eq([])
    issue.update_columns(lft: 1, rgt: 4)
    fetch_actual(leaf_only: '1')
    expect(JSON.parse(response.body)['entries']).to eq([])
  end

  it 'uses the current Issue query scope' do
    entry(hours: 3)
    fetch_actual(set_filter: '1', f: ['assigned_to_id'], op: { assigned_to_id: '=' }, v: { assigned_to_id: ['99999'] })
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body)['entries']).to eq([])
  end

  it 'does not expose private issues even when time entry visibility is all' do
    role = Role.find(1)
    role.update!(permissions: role.permissions | [:view_canvas_gantt, :view_time_entries], issues_visibility: 'default', time_entries_visibility: 'all')
    issue.update_columns(is_private: true, author_id: 1, assigned_to_id: 1)
    entry(hours: 3)
    controller.send(:start_user_session, User.find(2))
    User.current = User.find(2)
    fetch_actual
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body)['entries']).to eq([])
  end

  it 'respects own-time visibility and refuses access without Canvas permission' do
    role = Role.find(1)
    role.update!(permissions: role.permissions | [:view_canvas_gantt, :view_time_entries], time_entries_visibility: 'own')
    entry(hours: 2, user_id: 2)
    entry(hours: 3, user_id: 3)
    controller.send(:start_user_session, User.find(2))
    User.current = User.find(2)
    fetch_actual
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body)['entries'].map { |row| row['userId'] }).to eq([2])
    role.update!(permissions: role.permissions - [:view_canvas_gantt])
    User.current = User.find(2)
    fetch_actual
    expect(response).to have_http_status(:forbidden)
  end

  it 'uses the same visible hours for data, sorting, and actual workload' do
    role = Role.find(1)
    role.update!(permissions: role.permissions | [:view_canvas_gantt, :view_time_entries], time_entries_visibility: 'own')
    second_issue = issue.copy
    second_issue.subject = 'Hours sort comparison'
    second_issue.save!
    entry(hours: 2, user_id: 2)
    entry(hours: 3, user_id: 3)
    entry(hours: 1, user_id: 2, issue_id: second_issue.id)
    entry(hours: 6, user_id: 3, issue_id: second_issue.id)

    [
      [User.find(1), [5.0, 7.0]],
      [User.find(2), [2.0, 1.0]]
    ].each do |user, expected|
      controller.send(:start_user_session, user)
      User.current = user
      get :data, params: { project_id: project.id, format: :json, sort: 'spent_hours:desc' }
      expect(response).to have_http_status(:ok)
      tasks = JSON.parse(response.body).fetch('tasks')
      hours = tasks.to_h { |task| [task.fetch('id'), task.fetch('spent_hours')] }
      expect([hours.fetch(issue.id), hours.fetch(second_issue.id)]).to eq(expected)
      selected = tasks.select { |task| [issue.id, second_issue.id].include?(task.fetch('id')) }
      expect(selected.map { |task| task.fetch('spent_hours') }).to eq(expected.sort.reverse)

      fetch_actual
      expect(response).to have_http_status(:ok)
      visible_hours = JSON.parse(response.body).fetch('entries').sum { |row| row.fetch('hours') }
      expect(visible_hours).to eq(expected.sum)
    end

    role.update!(permissions: role.permissions - [:view_time_entries])
    user = User.find(2)
    controller.send(:start_user_session, user)
    User.current = user
    get :data, params: { project_id: project.id, format: :json, sort: 'spent_hours:desc' }
    expect(response).to have_http_status(:ok)
    tasks = JSON.parse(response.body).fetch('tasks')
    expect(tasks.select { |task| [issue.id, second_issue.id].include?(task.fetch('id')) }
      .map { |task| task.fetch('spent_hours') }).to eq([0.0, 0.0])
    fetch_actual
    expect(JSON.parse(response.body).fetch('entries')).to eq([])
  end

  it 'includes visible child issues in data and actual workload without child Canvas access' do
    role = Role.find(1)
    role.update!(permissions: role.permissions | [:view_canvas_gantt, :view_issues, :view_time_entries], time_entries_visibility: 'own')
    child = Project.create!(name: 'Canvas permission child', identifier: 'canvas-permission-child', parent: project, is_public: true)
    child.enable_module!(:issue_tracking)
    child.enable_module!(:time_tracking)
    Member.create!(project: child, user: User.find(2), roles: [role])
    child_issue = issue.copy
    child_issue.project = child
    child_issue.subject = 'Visible child without Canvas module'
    child_issue.save!
    entry(hours: 2, user_id: 2, issue_id: child_issue.id)
    user = User.find(2)
    controller.send(:start_user_session, user)
    User.current = user

    expect(child.module_enabled?(:canvas_gantt)).to be(false)
    get :data, params: { project_id: project.id, format: :json, canvas_project_ids: [child.id.to_s] }
    expect(response).to have_http_status(:ok)
    tasks = JSON.parse(response.body).fetch('tasks')
    expect(tasks.map { |task| task.fetch('id') }).to include(child_issue.id)
    expect(tasks.find { |task| task.fetch('id') == child_issue.id }.fetch('spent_hours')).to eq(2.0)

    fetch_actual(canvas_project_ids: [child.id.to_s])
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).fetch('entries').map { |row| row.fetch('issueId') })
      .to include(child_issue.id.to_s)
  end

  it 'runs the hours aggregation once for spent-hours sorting and skips empty selections' do
    entry(hours: 2)
    aggregated = []
    subscriber = ActiveSupport::Notifications.subscribe('sql.active_record') do |_name, _started, _finished, _id, payload|
      sql = payload[:sql].to_s
      aggregated << sql if sql.match?(/SUM\([^)]*hours[^)]*\)/i) && sql.include?('time_entries')
    end
    begin
      get :data, params: { project_id: project.id, format: :json, sort: 'spent_hours:desc' }
      expect(response).to have_http_status(:ok)
      expect(aggregated.length).to eq(1)

      aggregated.clear
      get :data, params: { project_id: project.id, format: :json, sort: 'subject:asc' }
      expect(response).to have_http_status(:ok)
      expect(aggregated.length).to eq(1)

      aggregated.clear
      get :data, params: { project_id: project.id, format: :json, canvas_project_ids: ['none'] }
      expect(response).to have_http_status(:ok)
      expect(aggregated).to be_empty
    ensure
      ActiveSupport::Notifications.unsubscribe(subscriber)
    end
  end

  it 'uses visible hours in single and batch mutation task states' do
    role = Role.find(1)
    role.update!(permissions: role.permissions | [:view_canvas_gantt, :view_time_entries, :edit_issues], time_entries_visibility: 'own')
    entry(hours: 2, user_id: 2)
    entry(hours: 3, user_id: 3)
    user = User.find(2)
    controller.send(:start_user_session, user)
    User.current = user

    patch :update, params: { project_id: project.id, id: issue.id, format: :json,
      task: { subject: 'Updated without hidden hours', lock_version: issue.lock_version } }
    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body).fetch('entity').fetch('spent_hours')).to eq(2.0)

    builder = controller.send(:data_payload_builder)
    expect(builder.build_task_states([issue.reload]).first.fetch(:spent_hours)).to eq(2.0)
    role.update!(permissions: role.permissions - [:view_time_entries])
    User.current = User.find(2)
    builder = RedmineCanvasGantt::DataPayloadBuilder.new(
      custom_field_extractor: controller.send(:custom_field_extractor), current_user: User.current
    )
    expect(builder.build_task_state(issue).fetch(:spent_hours)).to eq(0.0)
    expect(builder.build_task_states([issue]).first.fetch(:spent_hours)).to eq(0.0)
  end

  it 'returns visible hours for every issue in a real batched schedule mutation with one aggregate query' do
    role = Role.find(1)
    role.update!(permissions: role.permissions | [:view_canvas_gantt, :view_time_entries, :edit_issues],
                 time_entries_visibility: 'own')
    user = User.find(2)
    controller.send(:start_user_session, user)
    User.current = user
    issues = ['First batch issue', 'Second batch issue'].map do |subject|
      copy = issue.copy
      copy.subject = subject
      copy.author = user
      copy.start_date = Date.new(2027, 3, 1)
      copy.due_date = Date.new(2027, 3, 2)
      copy.save!
      copy
    end
    entry(hours: 2, user_id: 2, issue_id: issues.first.id)
    entry(hours: 3, user_id: 3, issue_id: issues.first.id)
    entry(hours: 1, user_id: 2, issue_id: issues.last.id)
    entry(hours: 6, user_id: 3, issue_id: issues.last.id)

    aggregate_sql = []
    subscriber = ActiveSupport::Notifications.subscribe('sql.active_record') do |_name, _started, _finished, _id, payload|
      sql = payload[:sql].to_s
      aggregate_sql << sql if sql.match?(/SUM\([^)]*hours[^)]*\)/i) && sql.include?('time_entries')
    end
    begin
      post :schedule_mutation, params: {
        project_id: project.id, format: :json, operation_id: 'visible-hours-batch',
        date_placement_mode: 'calendar_days',
        base_revisions: issues.to_h { |item| [item.id.to_s, item.reload.lock_version] },
        changes: issues.map { |item| { task_id: item.id, start_date: '2027-03-03', due_date: '2027-03-04' } }
      }
      expect(response).to have_http_status(:ok), response.body
      payload = JSON.parse(response.body)
      expect(payload.fetch('status')).to eq('ok')
      expect(payload.fetch('entities').to_h { |entity| [entity.fetch('id'), entity.fetch('spent_hours')] })
        .to eq(issues.first.id => 2.0, issues.last.id => 1.0)
      expect(aggregate_sql.length).to eq(1)
    ensure
      ActiveSupport::Notifications.unsubscribe(subscriber)
    end
  end

  it 'fails instead of silently truncating grouped results when the budget is exceeded' do
    entry(hours: 2)
    entry(hours: 3, user_id: 3)
    budget = RedmineCanvasGantt::DataPayloadBudget.new(environment: { 'REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS' => '1' })
    allow(controller).to receive(:data_payload_budget).and_return(budget)
    fetch_actual
    expect(response).to have_http_status(:payload_too_large)
  end
end
