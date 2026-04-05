require_relative '../../../../spec_helper'
require 'uri'

RSpec.describe 'hooks/redmine_canvas_gantt/_issues_query_actions.html.erb', type: :view do
  let(:project) { instance_double(Project) }
  let(:user) { instance_double(User) }

  before do
    allow(User).to receive(:current).and_return(user)
    allow(view).to receive(:project_canvas_gantt_path).with(project).and_return('/projects/demo/canvas_gantt')
    allow(view).to receive(:request).and_return(instance_double(ActionDispatch::Request, query_parameters: request_query_parameters))
  end

  let(:request_query_parameters) { {} }

  def parsed_link_href
    html = Nokogiri::HTML.fragment(rendered)
    href = html.at_css('#canvas-gantt-query-action-link')&.[]('href')
    URI.parse(href)
  end

  it 'renders a Canvas Gantt link for persisted queries' do
    query = instance_double(IssueQuery, persisted?: true, id: 42)
    allow(user).to receive(:allowed_to?).with(:view_canvas_gantt, project).and_return(true)

    render partial: 'hooks/redmine_canvas_gantt/issues_query_actions', locals: { project: project, query: query }

    href = parsed_link_href

    expect(rendered).to include('canvas-gantt-query-action-link')
    expect(href.path).to eq('/projects/demo/canvas_gantt')
    expect(Rack::Utils.parse_nested_query(href.query)).to eq('query_id' => '42')
    expect(rendered).to include(I18n.t(:"canvas_gantt.label_open_in_canvas_gantt"))
  end

  it 'renders a Canvas Gantt link for unsaved standard filters' do
    query = instance_double(IssueQuery, persisted?: false)
    allow(user).to receive(:allowed_to?).with(:view_canvas_gantt, project).and_return(true)
    allow(view).to receive(:request).and_return(
      instance_double(
        ActionDispatch::Request,
        query_parameters: {
          'set_filter' => '1',
          'f' => %w[status_id assigned_to_id],
          'op' => { 'status_id' => 'o', 'assigned_to_id' => '=' },
          'v' => { 'assigned_to_id' => %w[5 none] },
          'sort' => 'start_date:desc',
          'group_by' => 'assigned_to',
          'show_subprojects' => '0',
          'utf8' => '✓'
        }
      )
    )

    render partial: 'hooks/redmine_canvas_gantt/issues_query_actions', locals: { project: project, query: query }

    href = parsed_link_href

    expect(href.path).to eq('/projects/demo/canvas_gantt')
    expect(Rack::Utils.parse_nested_query(href.query)).to eq(
      'set_filter' => '1',
      'f' => %w[status_id assigned_to_id],
      'op' => { 'status_id' => 'o', 'assigned_to_id' => '=' },
      'v' => { 'assigned_to_id' => %w[5 none] },
      'sort' => 'start_date:desc',
      'group_by' => 'assigned_to',
      'show_subprojects' => '0'
    )
    expect(rendered).not_to include('canvas-gantt-query-action-notice')
  end

  it 'combines persisted query_id with temporary filter overrides' do
    query = instance_double(IssueQuery, persisted?: true, id: 42)
    allow(user).to receive(:allowed_to?).with(:view_canvas_gantt, project).and_return(true)
    allow(view).to receive(:request).and_return(
      instance_double(
        ActionDispatch::Request,
        query_parameters: {
          'set_filter' => '1',
          'f' => ['status_id'],
          'op' => { 'status_id' => '=' },
          'v' => { 'status_id' => ['3'] },
          'sort' => 'due_date:asc'
        }
      )
    )

    render partial: 'hooks/redmine_canvas_gantt/issues_query_actions', locals: { project: project, query: query }

    href = parsed_link_href

    expect(Rack::Utils.parse_nested_query(href.query)).to eq(
      'query_id' => '42',
      'set_filter' => '1',
      'f' => ['status_id'],
      'op' => { 'status_id' => '=' },
      'v' => { 'status_id' => ['3'] },
      'sort' => 'due_date:asc'
    )
  end

  it 'renders a bare Canvas Gantt path when no supported filters exist' do
    query = instance_double(IssueQuery, persisted?: false)
    allow(user).to receive(:allowed_to?).with(:view_canvas_gantt, project).and_return(true)
    allow(view).to receive(:request).and_return(
      instance_double(ActionDispatch::Request, query_parameters: { 'utf8' => '✓', 'commit' => 'Apply' })
    )

    render partial: 'hooks/redmine_canvas_gantt/issues_query_actions', locals: { project: project, query: query }

    href = parsed_link_href

    expect(href.path).to eq('/projects/demo/canvas_gantt')
    expect(href.query).to be_nil
  end

  it 'renders nothing without Canvas Gantt permission' do
    query = instance_double(IssueQuery, persisted?: true, id: 42)
    allow(user).to receive(:allowed_to?).with(:view_canvas_gantt, project).and_return(false)

    render partial: 'hooks/redmine_canvas_gantt/issues_query_actions', locals: { project: project, query: query }

    expect(rendered.strip).to eq('')
  end
end
