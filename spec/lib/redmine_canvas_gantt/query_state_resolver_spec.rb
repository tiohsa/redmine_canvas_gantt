require_relative '../../spec_helper'

RSpec.describe RedmineCanvasGantt::QueryStateResolver do
  let(:project) { instance_double(Project, id: 1) }
  let(:current_user) { instance_double(User, id: 5) }
  let(:issue_scope) { double('IssueScope') }
  let(:issue_includes) { [:status] }
  let(:params) do
    ActionController::Parameters.new(
      query_id: '42',
      sort: 'subject:desc',
      group_by: 'assigned_to',
      project_ids: ['9'],
      show_subprojects: '0'
    )
  end
  let(:query) do
    instance_double(
      IssueQuery,
      id: 42,
      visible?: true,
      filters: {
        'status_id' => { operator: '=', values: %w[1 2] },
        'assigned_to_id' => { operator: '=', values: ['7'] },
        'project_id' => { operator: '=', values: ['1'] }
      },
      sort_criteria: [['subject', 'asc']],
      group_by: 'project'
    )
  end
  let(:working_query) do
    instance_double(
      IssueQuery,
      filters: { 'status_id' => { operator: '=', values: %w[1 2] }, 'assigned_to_id' => { operator: '=', values: ['7'] } },
      sort_criteria: [['subject', 'desc']],
      group_by: 'assigned_to',
      issue_ids: [12, 10]
    )
  end

  before do
    allow(IssueQuery).to receive(:find_by).with(id: '42').and_return(query)
    allow(query).to receive(:dup).and_return(working_query)
    allow(working_query).to receive(:filters=)
    allow(issue_scope).to receive(:where).and_return(issue_scope)
    allow(issue_scope).to receive(:includes).with(*issue_includes).and_return(issue_scope)
    allow(issue_scope).to receive(:to_a).and_return([])
  end

  it 'extracts supported shared state and applies url overrides' do
    resolver = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state]).to include(
      query_id: 42,
      selected_status_ids: [1, 2],
      selected_assignee_ids: [7],
      selected_project_ids: ['9'],
      member_projects_only: false,
      show_subprojects: false,
      sort_config: { key: 'subject', direction: 'desc' },
      group_by_assignee: true,
      group_by_project: false
    )
  end

  it 'warns and falls back when query_id is invalid' do
    allow(IssueQuery).to receive(:find_by).with(id: '42').and_return(nil)

    resolver = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:warnings]).not_to be_empty
    expect(result[:initial_state][:query_id]).to be_nil
  end

  it 'parses supported Redmine standard issue query params' do
    open_status_relation = instance_double(ActiveRecord::Relation)
    params = ActionController::Parameters.new(
      set_filter: '1',
      f: ['status_id', 'assigned_to_id', 'project_id', 'fixed_version_id', 'subproject_id', 'tracker_id'],
      op: {
        'status_id' => 'o',
        'assigned_to_id' => '=',
        'project_id' => '=',
        'fixed_version_id' => '=',
        'subproject_id' => '!*',
        'tracker_id' => '='
      },
      v: {
        'assigned_to_id' => %w[7 none],
        'project_id' => ['9'],
        'fixed_version_id' => ['11'],
        'tracker_id' => ['3']
      },
      sort: 'start_date:desc',
      group_by: 'project'
    )

    allow(IssueStatus).to receive(:where).with(is_closed: false).and_return(open_status_relation)
    allow(open_status_relation).to receive(:pluck).with(:id).and_return([1, 2])

    resolver = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state]).to include(
      selected_status_ids: [1, 2],
      selected_assignee_ids: [7, nil],
      selected_project_ids: ['9'],
      selected_version_ids: ['11'],
      member_projects_only: false,
      show_subprojects: false,
      sort_config: { key: 'startDate', direction: 'desc' },
      group_by_project: true,
      group_by_assignee: false
    )
    expect(result[:warnings]).to include('Ignored unsupported field tracker_id')
  end

  it 'preserves unassigned assignee selections from saved queries' do
    query = instance_double(
      IssueQuery,
      id: 99,
      visible?: true,
      filters: {
        'assigned_to_id' => { operator: '=', values: ['none'] }
      },
      sort_criteria: nil,
      group_by: nil
    )
    working_query = instance_double(
      IssueQuery,
      filters: {},
      sort_criteria: nil,
      group_by: nil,
      issue_ids: []
    )

    allow(IssueQuery).to receive(:find_by).with(id: '99').and_return(query)
    allow(query).to receive(:dup).and_return(working_query)
    allow(working_query).to receive(:filters=)

    resolver = described_class.new(
      project: project,
      params: ActionController::Parameters.new(query_id: '99'),
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state][:selected_assignee_ids]).to eq([nil])
  end

  it 'preserves no-version selections from saved queries as _none' do
    query = instance_double(
      IssueQuery,
      id: 100,
      visible?: true,
      filters: {
        'fixed_version_id' => { operator: '=', values: ['none'] }
      },
      sort_criteria: nil,
      group_by: nil
    )
    working_query = instance_double(
      IssueQuery,
      filters: {},
      sort_criteria: nil,
      group_by: nil,
      issue_ids: []
    )

    allow(IssueQuery).to receive(:find_by).with(id: '100').and_return(query)
    allow(query).to receive(:dup).and_return(working_query)
    allow(working_query).to receive(:filters=)

    resolver = described_class.new(
      project: project,
      params: ActionController::Parameters.new(query_id: '100'),
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state][:selected_version_ids]).to eq(['_none'])
  end

  it 'normalizes version none overrides to _none' do
    params = ActionController::Parameters.new(fixed_version_id: ['none'])

    resolver = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state][:selected_version_ids]).to eq(['_none'])
  end

  it 'preserves assignee none overrides as nil' do
    params = ActionController::Parameters.new(assigned_to_id: ['none'])

    resolver = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state][:selected_assignee_ids]).to eq([nil])
  end

  it 'preserves assignee none overrides from Canvas plural params as nil' do
    params = ActionController::Parameters.new(assigned_to_ids: ['none'])

    resolver = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state][:selected_assignee_ids]).to eq([nil])
  end

  it 'normalizes version none overrides from Canvas plural params to _none' do
    params = ActionController::Parameters.new(fixed_version_ids: ['none'])

    resolver = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state][:selected_version_ids]).to eq(['_none'])
  end

  it 'filters no-version selections with fixed_version_id nil' do
    query = instance_double(
      IssueQuery,
      id: 100,
      visible?: true,
      filters: {
        'fixed_version_id' => { operator: '=', values: ['none'] }
      },
      sort_criteria: nil,
      group_by: nil
    )
    working_query = instance_double(
      IssueQuery,
      filters: {},
      sort_criteria: nil,
      group_by: nil,
      issue_ids: [12]
    )
    filtered_scope = double('FilteredScope')

    allow(IssueQuery).to receive(:find_by).with(id: '100').and_return(query)
    allow(query).to receive(:dup).and_return(working_query)
    allow(working_query).to receive(:filters=)

    expect(issue_scope).to receive(:where).with(project_id: [1, 2]).and_return(issue_scope)
    expect(issue_scope).to receive(:where).with(id: [12]).and_return(issue_scope)
    expect(issue_scope).to receive(:where).with(fixed_version_id: nil).and_return(filtered_scope)
    expect(filtered_scope).to receive(:includes).with(*issue_includes).and_return(filtered_scope)
    allow(filtered_scope).to receive(:to_a).and_return([])

    resolver = described_class.new(
      project: project,
      params: ActionController::Parameters.new(query_id: '100'),
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    resolver.resolve(project_ids: [1, 2])
  end

  it 'lets supported standard filters clear saved-query filters' do
    params = ActionController::Parameters.new(
      query_id: '42',
      set_filter: '1',
      f: ['status_id', 'assigned_to_id', 'subproject_id'],
      op: {
        'status_id' => '*',
        'assigned_to_id' => '!*',
        'subproject_id' => '*'
      },
      sort: 'start_date:asc'
    )

    resolver = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state]).to include(
      query_id: 42,
      selected_status_ids: [],
      selected_assignee_ids: [nil],
      member_projects_only: false,
      show_subprojects: true,
      sort_config: { key: 'startDate', direction: 'asc' }
    )
  end

  it 'parses member_projects_only from url params' do
    params = ActionController::Parameters.new(member_projects_only: '1')

    resolver = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state]).to include(
      member_projects_only: true
    )
  end
end
