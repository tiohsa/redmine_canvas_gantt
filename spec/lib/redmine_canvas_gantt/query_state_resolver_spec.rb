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
      id: nil,
      filters: {
        'status_id' => { operator: '=', values: %w[1 2] },
        'assigned_to_id' => { operator: '=', values: ['7'] },
        'project_id' => { operator: '=', values: ['1'] }
      },
      sort_criteria: [['subject', 'desc']],
      group_by: 'assigned_to',
      issue_ids: [12, 10]
    )
  end

  before do
    allow(IssueQuery).to receive(:find_by).with(id: '42').and_return(query)
    allow(query).to receive(:dup).and_return(working_query)
    allow(working_query).to receive(:filters=)
    allow(working_query).to receive(:column_names).and_return([])
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
    expect(result[:query_context]).to eq(
      query_id: 42,
      explicit_overrides: {}
    )
  end

  it 'accepts group_by none without warning and disables both grouping modes' do
    resolver = described_class.new(
      project: project,
      params: ActionController::Parameters.new(group_by: 'none'),
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state]).to include(
      group_by_project: false,
      group_by_assignee: false
    )
    expect(result[:warnings]).to be_empty
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
    expect(result[:query_context]).to eq(
      query_id: nil,
      explicit_overrides: {}
    )
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
    allow(issue_scope).to receive(:or).with(issue_scope).and_return(issue_scope)

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
      selected_project_ids: ['1', '2'],
      selected_version_ids: ['11'],
      member_projects_only: false,
      show_subprojects: true,
      sort_config: { key: 'startDate', direction: 'desc' },
      group_by_project: true,
      group_by_assignee: false
    )
    expect(result[:query_context]).to include(
      query_id: nil,
      explicit_overrides: {
        status: { mode: 'subset', values: [1, 2] },
        assignee: { mode: 'subset', values: [7, nil] },
        project: { mode: 'subset', values: ['9'] },
        version: { mode: 'subset', values: ['11'] }
      }
    )
    expect(result[:warnings]).to include('Ignored unsupported field tracker_id')
  end

  it 'keeps standard subproject filters in the Redmine query without changing Canvas state' do
    query = instance_double(
      IssueQuery,
      id: 102,
      visible?: true,
      filters: {
        'subproject_id' => { operator: '*', values: [] }
      },
      sort_criteria: nil,
      group_by: nil
    )
    working_query = instance_double(
      IssueQuery,
      filters: {},
      sort_criteria: nil,
      group_by: nil,
      issue_ids: [23]
    )

    allow(IssueQuery).to receive(:find_by).with(id: '102').and_return(query)
    allow(query).to receive(:dup).and_return(working_query)
    expect(working_query).to receive(:filters=).with({
      'subproject_id' => { operator: '!*', values: [] }
    })
    allow(working_query).to receive(:column_names).and_return([])
    expect(issue_scope).to receive(:where).with(project_id: [1]).and_return(issue_scope)
    expect(issue_scope).to receive(:where).with(id: [23]).and_return(issue_scope)

    resolver = described_class.new(
      project: project,
      params: ActionController::Parameters.new(
        query_id: '102',
        set_filter: '1',
        f: ['subproject_id'],
        op: { 'subproject_id' => '!*' },
        show_subprojects: '0'
      ),
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state][:show_subprojects]).to be(false)
  end

  it 'splits comma and pipe separated Canvas project ids from url params' do
    params = ActionController::Parameters.new(canvas_project_ids: ['9|10', '11,12', '12'])

    resolver = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state][:selected_project_ids]).to eq(%w[9 10 11 12])
  end

  it 'treats Canvas project none as an explicit empty project selection without falling back to project scope' do
    params = ActionController::Parameters.new(canvas_project_ids: ['none'])
    expect(issue_scope).to receive(:where).with(project_id: []).and_return(issue_scope)

    resolver = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state][:selected_project_ids]).to eq([])
    expect(result[:query_context][:explicit_overrides]).to be_empty
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
      filters: {
        'assigned_to_id' => { operator: '=', values: ['none'] }
      },
      sort_criteria: nil,
      group_by: nil,
      issue_ids: []
    )

    allow(IssueQuery).to receive(:find_by).with(id: '99').and_return(query)
    allow(query).to receive(:dup).and_return(working_query)
    allow(working_query).to receive(:filters=)
    allow(working_query).to receive(:column_names).and_return([])

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

  it 'keeps Canvas scope separate from saved query project and subproject filters' do
    query = instance_double(
      IssueQuery,
      id: 101,
      visible?: true,
      filters: {
        'project_id' => { operator: '=', values: ['2'] },
        'subproject_id' => { operator: '!*', values: [] }
      },
      sort_criteria: nil,
      group_by: nil
    )
    working_query = instance_double(
      IssueQuery,
      filters: query.filters,
      sort_criteria: nil,
      group_by: nil,
      issue_ids: [22]
    )

    allow(IssueQuery).to receive(:find_by).with(id: '101').and_return(query)
    allow(query).to receive(:dup).and_return(working_query)
    expect(working_query).to receive(:filters=).with({
      'project_id' => { operator: '=', values: ['2'] },
      'subproject_id' => { operator: '!*', values: [] }
    })
    allow(working_query).to receive(:column_names).and_return([])

    expect(issue_scope).to receive(:where).with(project_id: [1, 2, 3]).and_return(issue_scope)
    expect(issue_scope).to receive(:where).with(id: [22]).and_return(issue_scope)

    resolver = described_class.new(
      project: project,
      params: ActionController::Parameters.new(query_id: '101'),
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2, 3])

    expect(result[:initial_state]).to include(
      selected_project_ids: %w[1 2 3],
      show_subprojects: true
    )
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
      filters: {
        'fixed_version_id' => { operator: '=', values: ['none'] }
      },
      sort_criteria: nil,
      group_by: nil,
      issue_ids: []
    )

    allow(IssueQuery).to receive(:find_by).with(id: '100').and_return(query)
    allow(query).to receive(:dup).and_return(working_query)
    allow(working_query).to receive(:filters=)
    allow(working_query).to receive(:column_names).and_return([])

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
      filters: {
        'fixed_version_id' => { operator: '=', values: ['none'] }
      },
      sort_criteria: nil,
      group_by: nil,
      issue_ids: [12]
    )
    filtered_scope = double('FilteredScope')

    allow(IssueQuery).to receive(:find_by).with(id: '100').and_return(query)
    allow(query).to receive(:dup).and_return(working_query)
    allow(working_query).to receive(:filters=)
    allow(working_query).to receive(:column_names).and_return([])

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
    expect(result[:query_context]).to eq(
      query_id: 42,
      explicit_overrides: {
        status: { mode: 'all' },
        assignee: { mode: 'subset', values: [nil] }
      }
    )
  end

  it 'extracts visible columns from saved query column names' do
    allow(working_query).to receive(:column_names).and_return(%w[subject assigned_to fixed_version cf_101 unknown])

    resolver = described_class.new(
      project: project,
      params: ActionController::Parameters.new(query_id: '42'),
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state][:visible_columns]).to eq(%w[subject assignee version cf:101])
  end

  it 'applies c params as visible column overrides' do
    allow(working_query).to receive(:column_names).and_return(%w[subject assigned_to])

    resolver = described_class.new(
      project: project,
      params: ActionController::Parameters.new(query_id: '42', c: %w[status start_date cf_101 notification]),
      current_user: current_user,
      issue_scope: issue_scope,
      issue_includes: issue_includes
    )

    result = resolver.resolve(project_ids: [1, 2])

    expect(result[:initial_state][:visible_columns]).to eq(%w[status startDate cf:101])
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
