require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/view_scope_resolver'

RSpec.describe RedmineCanvasGantt::ViewScopeResolver do
  let(:project_relation) { instance_double(ActiveRecord::Relation, pluck: [1, 2]) }
  let(:project) { instance_double(Project, self_and_descendants: project_relation) }
  let(:current_user) { instance_double(User) }
  let(:query_state_resolver) { instance_double(RedmineCanvasGantt::QueryStateResolver) }
  let(:issue_a) { instance_double(Issue, id: 10, project_id: 1) }
  let(:issue_b) { instance_double(Issue, id: 20, project_id: 5) }

  before do
    allow(RedmineCanvasGantt::QueryStateResolver).to receive(:new).and_return(query_state_resolver)
  end

  it 'uses descendant project ids when member-project mode is off' do
    allow(query_state_resolver).to receive(:resolve).with(project_ids: [1, 2]).and_return(
      issues: [issue_a],
      initial_state: {},
      warnings: []
    )

    result = described_class.new(
      project: project,
      params: ActionController::Parameters.new(member_projects_only: '0'),
      current_user: current_user,
      issue_includes: []
    ).resolve

    expect(result[:issue_ids]).to eq(Set[10])
    expect(result[:scope_project_ids]).to eq([1, 2])
    expect(result[:visible_project_ids]).to eq([1])
  end

  it 'uses descendant project ids when member-project mode is on without explicit project_ids' do
    allow(query_state_resolver).to receive(:resolve).with(project_ids: [1, 2]).and_return(
      issues: [issue_a],
      initial_state: {},
      warnings: []
    )

    result = described_class.new(
      project: project,
      params: ActionController::Parameters.new(member_projects_only: '1'),
      current_user: current_user,
      issue_includes: []
    ).resolve

    expect(result[:issue_ids]).to eq(Set[10])
    expect(result[:scope_project_ids]).to eq([1, 2])
    expect(result[:visible_project_ids]).to eq([1])
  end

  it 'still lets explicit project_ids narrow scope through QueryStateResolver' do
    params = ActionController::Parameters.new(member_projects_only: '1', project_ids: ['2'])
    allow(query_state_resolver).to receive(:resolve).with(project_ids: [2]).and_return(
      issues: [issue_a],
      initial_state: { selected_project_ids: ['2'] },
      warnings: []
    )

    result = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_includes: []
    ).resolve

    expect(result[:initial_state][:selected_project_ids]).to eq(['2'])
    expect(result[:scope_project_ids]).to eq([2])
  end

  it 'uses canvas_project_ids as the Canvas scope without changing query parameters' do
    params = ActionController::Parameters.new(canvas_project_ids: ['2'])
    allow(query_state_resolver).to receive(:resolve).with(project_ids: [2]).and_return(
      issues: [issue_a],
      initial_state: { selected_project_ids: ['2'] },
      warnings: []
    )

    result = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_includes: []
    ).resolve

    expect(result[:scope_project_ids]).to eq([2])
  end

  it 'excludes explicit project_ids outside base_project_ids' do
    params = ActionController::Parameters.new(member_projects_only: '1', project_ids: %w[2 999])
    allow(query_state_resolver).to receive(:resolve).with(project_ids: [2]).and_return(
      issues: [issue_a],
      initial_state: {},
      warnings: []
    )

    result = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_includes: []
    ).resolve

    expect(result[:scope_project_ids]).to eq([2])
  end

  it 'treats project none as an explicit empty scope when member-project mode is off' do
    params = ActionController::Parameters.new(project_ids: ['none'])
    allow(query_state_resolver).to receive(:resolve).with(project_ids: []).and_return(
      issues: [],
      initial_state: { selected_project_ids: [] },
      warnings: []
    )

    result = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_includes: []
    ).resolve

    expect(result[:scope_project_ids]).to eq([])
    expect(result[:visible_project_ids]).to eq([])
  end

  it 'treats project none as an explicit empty scope when member-project mode is on' do
    params = ActionController::Parameters.new(member_projects_only: '1', project_ids: ['none'])
    allow(query_state_resolver).to receive(:resolve).with(project_ids: []).and_return(
      issues: [],
      initial_state: { selected_project_ids: [] },
      warnings: []
    )

    result = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_includes: []
    ).resolve

    expect(result[:scope_project_ids]).to eq([])
    expect(result[:visible_project_ids]).to eq([])
  end
end
