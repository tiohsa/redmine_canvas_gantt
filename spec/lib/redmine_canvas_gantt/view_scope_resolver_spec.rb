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
  end

  it 'uses member project ids when member-project mode is on without explicit project_ids' do
    allow(query_state_resolver).to receive(:resolve).with(project_ids: [5, 6]).and_return(
      issues: [issue_b],
      initial_state: {},
      warnings: []
    )

    result = described_class.new(
      project: project,
      params: ActionController::Parameters.new(member_projects_only: '1'),
      current_user: current_user,
      issue_includes: [],
      member_project_ids_resolver: -> { [5, 6] }
    ).resolve

    expect(result[:issue_ids]).to eq(Set[20])
    expect(result[:visible_project_ids]).to eq([5])
  end

  it 'still lets explicit project_ids narrow scope through QueryStateResolver' do
    params = ActionController::Parameters.new(member_projects_only: '1', project_ids: ['6'])
    allow(query_state_resolver).to receive(:resolve).with(project_ids: [5, 6]).and_return(
      issues: [issue_b],
      initial_state: { selected_project_ids: ['6'] },
      warnings: []
    )

    result = described_class.new(
      project: project,
      params: params,
      current_user: current_user,
      issue_includes: [],
      member_project_ids_resolver: -> { [5, 6] }
    ).resolve

    expect(result[:initial_state][:selected_project_ids]).to eq(['6'])
  end
end
