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
    entry(hours: 2)
    entry(hours: 1)
    entry(hours: 4, user_id: 3)
    entry(hours: 5, spent_on: date - 1)
    entry(hours: 6, issue_id: 4)
    TimeEntry.create!(project: project, user_id: 2, author_id: 1,
                      activity_id: TimeEntryActivity.first.id, hours: 2, spent_on: date)
    fetch_actual(canvas_project_ids: [project.id.to_s])
    expect(response).to have_http_status(:ok)
    rows = JSON.parse(response.body).fetch('entries')
    expect(rows.map { |row| [row['userId'], row['hours']] }).to contain_exactly([2, 3.0], [3, 4.0])
    expect(rows).to all(include('issueId' => '1', 'spentOn' => date.iso8601))
  end

  it 'rejects missing, reversed and excessive date ranges' do
    [ { from: '' }, { from: '2026-09-08' }, { to: '2040-01-01' } ].each do |params|
      fetch_actual(params)
      expect(response).to have_http_status(:unprocessable_entity)
    end
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

  it 'fails instead of silently truncating grouped results when the budget is exceeded' do
    entry(hours: 2)
    entry(hours: 3, user_id: 3)
    budget = RedmineCanvasGantt::DataPayloadBudget.new(environment: { 'REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS' => '1' })
    allow(controller).to receive(:data_payload_budget).and_return(budget)
    fetch_actual
    expect(response).to have_http_status(:payload_too_large)
  end
end
