require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/issue_selector'
require_relative '../../../lib/redmine_canvas_gantt/data_payload_budget'

RSpec.describe RedmineCanvasGantt::IssueSelector do
  let(:issue_scope) { double('VisibleIssueScope') }
  let(:issue_includes) { [:status] }
  let(:selector) { described_class.new(issue_scope: issue_scope, issue_includes: issue_includes) }
  let(:state) do
    {
      selected_status_ids: [],
      selected_version_ids: [],
      selected_assignee_ids: [],
      selected_tracker_ids: [],
      sort_config: nil
    }
  end

  before do
    allow(issue_scope).to receive(:where).and_return(issue_scope)
    allow(issue_scope).to receive(:includes).with(*issue_includes).and_return(issue_scope)
  end

  def select_issues(**options)
    selector.call(
      query_issue_scope: nil,
      project_ids: [1],
      redmine_project_ids: nil,
      state: state,
      **options
    )
  end

  it 'applies the visible project and saved query scopes before materialization' do
    query_scope = double('SavedQueryIdSubquery')
    expect(issue_scope).to receive(:where).with(project_id: [1]).ordered.and_return(issue_scope)
    expect(issue_scope).to receive(:where).with(project_id: [2]).ordered.and_return(issue_scope)
    expect(issue_scope).to receive(:where).with(id: query_scope).ordered.and_return(issue_scope)
    expect(issue_scope).to receive(:where).with(status_id: [3]).ordered.and_return(issue_scope)
    expect(issue_scope).to receive(:where).with(tracker_id: [4]).ordered.and_return(issue_scope)
    allow(issue_scope).to receive(:to_a).and_return([])

    expect(select_issues(
      query_issue_scope: query_scope,
      redmine_project_ids: [2],
      state: state.merge(selected_status_ids: [3], selected_tracker_ids: [4])
    )).to eq([])
  end

  it 'keeps unassigned and unset-version selections in the database scope' do
    expect(issue_scope).to receive(:where).with(fixed_version_id: [7]).and_return(issue_scope)
    expect(issue_scope).to receive(:where).with(fixed_version_id: nil).and_return(issue_scope)
    expect(issue_scope).to receive(:where).with(assigned_to_id: [8]).and_return(issue_scope)
    expect(issue_scope).to receive(:where).with(assigned_to_id: nil).and_return(issue_scope)
    expect(issue_scope).to receive(:or).with(issue_scope).twice.and_return(issue_scope)
    allow(issue_scope).to receive(:to_a).and_return([])

    expect(select_issues(state: state.merge(
      selected_version_ids: ['7', '_none'],
      selected_assignee_ids: [8, nil]
    ))).to eq([])
  end

  it 'returns an unmaterialized scope without includes or order for workload aggregation' do
    scoped_issues = double('ScopedIssues')
    expect(issue_scope).to receive(:except).with(:includes, :order).and_return(scoped_issues)
    expect(issue_scope).not_to receive(:to_a)

    expect(select_issues(scope_only: true)).to eq(scoped_issues)
  end

  it 'uses the data budget before materializing the final issue scope' do
    budget = instance_double(RedmineCanvasGantt::DataPayloadBudget, issue_limit: 10_000)
    bounded_selector = described_class.new(
      issue_scope: issue_scope,
      issue_includes: issue_includes,
      data_payload_budget: budget
    )
    expect(issue_scope).not_to receive(:to_a)
    expect(budget).to receive(:load_records)
      .with(issue_scope, resource: 'issues', limit: 10_000)
      .and_return([])

    expect(bounded_selector.call(
      query_issue_scope: nil,
      project_ids: [1],
      redmine_project_ids: nil,
      state: state
    )).to eq([])
  end

  it 'retains case-insensitive descending sorting after selection' do
    alpha = double('Alpha', subject: 'alpha')
    zulu = double('Zulu', subject: 'Zulu')
    bravo = double('Bravo', subject: 'BRAVO')
    allow(issue_scope).to receive(:to_a).and_return([alpha, zulu, bravo])

    expect(select_issues(state: state.merge(sort_config: { key: 'subject', direction: 'desc' })))
      .to eq([zulu, bravo, alpha])
  end
end
