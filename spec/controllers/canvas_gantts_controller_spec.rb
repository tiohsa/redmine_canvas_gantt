require_relative '../spec_helper'
require 'set'
require 'tmpdir'

RSpec.describe CanvasGanttsController, type: :controller do
  def canvas_gantt_t(key)
    I18n.t(:"canvas_gantt.#{key}")
  end

  let(:project) do
    instance_double(
      Project,
      id: 1,
      name: 'Demo',
      start_date: nil,
      due_date: nil
    )
  end

  before do
    allow(controller).to receive(:find_project_by_project_id) do
      controller.instance_variable_set(:@project, project)
    end
  end

  describe '#api_request?' do
    before do
      controller.params[:format] = 'json'
      session[:user_id] = 7
    end

    it 'uses the Redmine session for JSON requests without explicit API credentials' do
      expect(controller.send(:api_request?)).to be(false)
    end

    it 'preserves Redmine API authentication when an API key header is present' do
      request.headers['X-Redmine-API-Key'] = 'api-key'

      expect(controller.send(:api_request?)).to be(true)
    end

    it 'preserves Redmine API authentication when an API key parameter is present' do
      controller.params[:key] = 'api-key'

      expect(controller.send(:api_request?)).to be(true)
    end

    it 'preserves Redmine API authentication when an authorization header is present' do
      request.headers['Authorization'] = 'Basic credentials'

      expect(controller.send(:api_request?)).to be(true)
    end

    it 'preserves Redmine API authentication when no session user is present' do
      session.delete(:user_id)

      expect(controller.send(:api_request?)).to be(true)
    end
  end

  describe '#normalize_task_date_attributes!' do
    it 'canonicalizes both finite endpoints through the project calendar interval' do
      resolver = instance_double(RedmineCanvasGantt::ProjectCalendarResolver)
      allow(controller).to receive(:business_calendar_resolver).and_return(resolver)
      allow(resolver).to receive(:normalize_date_interval)
        .with(
          start_date: '2027-01-04',
          due_date: '2027-01-04',
          changed_fields: %i[start_date due_date],
          project: project,
          mode: :legacy_unspecified
        )
        .and_return(
          valid: true,
          start_date: Date.new(2027, 1, 5),
          due_date: Date.new(2027, 1, 5)
        )

      issue = instance_double(
        Issue,
        project: project,
        start_date: Date.new(2027, 1, 4),
        due_date: Date.new(2027, 1, 4)
      )
      attributes = { start_date: '2027-01-04', due_date: '2027-01-04' }

      controller.send(:normalize_task_date_attributes!, attributes, issue)

      expect(attributes).to eq(
        start_date: Date.new(2027, 1, 5),
        due_date: Date.new(2027, 1, 5)
      )
    end
  end

  describe '#preprocess_draft_intent' do
    it 'validates a requested parent through the shared preview and mutation preprocessing' do
      issue = instance_double(Issue, project: project, project_id: project.id)
      parent = instance_double(Issue, id: 11)
      allow(controller).to receive(:performed?).and_return(false)
      expect(controller).to receive(:load_parent_issue).with(issue, '11').and_return(parent)

      expect(controller.send(:preprocess_draft_intent, issue, parent_issue_id: '11')).to eq(
        parent_issue_id: '11'
      )
    end

    it 'normalizes Preview dates with the same transport mode as PATCH' do
      resolver = instance_double(RedmineCanvasGantt::ProjectCalendarResolver)
      allow(controller).to receive(:business_calendar_resolver).and_return(resolver)
      allow(resolver).to receive(:normalize_date_interval)
        .with(
          start_date: '2027-01-04',
          due_date: '2027-01-04',
          changed_fields: %i[start_date due_date],
          project: project,
          mode: :project_move
        ).and_return(valid: true, start_date: Date.new(2027, 1, 5), due_date: Date.new(2027, 1, 5))

      issue = instance_double(
        Issue,
        project: project,
        project_id: project.id,
        start_date: Date.new(2027, 1, 4),
        due_date: Date.new(2027, 1, 4)
      )
      intent = {
        start_date: '2027-01-04',
        due_date: '2027-01-04',
        date_update_mode: 'project_move'
      }

      expect(controller.send(:preprocess_draft_intent, issue, intent)).to eq(
        start_date: Date.new(2027, 1, 5),
        due_date: Date.new(2027, 1, 5)
      )
    end

    it 'does not resolve or normalize a destination calendar before scope authorization' do
      target = instance_double(Project, id: 2)
      resolver = instance_double(RedmineCanvasGantt::ProjectCalendarResolver)
      allow(controller).to receive(:business_calendar_resolver).and_return(resolver)
      allow(controller).to receive(:current_view_scope).and_return(scope_project_ids: [project.id])
      allow(Project).to receive_message_chain(:visible, :find_by).with(id: 2).and_return(target)
      allow(User.current).to receive(:allowed_to?).with(:add_issues, target).and_return(true)
      expect(resolver).not_to receive(:normalize_date_interval)

      issue = instance_double(Issue, project: project, project_id: project.id, start_date: nil, due_date: nil)
      result = controller.send(
        :preprocess_draft_intent,
        issue,
        project_id: 2, start_date: '2027-01-04', date_update_mode: 'project_move'
      )

      expect(result).to eq(project_id: 2, start_date: '2027-01-04')
    end

    it 'does not inspect a parent before destination project authorization' do
      target = instance_double(Project, id: 2)
      allow(controller).to receive(:current_view_scope).and_return(scope_project_ids: [project.id])
      allow(Project).to receive_message_chain(:visible, :find_by).with(id: 2).and_return(target)
      allow(User.current).to receive(:allowed_to?).with(:add_issues, target).and_return(true)
      expect(controller).not_to receive(:load_parent_issue)

      issue = instance_double(Issue, project: project, project_id: project.id)
      result = controller.send(
        :preprocess_draft_intent,
        issue,
        project_id: 2, parent_issue_id: 11, start_date: '2027-01-04', date_update_mode: 'project_move'
      )

      expect(result).to eq(project_id: 2, parent_issue_id: 11, start_date: '2027-01-04')
    end
  end

  describe '#safe_build_asset_path' do
    around do |example|
      Dir.mktmpdir do |dir|
        @tmp_root = Pathname.new(dir)
        example.run
      end
    end

    before do
      build_dir = @tmp_root.join('plugins', 'redmine_canvas_gantt', 'assets', 'build')
      FileUtils.mkdir_p(build_dir.join('assets'))
      File.write(build_dir.join('assets', 'main.js'), 'console.log("ok");')
      allow(Rails).to receive(:root).and_return(@tmp_root)
    end

    it 'returns an asset path inside the build directory' do
      result = controller.send(:safe_build_asset_path, 'assets/main.js')

      expect(result).to eq(@tmp_root.join('plugins', 'redmine_canvas_gantt', 'assets', 'build', 'assets', 'main.js').to_s)
    end

    it 'rejects traversal outside the build directory' do
      expect(controller.send(:safe_build_asset_path, '../config/database.yml')).to be_nil
      expect(controller.send(:safe_build_asset_path, '/etc/passwd')).to be_nil
    end

    it 'rejects symlinks that resolve outside the build directory' do
      outside_file = @tmp_root.join('outside.js')
      symlink_path = @tmp_root.join('plugins', 'redmine_canvas_gantt', 'assets', 'build', 'assets', 'outside.js')
      File.write(outside_file, 'console.log("outside");')
      File.symlink(outside_file, symlink_path)

      expect(controller.send(:safe_build_asset_path, 'assets/outside.js')).to be_nil
    end
  end

  describe 'GET #data' do
    it 'returns forbidden when view permission is missing' do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: false, viewable: false, baseline_editable: false })
      end

      get :data, params: { project_id: 'demo' }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end

    it 'requires view permission before a direct mutation API request is processed' do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: false, baseline_editable: true })
      end
      expect(Issue).not_to receive(:visible)

      patch :update, params: { project_id: 'demo', id: '10', task: { subject: 'Denied' } }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end

    it 'logs unexpected failures without exposing their details to the client' do
      resolver = instance_double(RedmineCanvasGantt::QueryStateResolver)
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true, baseline_editable: true })
      end
      allow(controller).to receive(:descendant_project_ids).and_return([1])
      allow(controller).to receive(:query_state_resolver).and_return(resolver)
      allow(resolver).to receive(:resolve).and_raise(StandardError, 'database connection details')
      expect(Rails.logger).to receive(:error).with(include('database connection details'))

      get :data, params: { project_id: 'demo' }, format: :json

      expect(response).to have_http_status(:internal_server_error)
      expect(response.body).not_to include('database connection details')
      expect(JSON.parse(response.body).fetch('error')).to include('request ID:')
    end

    it 'returns 413 when a data collection exceeds its finite budget' do
      resolver = instance_double(RedmineCanvasGantt::QueryStateResolver)
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(
          :@permissions,
          { editable: true, viewable: true, baseline_editable: true }
        )
      end
      allow(controller).to receive(:descendant_project_ids).and_return([1])
      allow(controller).to receive(:query_state_resolver).and_return(resolver)
      allow(resolver).to receive(:resolve).and_raise(
        RedmineCanvasGantt::DataPayloadBudget::Exceeded.new(
          resource: 'issues',
          limit: 10_000,
          actual: 10_001
        )
      )

      get :data, params: { project_id: 'demo' }, format: :json

      expect(response).to have_http_status(413)
      expect(JSON.parse(response.body)).to include(
        'code' => 'canvas_gantt_payload_limit',
        'resource' => 'issues',
        'limit' => 10_000
      )
    end

    it 'returns data payload with expected top-level keys' do
      payload_builder = instance_double(RedmineCanvasGantt::DataPayloadBuilder)
      baseline_repository = instance_double(RedmineCanvasGantt::BaselineRepository)
      resolver = instance_double(RedmineCanvasGantt::QueryStateResolver)
      baseline_snapshot = instance_double(RedmineCanvasGantt::BaselineSnapshot, to_payload_hash: {
        snapshot_id: 'baseline-1',
        project_id: 1,
        captured_at: '2026-04-01T00:00:00Z',
        captured_by_id: 7,
        captured_by_name: 'Alice',
        scope: 'filtered',
        tasks_by_issue_id: {}
      })
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true, baseline_editable: true })
      end
      allow(controller).to receive(:descendant_project_ids).and_return([1, 2])
      filter_option_project = double('ProjectOption', id: 1, name: 'Demo')
      filter_option_issue = double('FilterOptionIssue')
      allow(controller).to receive(:filter_option_projects).with([1, 2], member_projects_only: false).and_return([filter_option_project])
      allow(controller).to receive(:filter_option_issues).with([1, 2]).and_return([filter_option_issue])
      allow(controller).to receive(:query_state_resolver).and_return(resolver)
      allow(controller).to receive(:baseline_repository).and_return(baseline_repository)
      allow(controller).to receive(:visible_baseline_snapshot).with(baseline_snapshot, [1, 2]).and_return(baseline_snapshot)
      issue = double('Issue', id: 10, project_id: 1)
      allow(resolver).to receive(:resolve).and_return({
        issues: [issue],
        initial_state: { query_id: 7 },
        query_context: { query_id: 7, explicit_overrides: {} },
        warnings: ['Invalid query_id ignored']
      })
      allow(baseline_repository).to receive(:load).and_return(
        RedmineCanvasGantt::BaselineRepository::LoadResult.new(
          snapshot: baseline_snapshot,
          warnings: ['Baseline warning']
        )
      )
      allow(controller).to receive(:data_payload_builder).and_return(payload_builder)
      expect(payload_builder).to receive(:build).with(hash_including(
        project: project,
        permissions: { editable: true, viewable: true, baseline_editable: true },
        project_ids: [1, 2],
        issues: [issue],
        filter_option_projects: [filter_option_project],
        filter_option_issues: [filter_option_issue],
        initial_state: { query_id: 7 },
        query_context: { query_id: 7, explicit_overrides: {} },
        warnings: ['Invalid query_id ignored', 'Baseline warning'],
        baseline: baseline_snapshot
      )).and_return({
        tasks: [{ id: 10 }],
        custom_fields: [{ id: 15 }],
        relations: [{ id: 20 }],
        versions: [{ id: 30 }],
        filter_options: {
          projects: [{ id: 1, name: 'Demo' }],
          assignees: [{ id: 7, name: 'Alice', project_ids: ['1'] }]
        },
        statuses: [{ id: 40 }],
        project: { id: 1, name: 'Demo' },
        permissions: { editable: true, viewable: true, baseline_editable: true },
        initial_state: { query_id: 7 },
        query_context: { query_id: 7, explicit_overrides: {} },
        baseline: baseline_snapshot.to_payload_hash,
        warnings: ['Invalid query_id ignored', 'Baseline warning']
      })

      get :data, params: { project_id: 'demo' }, format: :json

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body.keys).to contain_exactly('tasks', 'custom_fields', 'relations', 'versions', 'filter_options', 'statuses', 'project', 'permissions', 'initial_state', 'query_context', 'baseline', 'warnings')
      expect(body['permissions']).to eq('editable' => true, 'viewable' => true, 'baseline_editable' => true)
      expect(body['filter_options']).to eq(
        'projects' => [{ 'id' => 1, 'name' => 'Demo' }],
        'assignees' => [{ 'id' => 7, 'name' => 'Alice', 'project_ids' => ['1'] }]
      )
      expect(body['baseline']).to include('snapshot_id' => 'baseline-1', 'project_id' => 1)
      expect(body['warnings']).to contain_exactly('Invalid query_id ignored', 'Baseline warning')
    end

    it 'filters project candidates before building the data payload' do
      payload_builder = instance_double(RedmineCanvasGantt::DataPayloadBuilder)
      baseline_repository = instance_double(RedmineCanvasGantt::BaselineRepository)
      resolver = instance_double(RedmineCanvasGantt::QueryStateResolver)
      filter_option_project = double('ProjectOption', id: 1, name: 'Demo')
      filter_option_issue = double('FilterOptionIssue')
      issue = double('Issue', id: 10, project_id: 1)

      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true, baseline_editable: true })
      end
      allow(controller).to receive(:descendant_project_ids).and_return([1, 2])
      allow(controller).to receive(:filter_option_projects).with([1, 2], member_projects_only: true).and_return([filter_option_project])
      allow(controller).to receive(:filter_option_issues).with([1, 2]).and_return([filter_option_issue])
      allow(controller).to receive(:query_state_resolver).and_return(resolver)
      allow(controller).to receive(:baseline_repository).and_return(baseline_repository)
      allow(resolver).to receive(:resolve).and_return({
        issues: [issue],
        initial_state: { query_id: 7, member_projects_only: true },
        query_context: { query_id: 7, explicit_overrides: {} },
        warnings: []
      })
      allow(baseline_repository).to receive(:load).and_return(
        RedmineCanvasGantt::BaselineRepository::LoadResult.new(snapshot: nil, warnings: [])
      )
      allow(controller).to receive(:data_payload_builder).and_return(payload_builder)
      allow(payload_builder).to receive(:build).and_return(
        {
          tasks: [],
          relations: [],
          versions: [],
          custom_fields: [],
          filter_options: { projects: [], assignees: [] },
          statuses: [],
          project: { id: 1, name: 'Demo' },
          permissions: { editable: true, viewable: true, baseline_editable: true },
          initial_state: { query_id: 7, member_projects_only: true },
          query_context: { query_id: 7, explicit_overrides: {} }
        }
      )

      get :data, params: { project_id: 'demo', member_projects_only: '1' }, format: :json

      expect(response).to have_http_status(:ok)
    end
  end

  describe '#data_relations' do
    it 'loads only internal relations through the relation budget' do
      budget = instance_double(RedmineCanvasGantt::DataPayloadBudget, relation_limit: 2)
      relation_scope = double('relation scope')
      ordered_scope = double('ordered relation scope')
      issues = [instance_double(Issue, id: 10), instance_double(Issue, id: 11)]
      allow(controller).to receive(:data_payload_budget).and_return(budget)
      expect(IssueRelation).to receive(:where)
        .with(issue_from_id: [10, 11], issue_to_id: [10, 11])
        .and_return(relation_scope)
      expect(relation_scope).to receive(:order).with(:id).and_return(ordered_scope)
      expect(budget).to receive(:load_records)
        .with(ordered_scope, resource: 'relations', limit: 2)
        .and_return([:relation])

      expect(controller.send(:data_relations, issues)).to eq([:relation])
    end
  end

  describe '#render_data_payload_limit' do
    it 'returns a stable 413 contract without a partial payload' do
      allow(controller).to receive(:canvas_gantt_l).and_return('Data is too large')
      error = RedmineCanvasGantt::DataPayloadBudget::Exceeded.new(
        resource: 'relations',
        limit: 2,
        actual: 3
      )
      controller.response = ActionDispatch::TestResponse.create
      controller.instance_variable_set(:@_response_body, nil)

      controller.send(:render_data_payload_limit, error)

      expect(controller.response).to have_http_status(413)
      expect(JSON.parse(controller.response.body)).to eq(
        'error' => 'Data is too large',
        'code' => 'canvas_gantt_payload_limit',
        'resource' => 'relations',
        'limit' => 2
      )
    end
  end

  describe '#current_view_scope' do
    it 'builds only the operation project boundary without resolving the Issue collection' do
      user = instance_double(User)
      view_scope_resolver = instance_double(RedmineCanvasGantt::ViewScopeResolver)

      allow(User).to receive(:current).and_return(user)
      controller.instance_variable_set(:@project, project)
      expect(RedmineCanvasGantt::ViewScopeResolver).to receive(:new).with(
        project: project,
        params: controller.params,
        current_user: user,
        issue_includes: CanvasGanttsController::ISSUE_INCLUDES
      ).and_return(view_scope_resolver)
      expect(view_scope_resolver).to receive(:project_scope_ids).and_return([1, 2])
      expect(view_scope_resolver).not_to receive(:resolve)

      expect(controller.send(:current_view_scope)).to eq(scope_project_ids: [1, 2])
    end
  end

  describe '#filter_option_projects' do
    let(:visible_scope) { double('ActiveRecord::Relation') }
    let(:member_active_scope) { double('ActiveRecord::Relation') }
    let(:tree_project_scope) { double('ActiveRecord::Relation') }
    let(:tree_member_joined_scope) { double('ActiveRecord::Relation') }
    let(:tree_member_filtered_scope) { double('ActiveRecord::Relation') }
    let(:member_joined_scope) { double('ActiveRecord::Relation') }
    let(:member_filtered_scope) { double('ActiveRecord::Relation') }
    let(:member_tree_project) { double('ProjectOption', id: 1) }
    let(:descendant_project) { double('ProjectOption', id: 2) }
    let(:member_project) { double('ProjectOption', id: 3) }

    before do
      budget = instance_double(RedmineCanvasGantt::DataPayloadBudget, collection_limit: 10_000)
      allow(controller).to receive(:data_payload_budget).and_return(budget)
      allow(budget).to receive(:load_records) do |scope, resource:, limit:|
        expect(resource).to eq('projects')
        expect(limit).to eq(10_000)
        scope.to_a
      end
      allow(Project).to receive(:visible).and_return(visible_scope)
      allow(visible_scope).to receive(:active).and_return(member_active_scope)
      allow(member_active_scope).to receive(:where).with(id: [1, 2]).and_return(tree_project_scope)
      allow(tree_project_scope).to receive(:joins).with(:members).and_return(tree_member_joined_scope)
      allow(member_active_scope).to receive(:joins).with(:members).and_return(member_joined_scope)
    end

    it 'returns all active visible projects in base scope when member_projects_only is false' do
      user = double('User', id: 7, group_ids: [11, 12], logged?: true, login: 'alice')
      allow(User).to receive(:current).and_return(user)
      allow(tree_project_scope).to receive(:to_a).and_return([member_tree_project, descendant_project])

      result = controller.send(:filter_option_projects, [1, 2], member_projects_only: false)

      expect(result).to eq([member_tree_project, descendant_project])
    end

    it 'returns only projects where current user is a member when memberProjectsOnly is enabled' do
      user = double('User', id: 7, group_ids: [11, 12], logged?: true, login: 'alice', admin?: false)
      allow(User).to receive(:current).and_return(user)

      allow(member_joined_scope).to receive(:where).with(
        members: { user_id: [7, 11, 12] }
      ).and_return(member_filtered_scope)
      allow(member_filtered_scope).to receive(:distinct).and_return(member_filtered_scope)
      allow(member_filtered_scope).to receive(:to_a).and_return([member_tree_project, member_project])

      result = controller.send(:filter_option_projects, [1, 2], member_projects_only: true)

      expect(result).to eq([member_tree_project, member_project])
    end

    it 'returns all active visible projects when current user is admin even if memberProjectsOnly is enabled' do
      user = double('User', id: 7, logged?: true, login: 'admin', admin?: true)
      allow(User).to receive(:current).and_return(user)
      allow(member_active_scope).to receive(:to_a).and_return([member_tree_project, descendant_project, member_project])

      result = controller.send(:filter_option_projects, [1, 2], member_projects_only: true)

      expect(result).to eq([member_tree_project, descendant_project, member_project])
    end

    it 'returns no projects when memberProjectsOnly is enabled and current user is unavailable' do
      allow(User).to receive(:current).and_return(nil)

      result = controller.send(:filter_option_projects, [1, 2], member_projects_only: true)

      expect(result).to eq([])
    end
  end

  describe 'GET #queries' do
    let(:current_user) { instance_double(User, id: 7, logged?: true, login: 'tester', language: 'en') }
    let(:visible_query) do
      instance_double(IssueQuery, id: 12, name: 'Open issues', visibility: 2, project_id: 1)
    end
    let(:project_query) do
      instance_double(IssueQuery, id: 18, name: 'Team backlog', visibility: 0, project_id: 1)
    end

    before do
      allow(User).to receive(:current).and_return(current_user)
      allow(current_user).to receive(:allowed_to?).and_return(false)
    end

    it 'returns forbidden when view permission is missing' do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: false, viewable: false, baseline_editable: false })
      end

      get :queries, params: { project_id: 'demo' }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end

    it 'returns visible saved queries for the current project' do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true, baseline_editable: true })
      end

      relation = instance_double(ActiveRecord::Relation)
      ordered_relation = instance_double(ActiveRecord::Relation)
      allow(IssueQuery).to receive(:visible).with(current_user, project: project).and_return(relation)
      allow(relation).to receive(:order).with(:name).and_return(ordered_relation)
      allow(ordered_relation).to receive(:to_a).and_return([visible_query, project_query])

      get :queries, params: { project_id: 'demo' }, format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq(
        'queries' => [
          { 'id' => 12, 'name' => 'Open issues', 'is_public' => true, 'project_id' => 1 },
          { 'id' => 18, 'name' => 'Team backlog', 'is_public' => false, 'project_id' => 1 }
        ]
      )
    end
  end

  describe 'POST #save_baseline' do
    let(:baseline_repository) { instance_double(RedmineCanvasGantt::BaselineRepository) }
    let(:resolver) { instance_double(RedmineCanvasGantt::QueryStateResolver) }
    let(:current_user) { instance_double(User, id: 7, name: 'Alice', logged?: true, login: 'alice', language: 'en') }
    let(:baseline_snapshot) do
      RedmineCanvasGantt::BaselineSnapshot.new(
        snapshot_id: 'baseline-1',
        project_id: 1,
        captured_at: Time.utc(2026, 4, 1, 12, 0, 0),
        captured_by_id: 7,
        captured_by_name: 'Alice',
        scope: 'filtered',
        task_states: [
          RedmineCanvasGantt::BaselineTaskState.new(
            issue_id: 10,
            baseline_start_date: Date.new(2026, 4, 10),
            baseline_due_date: Date.new(2026, 4, 15)
          )
        ]
      )
    end

    before do
      allow(controller).to receive(:baseline_repository).and_return(baseline_repository)
      allow(controller).to receive(:query_state_resolver).and_return(resolver)
      allow(controller).to receive(:descendant_project_ids).and_return([1])
      allow(User).to receive(:current).and_return(current_user)
      allow(current_user).to receive(:allowed_to?).and_return(false)
      allow(current_user).to receive(:allowed_to?).with(:manage_canvas_gantt_baseline, project).and_return(true)
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true, baseline_editable: true })
      end
    end

    it 'saves a baseline snapshot and returns its payload' do
      issue = double('Issue', id: 10, start_date: Date.new(2026, 4, 10), due_date: Date.new(2026, 4, 15))
      allow(resolver).to receive(:resolve).and_return({
        issues: [issue],
        initial_state: nil,
        warnings: ['query warning']
      })
      expect(baseline_repository).to receive(:build_snapshot).with(
        project: project,
        issues: [issue],
        current_user: current_user,
        scope: 'filtered'
      ).and_return(baseline_snapshot)
      allow(baseline_repository).to receive(:replace).with(project_id: 1, snapshot: baseline_snapshot).and_return(baseline_snapshot)

      post :save_baseline, params: { project_id: 'demo', scope: 'filtered' }, format: :json

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body['status']).to eq('ok')
      expect(body['baseline']).to include(
        'snapshot_id' => 'baseline-1',
        'project_id' => 1,
        'captured_by_name' => 'Alice',
        'scope' => 'filtered'
      )
      expect(body['baseline']['tasks_by_issue_id']['10']).to include(
        'issue_id' => 10,
        'baseline_start_date' => '2026-04-10',
        'baseline_due_date' => '2026-04-15'
      )
      expect(body['warnings']).to eq(['query warning'])
    end

    it 'can save a whole-project baseline snapshot' do
      filtered_issue = double('Issue', id: 10, start_date: Date.new(2026, 4, 10), due_date: Date.new(2026, 4, 15))
      project_issue = double('Issue', id: 11, start_date: Date.new(2026, 4, 11), due_date: Date.new(2026, 4, 16))
      project_snapshot = RedmineCanvasGantt::BaselineSnapshot.new(
        snapshot_id: 'baseline-2',
        project_id: 1,
        captured_at: Time.utc(2026, 4, 2, 12, 0, 0),
        captured_by_id: 7,
        captured_by_name: 'Alice',
        scope: 'project',
        task_states: [
          RedmineCanvasGantt::BaselineTaskState.new(
            issue_id: 11,
            baseline_start_date: Date.new(2026, 4, 11),
            baseline_due_date: Date.new(2026, 4, 16)
          )
        ]
      )

      allow(resolver).to receive(:resolve).and_return({
        issues: [filtered_issue],
        initial_state: nil,
        warnings: ['query warning']
      })
      allow(controller).to receive(:baseline_project_issues).with([1]).and_return([project_issue])
      expect(baseline_repository).to receive(:build_snapshot).with(
        project: project,
        issues: [project_issue],
        current_user: current_user,
        scope: 'project'
      ).and_return(project_snapshot)
      allow(baseline_repository).to receive(:replace).with(project_id: 1, snapshot: project_snapshot).and_return(project_snapshot)

      post :save_baseline, params: { project_id: 'demo', scope: 'project' }, format: :json

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body['baseline']).to include('scope' => 'project')
      expect(body['baseline']['tasks_by_issue_id'].keys).to eq(['11'])
      expect(body['warnings']).to eq([])
    end

    it 'returns unprocessable entity for an invalid baseline scope' do
      post :save_baseline, params: { project_id: 'demo', scope: 'unexpected' }, format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)).to eq('error' => 'scope is invalid')
    end

    it 'returns forbidden when edit permission is missing' do
      allow(current_user).to receive(:allowed_to?).with(:manage_canvas_gantt_baseline, project).and_return(false)

      post :save_baseline, params: { project_id: 'demo' }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end
  end

  describe '#visible_baseline_snapshot' do
    it 'excludes private, permission-revoked, and hidden-subproject issue states from the payload' do
      snapshot = RedmineCanvasGantt::BaselineSnapshot.new(
        snapshot_id: 'baseline-1', project_id: 1, captured_at: Time.utc(2026, 7, 27),
        captured_by_id: 7, captured_by_name: 'Alice', scope: 'project',
        task_states: [
          RedmineCanvasGantt::BaselineTaskState.new(issue_id: 10, baseline_start_date: Date.new(2026, 7, 1), baseline_due_date: Date.new(2026, 7, 2)),
          RedmineCanvasGantt::BaselineTaskState.new(issue_id: 11, baseline_start_date: Date.new(2026, 7, 3), baseline_due_date: Date.new(2026, 7, 4)),
          RedmineCanvasGantt::BaselineTaskState.new(issue_id: 12, baseline_start_date: Date.new(2026, 7, 5), baseline_due_date: Date.new(2026, 7, 6))
        ]
      )
      visible_scope = instance_double(ActiveRecord::Relation)
      filtered_scope = instance_double(ActiveRecord::Relation)
      allow(Issue).to receive(:visible).and_return(visible_scope)
      expect(visible_scope).to receive(:where).with(project_id: [1, 2], id: [10, 11, 12]).and_return(filtered_scope)
      allow(filtered_scope).to receive(:pluck).with(:id).and_return([10])

      visible_snapshot = controller.send(:visible_baseline_snapshot, snapshot, [1, 2])

      expect(visible_snapshot.to_payload_hash[:tasks_by_issue_id].keys).to eq(['10'])
    end
  end

  describe 'GET #index' do
    before do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: false, viewable: true, baseline_editable: false })
      end
      allow(Setting).to receive(:non_working_week_days).and_return(['6', '7'])
    end

    it 'includes row height labels in frontend i18n payload' do
      expect(Setting).not_to receive(:plugin_redmine_canvas_gantt)

      get :index, params: { project_id: 'demo' }

      expect(response).to have_http_status(:ok)
      expect(controller.instance_variable_get(:@settings)).to eq(described_class::CANVAS_GANTT_UI_SETTINGS)
      expect(controller.instance_variable_get(:@settings).keys).to contain_exactly(
        'inline_edit_subject',
        'inline_edit_assigned_to',
        'inline_edit_status',
        'inline_edit_done_ratio',
        'inline_edit_due_date',
        'inline_edit_custom_fields',
        'row_height'
      )
      i18n_payload = controller.instance_variable_get(:@i18n).stringify_keys
      expect(i18n_payload['label_row_height']).to eq(canvas_gantt_t(:label_row_height))
      expect(i18n_payload['label_row_height_m']).to eq(canvas_gantt_t(:label_row_height_m))
      expect(i18n_payload['help_desc_zoom_wheel']).to eq(canvas_gantt_t(:help_desc_zoom_wheel))
      expect(i18n_payload['label_status_completed']).to eq(canvas_gantt_t(:label_status_completed))
      expect(i18n_payload['label_status_incomplete']).to eq(canvas_gantt_t(:label_status_incomplete))
      expect(i18n_payload['label_peak']).to eq(canvas_gantt_t(:label_peak))
      expect(i18n_payload['label_total']).to eq(canvas_gantt_t(:label_total))
      expect(i18n_payload['label_workload']).to eq(canvas_gantt_t(:label_workload))
      expect(i18n_payload['label_show_workload']).to eq(canvas_gantt_t(:label_show_workload))
      expect(i18n_payload['label_capacity_threshold']).to eq(canvas_gantt_t(:label_capacity_threshold))
      expect(i18n_payload['label_leaf_issues_only']).to eq(canvas_gantt_t(:label_leaf_issues_only))
      expect(i18n_payload['label_include_closed_issues']).to eq(canvas_gantt_t(:label_include_closed_issues))
      expect(i18n_payload['label_today_onward_only']).to eq(canvas_gantt_t(:label_today_onward_only))
      expect(i18n_payload['label_save_baseline_filtered']).to eq(canvas_gantt_t(:label_save_baseline_filtered))
      expect(i18n_payload['label_save_baseline_project']).to eq(canvas_gantt_t(:label_save_baseline_project))
      expect(i18n_payload['label_baseline_scope']).to eq(canvas_gantt_t(:label_baseline_scope))
      expect(i18n_payload['label_toggle_hierarchy_lines']).to eq(canvas_gantt_t(:label_toggle_hierarchy_lines))
      expect(i18n_payload['label_display_settings']).to eq(canvas_gantt_t(:label_display_settings))
      expect(i18n_payload['label_share_display_settings_across_projects']).to eq(canvas_gantt_t(:label_share_display_settings_across_projects))
      expect(i18n_payload['label_display_settings_source']).to eq(canvas_gantt_t(:label_display_settings_source))
      expect(i18n_payload['label_display_settings_source_project']).to eq(canvas_gantt_t(:label_display_settings_source_project))
      expect(i18n_payload['label_display_settings_source_global']).to eq(canvas_gantt_t(:label_display_settings_source_global))
      expect(i18n_payload['label_display_settings_source_default']).to eq(canvas_gantt_t(:label_display_settings_source_default))
      expect(response.body).not_to include('baseline_snapshots')
      expect(response.body).not_to include('tracker_icon_map')
      expect(response.body).not_to include('use_vite_dev_server')
    end

    it 'normalizes Redmine non-working weekdays to internal wday format' do
      expect(controller.send(:normalized_non_working_week_days)).to eq([0, 6])
    end

    it 'includes localized help labels in Japanese frontend i18n payload' do
      I18n.with_locale(:ja) do
        get :index, params: { project_id: 'demo' }

        expect(response).to have_http_status(:ok)
      i18n_payload = controller.instance_variable_get(:@i18n).stringify_keys
        expect(i18n_payload['label_help']).to eq(canvas_gantt_t(:label_help))
        expect(i18n_payload['help_label_layout_filters']).to eq(canvas_gantt_t(:help_label_layout_filters))
        expect(i18n_payload['help_label_timeline_view']).to eq(canvas_gantt_t(:help_label_timeline_view))
        expect(i18n_payload['help_label_editing_saving']).to eq(canvas_gantt_t(:help_label_editing_saving))
        expect(i18n_payload['help_desc_maximize_left']).to eq(canvas_gantt_t(:help_desc_maximize_left))
        expect(i18n_payload['help_desc_workload']).to eq(canvas_gantt_t(:help_desc_workload))
        expect(i18n_payload['help_desc_prev_next_month']).to eq(canvas_gantt_t(:help_desc_prev_next_month))
        expect(i18n_payload['help_desc_zoom_wheel']).to eq(canvas_gantt_t(:help_desc_zoom_wheel))
        expect(i18n_payload['button_close']).to eq(canvas_gantt_t(:button_close))
        expect(i18n_payload['label_notifications']).to eq(canvas_gantt_t(:label_notifications))
        expect(i18n_payload['label_peak']).to eq(canvas_gantt_t(:label_peak))
        expect(i18n_payload['label_total']).to eq(canvas_gantt_t(:label_total))
        expect(i18n_payload['label_workload']).to eq(canvas_gantt_t(:label_workload))
        expect(i18n_payload['label_show_workload']).to eq(canvas_gantt_t(:label_show_workload))
        expect(i18n_payload['label_unassigned']).to eq(canvas_gantt_t(:label_unassigned))
        expect(i18n_payload['label_none']).to eq(canvas_gantt_t(:label_none))
        expect(i18n_payload['label_capacity_threshold']).to eq(canvas_gantt_t(:label_capacity_threshold))
        expect(i18n_payload['label_leaf_issues_only']).to eq(canvas_gantt_t(:label_leaf_issues_only))
        expect(i18n_payload['label_include_closed_issues']).to eq(canvas_gantt_t(:label_include_closed_issues))
        expect(i18n_payload['label_today_onward_only']).to eq(canvas_gantt_t(:label_today_onward_only))
        expect(i18n_payload['label_auto_schedule_move_mode']).to eq(canvas_gantt_t(:label_auto_schedule_move_mode))
        expect(i18n_payload['label_auto_schedule_move_mode_off']).to eq(canvas_gantt_t(:label_auto_schedule_move_mode_off))
        expect(i18n_payload['label_auto_schedule_move_mode_constraint_push']).to eq(canvas_gantt_t(:label_auto_schedule_move_mode_constraint_push))
        expect(i18n_payload['label_auto_schedule_move_mode_linked_shift']).to eq(canvas_gantt_t(:label_auto_schedule_move_mode_linked_shift))
        expect(i18n_payload['label_toggle_hierarchy_lines']).to eq(canvas_gantt_t(:label_toggle_hierarchy_lines))
        expect(i18n_payload['label_display_settings']).to eq(canvas_gantt_t(:label_display_settings))
        expect(i18n_payload['label_display_settings_source_global']).to eq(canvas_gantt_t(:label_display_settings_source_global))
      end
    end

    it 'includes localized help labels in English frontend i18n payload' do
      I18n.with_locale(:en) do
        get :index, params: { project_id: 'demo' }

        expect(response).to have_http_status(:ok)
      i18n_payload = controller.instance_variable_get(:@i18n).stringify_keys
        expect(i18n_payload['label_help']).to eq(canvas_gantt_t(:label_help))
        expect(i18n_payload['help_label_layout_filters']).to eq(canvas_gantt_t(:help_label_layout_filters))
        expect(i18n_payload['help_label_timeline_view']).to eq(canvas_gantt_t(:help_label_timeline_view))
        expect(i18n_payload['help_label_editing_saving']).to eq(canvas_gantt_t(:help_label_editing_saving))
        expect(i18n_payload['help_desc_maximize_left']).to eq(canvas_gantt_t(:help_desc_maximize_left))
        expect(i18n_payload['help_desc_workload']).to eq(canvas_gantt_t(:help_desc_workload))
        expect(i18n_payload['help_desc_prev_next_month']).to eq(canvas_gantt_t(:help_desc_prev_next_month))
        expect(i18n_payload['button_close']).to eq(canvas_gantt_t(:button_close))
        expect(i18n_payload['label_display_settings']).to eq(canvas_gantt_t(:label_display_settings))
        expect(i18n_payload['label_display_settings_source_project']).to eq(canvas_gantt_t(:label_display_settings_source_project))
        expect(i18n_payload['label_notifications']).to eq(canvas_gantt_t(:label_notifications))
        expect(i18n_payload['label_peak']).to eq(canvas_gantt_t(:label_peak))
        expect(i18n_payload['label_total']).to eq(canvas_gantt_t(:label_total))
        expect(i18n_payload['label_workload']).to eq(canvas_gantt_t(:label_workload))
        expect(i18n_payload['label_show_workload']).to eq(canvas_gantt_t(:label_show_workload))
        expect(i18n_payload['label_capacity_threshold']).to eq(canvas_gantt_t(:label_capacity_threshold))
        expect(i18n_payload['label_leaf_issues_only']).to eq(canvas_gantt_t(:label_leaf_issues_only))
        expect(i18n_payload['label_include_closed_issues']).to eq(canvas_gantt_t(:label_include_closed_issues))
        expect(i18n_payload['label_today_onward_only']).to eq(canvas_gantt_t(:label_today_onward_only))
        expect(i18n_payload['label_auto_schedule_move_mode']).to eq(canvas_gantt_t(:label_auto_schedule_move_mode))
        expect(i18n_payload['label_auto_schedule_move_mode_off']).to eq(canvas_gantt_t(:label_auto_schedule_move_mode_off))
        expect(i18n_payload['label_auto_schedule_move_mode_constraint_push']).to eq(canvas_gantt_t(:label_auto_schedule_move_mode_constraint_push))
        expect(i18n_payload['label_auto_schedule_move_mode_linked_shift']).to eq(canvas_gantt_t(:label_auto_schedule_move_mode_linked_shift))
        expect(i18n_payload['label_toggle_hierarchy_lines']).to eq(canvas_gantt_t(:label_toggle_hierarchy_lines))
      end
    end
  end

  describe 'GET #edit_meta and POST #edit_meta_preview' do
    let(:current_user) { instance_double(User, id: 7, logged?: true, login: 'tester', language: 'en') }
    let(:edit_meta_payload_builder) { double('EditMetaPayloadBuilder') }
    let(:issue_scope) { double('IssueScope') }
    let(:issue_project) do
      instance_double(Project, id: 99, issue_categories: [], trackers: [])
    end
    let(:issue) do
      instance_double(
        Issue,
        id: 42,
        project_id: 99,
        project: issue_project,
        editable?: true,
        safe_attribute?: true
      )
    end

    before do
      allow(User).to receive(:current).and_return(current_user)
      allow(current_user).to receive(:allowed_to?).and_return(false)
      allow(current_user).to receive(:allowed_to?).with(:edit_issues, issue_project).and_return(true)
      allow(controller).to receive(:edit_meta_payload_builder).and_return(edit_meta_payload_builder)
      allow(edit_meta_payload_builder).to receive(:task_payload).with(issue).and_return({ id: issue.id })
      allow(edit_meta_payload_builder).to receive(:resolved_project_options).and_return([])
      allow(edit_meta_payload_builder).to receive(:build) do |issue:, capability_issue:, draft_contract: nil, **|
        payload = {
          task: { id: issue.id },
          options: {
            trackers: Array(capability_issue.allowed_target_trackers(current_user)).map { |tracker| { id: tracker.id, name: tracker.name } }
          }
        }
        payload[:draft_contract] = draft_contract if draft_contract
        payload
      end
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true, baseline_editable: false })
      end
      allow(Issue).to receive(:visible).and_return(issue_scope)
      allow(issue_scope).to receive(:find).with('42').and_return(issue)
      allow(controller).to receive(:current_view_scope).and_return({ issue_ids: Set[42], scope_project_ids: [1, 99], visible_project_ids: [99] })
      allow(issue).to receive(:new_statuses_allowed_to).and_return([])
      allow(issue).to receive(:assignable_users).and_return([])
      allow(issue).to receive(:allowed_target_trackers).and_return([])
      allow(issue).to receive(:assignable_versions).and_return([])
      allow(issue).to receive(:subject).and_return('Scoped issue')
      allow(issue).to receive(:assigned_to_id).and_return(nil)
      allow(issue).to receive(:assigned_to).and_return(nil)
      allow(issue).to receive(:status_id).and_return(1)
      allow(issue).to receive(:done_ratio).and_return(0)
      allow(issue).to receive(:due_date).and_return(nil)
      allow(issue).to receive(:start_date).and_return(nil)
      allow(issue).to receive(:priority_id).and_return(nil)
      allow(issue).to receive(:category_id).and_return(nil)
      allow(issue).to receive(:estimated_hours).and_return(nil)
      allow(issue).to receive(:tracker_id).and_return(nil)
      allow(issue).to receive(:fixed_version_id).and_return(nil)
      allow(issue).to receive(:lock_version).and_return(1)
      allow(issue).to receive(:status).and_return(nil)
      allow(IssuePriority).to receive(:active).and_return([])
      allow(Project).to receive_message_chain(:allowed_to, :active, :where).and_return([])
      allow(Version).to receive_message_chain(:visible, :where).and_return([])
      allow(controller).to receive(:custom_field_extractor).and_return(
        instance_double(
          RedmineCanvasGantt::CustomFieldExtractor,
          extract_custom_fields: [[], {}]
        )
      )
    end

    it 'allows edit_meta for an issue when the current view scope includes it' do
      get :edit_meta, params: { project_id: 'demo', id: '42', member_projects_only: '1' }, format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).dig('task', 'id')).to eq(42)
    end

    it 'returns scope not_found when edit_meta receives a visible issue outside the Canvas scope' do
      allow(controller).to receive(:ensure_issue_in_scope).and_call_original
      allow(controller).to receive(:current_view_scope).and_return({ scope_project_ids: [1] })

      get :edit_meta, params: { project_id: 'demo', id: '42' }, format: :json

      expect(response).to have_http_status(:not_found)
      expect(JSON.parse(response.body).dig('failure', 'resource_role')).to eq('scope')
    end

    it 'returns destination-project options when target_project_id is authorized' do
      destination_tracker = instance_double(Tracker, id: 7, name: 'Destination tracker')
      destination_project = instance_double(
        Project,
        id: 1,
        issue_categories: [],
        trackers: [destination_tracker],
        assignable_users: []
      )
      capability_issue = instance_double(
        Issue,
        project: destination_project,
        project_id: 1,
        tracker_id: 7,
        status_id: 1,
        editable?: true,
        safe_attribute?: true,
        allowed_target_trackers: [destination_tracker]
      )
      evaluation = double(issue: capability_issue, draft_contract: { materialized: { project_id: 1 } }, violations: [])
      allow(controller).to receive(:issue_draft_evaluator).and_return(double(evaluate: evaluation))
      allow(current_user).to receive(:allowed_to?).with(:edit_issues, destination_project).and_return(true)

      get :edit_meta, params: { project_id: 'demo', id: '42', target_project_id: '1' }, format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).dig('options', 'trackers')).to eq([{ 'id' => 7, 'name' => 'Destination tracker' }])
    end

    it 'adapts legacy target_tracker_id and target_status_id through the shared evaluator' do
      evaluation = double(
        issue: issue,
        draft_contract: {
          base_revision: 1,
          materialized: { tracker_id: 7, status_id: 2 },
          normalizations: [],
          violations: []
        },
        violations: []
      )
      evaluator = double
      expect(evaluator).to receive(:evaluate).with(
        issue: issue,
        intent: { tracker_id: 7, status_id: 2 }
      ).and_return(evaluation)
      allow(controller).to receive(:issue_draft_evaluator).and_return(evaluator)

      get :edit_meta,
          params: {
            project_id: 'demo',
            id: '42',
            target_tracker_id: '7',
            target_status_id: '2'
          },
          format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).dig('draft_contract', 'materialized')).to eq(
        'tracker_id' => 7,
        'status_id' => 2
      )
    end

    it 'evaluates a field-presence draft through the POST preview endpoint' do
      contract = {
        base_revision: 1,
        materialized: { project_id: 1, tracker_id: 7 },
        normalizations: [{ field: 'tracker_id', from: nil, to: 7, source: 'policy' }],
        violations: []
      }
      evaluation = double(issue: issue, draft_contract: contract, violations: [])
      evaluator = double
      allow(evaluator).to receive(:evaluate).with(
        issue: issue,
        intent: { project_id: '1', lock_version: '1' }
      ).and_return(evaluation)
      allow(controller).to receive(:issue_draft_evaluator).and_return(evaluator)

      post :edit_meta_preview,
           params: {
             project_id: 'demo',
             id: '42',
             task: { project_id: '1', lock_version: '1', date_update_mode: 'project_move' }
           },
           format: :json

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body['task']).to eq('id' => 42)
      expect(body.dig('draft_contract', 'materialized')).to eq('project_id' => 1, 'tracker_id' => 7)
    end

    it 'returns a stale preview violation before parent or calendar preprocessing' do
      expect(controller).not_to receive(:preprocess_draft_intent)

      post :edit_meta_preview,
           params: {
             project_id: 'demo',
             id: '42',
             task: { parent_issue_id: '42', due_date: 'invalid', lock_version: '0' }
           },
           format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).dig('draft_contract', 'violations')).to include(
        include('field' => 'lock_version', 'code' => 'stale_revision')
      )
    end

    it 'returns preview domain violations in the additive draft contract' do
      contract = {
        base_revision: 1,
        materialized: {},
        normalizations: [],
        violations: [{ field: 'author_id', code: 'unsupported_field', message: 'The requested field cannot be edited.' }]
      }
      evaluation = double(issue: issue, draft_contract: contract, violations: contract[:violations])
      allow(controller).to receive(:issue_draft_evaluator).and_return(double(evaluate: evaluation))

      post :edit_meta_preview,
           params: { project_id: 'demo', id: '42', task: { author_id: '9', lock_version: '1' } },
           format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).dig('draft_contract', 'violations')).to include(
        include('field' => 'author_id', 'code' => 'unsupported_field')
      )
    end

    it 'keeps the draft contract and complete preview response within the response-size gates' do
      get :edit_meta, params: { project_id: 'demo', id: '42' }, format: :json
      equivalent_response_size = response.body.bytesize
      contract = {
        base_revision: 1,
        materialized: { project_id: 1, tracker_id: 7 },
        normalizations: [{ field: 'tracker_id', from: nil, to: 7, source: 'policy' }],
        violations: []
      }
      evaluation = double(issue: issue, draft_contract: contract, violations: [])
      allow(controller).to receive(:issue_draft_evaluator).and_return(double(evaluate: evaluation))

      post :edit_meta_preview,
           params: { project_id: 'demo', id: '42', task: { project_id: '1', lock_version: '1' } },
           format: :json

      contract_size = JSON.generate(JSON.parse(response.body).fetch('draft_contract')).bytesize
      allowed_growth = [8.kilobytes, (equivalent_response_size * 0.1).ceil].max
      expect(contract_size).to be <= 8.kilobytes
      expect(response.body.bytesize - equivalent_response_size).to be <= allowed_growth
    end
  end

  describe 'PATCH #update' do
    let(:issue_scope) { double('IssueScope') }
    let(:issue) do
      instance_double(
        Issue,
        id: 10,
        parent_id: nil,
        project_id: 1,
        lock_version: 1,
        editable?: true
      )
    end

    before do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(Issue).to receive(:visible).and_return(issue_scope)
      allow(issue_scope).to receive(:find).with('10').and_return(issue)
      allow(issue_scope).to receive(:find_by).and_return(nil)
      allow(controller).to receive(:data_payload_builder).and_return(double(build_task_state: { id: 10 }))
      allow(controller).to receive(:ensure_issue_in_scope).and_return(true)
      allow(controller).to receive(:ensure_issue_editable).and_return(true)
      evaluation = double(valid?: true)
      allow(controller).to receive(:issue_draft_evaluator).and_return(double(evaluate: evaluation))
    end

    it 'returns conflict on stale object error' do
      allow(issue).to receive(:init_journal)
      allow(issue).to receive(:safe_attributes=)
      allow(issue).to receive(:save).and_raise(ActiveRecord::StaleObjectError.new(issue, 'update'))
      allow(controller).to receive(:load_parent_issue).and_return(nil)
      remote_issue = instance_double(Issue, id: 10, lock_version: 4)
      allow(issue_scope).to receive(:find_by).and_return(remote_issue)
      allow(controller).to receive(:data_payload_builder).and_return(
        double(build_task_state: { id: 10, subject: 'Remote', lock_version: 4 })
      )

      patch :update, params: { project_id: 'demo', id: '10', task: { subject: 'Updated', lock_version: 1 } }, format: :json

      expect(response).to have_http_status(:conflict)
      body = JSON.parse(response.body)
      expect(body['status']).to eq('conflict')
      expect(body['completeness']).to eq('partial')
      expect(body['entity']).to include('id' => 10, 'lock_version' => 4)
      expect(body['revision']).to eq(4)
      expect(body['entity']).not_to have_key('display_order')
      expect(body['entity']).not_to have_key('editable')
      expect(body['error']).to include('Conflict')
      expect(body).not_to have_key('display_order')
      expect(body).not_to have_key('editable')
    end

    it 'returns conflict for a stale revision before date preprocessing' do
      expect(controller).not_to receive(:preprocess_draft_intent)

      patch :update,
            params: { project_id: 'demo', id: '10', task: { due_date: 'invalid', lock_version: 0 } },
            format: :json

      expect(response).to have_http_status(:conflict)
    end

    it 'returns conflict for a stale revision before parent preprocessing' do
      expect(controller).not_to receive(:preprocess_draft_intent)

      patch :update,
            params: { project_id: 'demo', id: '10', task: { parent_issue_id: '10', lock_version: 0 } },
            format: :json

      expect(response).to have_http_status(:conflict)
    end

    it 'returns scope not_found when a visible target is outside the Canvas mutation scope' do
      allow(controller).to receive(:ensure_issue_in_scope).and_call_original
      allow(controller).to receive(:current_view_scope).and_return({ scope_project_ids: [2] })

      patch :update, params: { project_id: 'demo', id: '10', task: { subject: 'Out of scope', lock_version: 1 } }, format: :json

      expect(response).to have_http_status(:not_found)
      expect(JSON.parse(response.body)).to include(
        'status' => 'not_found',
        'failure' => include(
          'kind' => 'not_found',
          'resource_role' => 'scope',
          'resource_type' => 'task'
        )
      )
    end

    it 'keeps missing visible targets classified as target not_found' do
      allow(issue_scope).to receive(:find).with('10').and_raise(ActiveRecord::RecordNotFound)

      patch :update, params: { project_id: 'demo', id: '10', task: { subject: 'Missing', lock_version: 1 } }, format: :json

      expect(response).to have_http_status(:not_found)
      expect(JSON.parse(response.body)).to include(
        'status' => 'not_found',
        'failure' => include(
          'kind' => 'not_found',
          'resource_role' => 'target',
          'resource_type' => 'task'
        )
      )
    end

    it 'returns unprocessable entity when setting itself as parent' do
      allow(issue_scope).to receive(:find).and_return(issue)

      patch :update, params: { project_id: 'demo', id: '10', task: { parent_issue_id: '10', lock_version: 1 } }, format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)['errors']).to include('A task cannot be a child of itself.')
    end

    it 'returns unprocessable entity when requested parent linkage is not persisted' do
      allow(issue).to receive(:init_journal)
      allow(issue).to receive(:safe_attributes=)
      allow(issue).to receive(:save).and_return(true)
      allow(issue).to receive(:parent_id).and_return(nil)
      allow(controller).to receive(:load_parent_issue).and_return(double('ParentIssue', id: 11))

      patch :update, params: { project_id: 'demo', id: '10', task: { parent_issue_id: '11', lock_version: 1 } }, format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      body = JSON.parse(response.body)
      expect(body['errors']).to include('Parent linkage failed')
      expect(body['parent_id']).to be_nil
    end

    it 'returns ok when parent linkage is not requested' do
      allow(issue).to receive(:init_journal)
      allow(issue).to receive(:safe_attributes=)
      allow(issue).to receive(:save).and_return(true)
      allow(issue).to receive(:lock_version).and_return(1, 2)
      allow(controller).to receive(:load_parent_issue).and_return(nil)

      patch :update, params: { project_id: 'demo', id: '10', task: { subject: 'Updated', lock_version: 1 } }, format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)['status']).to eq('ok')
    end

    it 'maps evaluator domain violations to an unprocessable mutation response' do
      violation = { field: 'status_id', code: 'not_accepted', message: 'The requested value was not accepted.' }
      evaluation = double(
        valid?: false,
        violations: [violation],
        draft_contract: { base_revision: 1, materialized: {}, normalizations: [], violations: [violation] }
      )
      allow(controller).to receive(:issue_draft_evaluator).and_return(double(evaluate: evaluation))
      allow(issue).to receive(:init_journal)
      allow(controller).to receive(:load_parent_issue).and_return(nil)

      patch :update,
            params: { project_id: 'demo', id: '10', task: { status_id: '999999', lock_version: '1' } },
            format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)).to include(
        'status' => 'validation_error',
        'errors' => ['The requested value was not accepted.']
      )
    end
  end

  describe '#ensure_issue_in_operation_scope' do
    let(:issue) { instance_double(Issue, id: 10) }

    before do
      allow(controller).to receive(:requested_operation_issue_ids).and_return(Set[10])
      allow(controller).to receive(:mutation_scope_issues).and_return([])
    end

    it 'classifies operation scope rejection as scope not_found by default' do
      expect(controller).to receive(:render) do |json:, status:|
        expect(status).to eq(:not_found)
        expect(json[:failure]).to include(
          kind: 'not_found',
          resource_role: 'scope',
          resource_type: 'task'
        )
      end

      expect(controller.send(:ensure_issue_in_operation_scope, issue)).to be(false)
    end
  end

  describe '#issue_editable?' do
    let(:current_user) { instance_double(User) }
    let(:canvas_project) { instance_double(Project, id: 1, name: 'Parent') }
    let(:child_project) { instance_double(Project, id: 2, name: 'Child') }
    let(:child_issue) { instance_double(Issue, project: child_project, editable?: true) }

    before do
      allow(User).to receive(:current).and_return(current_user)
      allow(current_user).to receive(:allowed_to?).and_return(false)
    end

    it 'uses the target child issue project rather than the canvas project' do
      allow(current_user).to receive(:allowed_to?).with(:edit_issues, child_project).and_return(true)
      allow(current_user).to receive(:allowed_to?).with(:edit_issues, canvas_project).and_return(false)

      expect(controller.send(:issue_editable?, child_issue)).to be(true)
      expect(current_user).to have_received(:allowed_to?).with(:edit_issues, child_project)
      expect(current_user).not_to have_received(:allowed_to?).with(:edit_issues, canvas_project)
    end
  end

  describe 'DELETE #destroy_task' do
    let(:current_user) { instance_double(User, id: 7, logged?: true, login: 'tester', language: 'en') }
    let(:issue_scope) { double('IssueScope') }
    let(:issue_project) { instance_double(Project, id: 1) }
    let(:issue) { instance_double(Issue, id: 10, project_id: 1, parent_id: nil, project: issue_project, deletable?: true) }

    before do
      allow(User).to receive(:current).and_return(current_user)
      allow(current_user).to receive(:allowed_to?).and_return(false)
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(Issue).to receive(:visible).and_return(issue_scope)
      allow(issue_scope).to receive(:find).with('10').and_return(issue)
      allow(controller).to receive(:current_view_issue_ids).and_return(Set[10])
      allow(controller).to receive(:current_view_scope).and_return({ scope_project_ids: [1], issues: [] })
    end

    it 'deletes an issue and returns ok for an authorized session' do
      allow(current_user).to receive(:allowed_to?).with(:delete_issues, issue_project).and_return(true)
      allow(issue).to receive(:destroy)

      delete :destroy_task, params: { project_id: 'demo', id: '10' }, format: :json

      expect(issue).to have_received(:destroy)
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq(
        'status' => 'ok',
        'completeness' => 'partial',
        'invalidated_entity_ids' => [10],
        'deleted_entity_ids' => [10]
      )
    end

    it 'returns forbidden without delete permission' do
      allow(current_user).to receive(:allowed_to?).with(:delete_issues, issue_project).and_return(false)

      delete :destroy_task, params: { project_id: 'demo', id: '10' }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end

    it 'returns scope not_found and does not delete a visible issue outside the Canvas scope' do
      allow(controller).to receive(:ensure_issue_in_scope).and_call_original
      allow(controller).to receive(:current_view_scope).and_return({ scope_project_ids: [2] })
      allow(issue).to receive(:destroy)

      delete :destroy_task, params: { project_id: 'demo', id: '10' }, format: :json

      expect(response).to have_http_status(:not_found)
      expect(JSON.parse(response.body).dig('failure', 'resource_role')).to eq('scope')
      expect(issue).not_to have_received(:destroy)
    end

    it 'does not use current view membership as mutation authorization' do
      allow(controller).to receive(:current_view_issue_ids).and_return(Set[])
      allow(current_user).to receive(:allowed_to?).with(:delete_issues, issue_project).and_return(true)
      allow(issue).to receive(:destroy)

      delete :destroy_task, params: { project_id: 'demo', id: '10' }, format: :json

      expect(response).to have_http_status(:ok)
    end
  end

  describe 'POST #bulk_create_subtasks' do
    let(:current_user) { instance_double(User, id: 7, logged?: true, login: 'tester', language: 'en') }
    let(:issue_scope) { double('IssueScope') }
    let(:parent_tracker) { instance_double(Tracker, id: 3, name: 'Bug') }
    let(:parent_project) { instance_double(Project, id: 2, trackers: [parent_tracker]) }
    let(:parent_issue) do
      instance_double(
        Issue,
        id: 99,
        project_id: 2,
        project: parent_project,
        tracker_id: 3,
        status_id: 4,
        priority_id: 5,
        assigned_to_id: 6,
        fixed_version_id: 7,
        category_id: 8
      )
    end

    before do
      allow(User).to receive(:current).and_return(current_user)
      allow(current_user).to receive(:allowed_to?).and_return(false)
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(Issue).to receive(:visible).and_return(issue_scope)
      allow(issue_scope).to receive(:find).with('99').and_return(parent_issue)
      allow(controller).to receive(:current_view_scope).and_return({ scope_project_ids: [2], issues: [] })
      allow(controller).to receive(:ensure_issue_in_scope).and_return(true)
    end

    it 'returns forbidden when add issue permission is missing on parent project' do
      allow(User.current).to receive(:allowed_to?).with(:add_issues, parent_project).and_return(false)
      allow(User.current).to receive(:allowed_to?).with(:manage_subtasks, parent_project).and_return(true)

      post :bulk_create_subtasks, params: { project_id: 'demo', parent_issue_id: '99', subjects: ['A'] }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end

    it 'returns forbidden when manage subtasks permission is missing on parent project' do
      allow(User.current).to receive(:allowed_to?).with(:add_issues, parent_project).and_return(true)
      allow(User.current).to receive(:allowed_to?).with(:manage_subtasks, parent_project).and_return(false)

      post :bulk_create_subtasks, params: { project_id: 'demo', parent_issue_id: '99', subjects: ['A'] }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end

    it 'returns unprocessable entity when subjects are empty' do
      allow(User.current).to receive(:allowed_to?).with(:add_issues, parent_project).and_return(true)
      allow(User.current).to receive(:allowed_to?).with(:manage_subtasks, parent_project).and_return(true)

      post :bulk_create_subtasks, params: { project_id: 'demo', parent_issue_id: '99', subjects: [] }, format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)).to eq('error' => 'subjects must be a non-empty array')
    end

    it 'returns not found when parent is visible only as a context row outside operation scope' do
      allow(controller).to receive(:current_view_issue_ids).and_return(Set[99, 100])
      allow(controller).to receive(:current_view_scope).and_return({ scope_project_ids: [], issues: [] })
      allow(controller).to receive(:ensure_issue_in_scope).and_call_original

      post :bulk_create_subtasks,
           params: {
             project_id: 'demo',
             parent_issue_id: '99',
             subjects: ['A'],
             operation_issue_ids: [100]
           },
           format: :json

      expect(response).to have_http_status(:not_found)
      expect(JSON.parse(response.body)).to include(
        'error' => 'Issue not found in this project',
        'status' => 'not_found',
        'failure' => include(
          'kind' => 'not_found',
          'resource_role' => 'reference',
          'resource_type' => 'parent_task'
        )
      )
    end

    it 'rolls back all subtasks when one row fails' do
      allow(User.current).to receive(:allowed_to?).with(:add_issues, parent_project).and_return(true)
      allow(User.current).to receive(:allowed_to?).with(:manage_subtasks, parent_project).and_return(true)

      created_issue = double('CreatedIssue', id: 501, parent_id: 99, errors: double(full_messages: []))
      failed_issue = double('FailedIssue', parent_id: nil, errors: double(full_messages: ['Subject is invalid']))
      allow(Issue).to receive(:new).and_return(created_issue, failed_issue)

      allow(created_issue).to receive(:author=).with(User.current)
      allow(created_issue).to receive(:safe_attributes=)
      allow(created_issue).to receive(:parent_issue_id=).with(99)
      allow(created_issue).to receive(:save).and_return(true)

      allow(failed_issue).to receive(:author=).with(User.current)
      allow(failed_issue).to receive(:safe_attributes=)
      allow(failed_issue).to receive(:parent_issue_id=).with(99)
      allow(failed_issue).to receive(:save).and_return(false)

      post :bulk_create_subtasks,
           params: {
             project_id: 'demo',
             parent_issue_id: '99',
             subjects: ['Task A', 'Task B']
           },
           format: :json

      expect(created_issue).to have_received(:safe_attributes=).with(hash_including(
        subject: 'Task A',
        parent_issue_id: 99,
        project_id: 2,
        tracker_id: 3,
        status_id: 4,
        priority_id: 5,
        assigned_to_id: 6
      ))
      expect(failed_issue).to have_received(:safe_attributes=).with(hash_including(
        subject: 'Task B',
        project_id: 2
      ))
      expect(created_issue).to have_received(:parent_issue_id=).with(99)
      expect(failed_issue).to have_received(:parent_issue_id=).with(99)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body['status']).to eq('ok')
      expect(body['success_count']).to eq(0)
      expect(body['fail_count']).to eq(2)
      expect(body['results'].map { |r| r['status'] }).to eq(['error', 'error'])
      expect(body['results'][0]['errors']).to eq(['No child tickets were created because another row failed'])
      expect(body['results'][1]['errors']).to eq(['Subject is invalid'])
    end

    it 'treats mismatched parent linkage as error and removes orphan issue' do
      allow(User.current).to receive(:allowed_to?).with(:add_issues, parent_project).and_return(true)
      allow(User.current).to receive(:allowed_to?).with(:manage_subtasks, parent_project).and_return(true)

      orphan_issue = double('OrphanIssue', id: 777, parent_id: nil, errors: double(full_messages: []))
      allow(Issue).to receive(:new).and_return(orphan_issue)
      allow(orphan_issue).to receive(:author=).with(User.current)
      allow(orphan_issue).to receive(:safe_attributes=)
      allow(orphan_issue).to receive(:parent_issue_id=).with(99)
      allow(orphan_issue).to receive(:save).and_return(true)
      allow(orphan_issue).to receive(:destroy)

      post :bulk_create_subtasks,
           params: {
             project_id: 'demo',
             parent_issue_id: '99',
             subjects: ['Task A']
           },
           format: :json

      expect(orphan_issue).to have_received(:destroy)
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body['success_count']).to eq(0)
      expect(body['fail_count']).to eq(1)
      expect(body['results'][0]['status']).to eq('error')
      expect(body['results'][0]['errors']).to eq(['Parent linkage failed'])
    end
  end

  describe 'GET #subtask_trackers' do
    let(:current_user) { instance_double(User, id: 7, logged?: true, login: 'tester', language: 'en') }
    let(:issue_scope) { double('IssueScope') }
    let(:tracker) { instance_double(Tracker, id: 3, name: 'Bug') }
    let(:parent_project) { instance_double(Project, trackers: [tracker]) }
    let(:parent_issue) { instance_double(Issue, id: 99, project: parent_project) }

    before do
      allow(User).to receive(:current).and_return(current_user)
      allow(current_user).to receive(:allowed_to?).and_return(false)
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(Issue).to receive(:visible).and_return(issue_scope)
      allow(issue_scope).to receive(:find).with('99').and_return(parent_issue)
      allow(controller).to receive(:ensure_issue_in_scope).and_return(true)
      allow(controller).to receive(:ensure_issue_in_operation_scope).and_return(true)
    end

    it 'returns the trackers available to the parent project' do
      get :subtask_trackers,
          params: { project_id: 'demo', parent_issue_id: '99', operation_issue_ids: [99] },
          format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq('trackers' => [{ 'id' => 3, 'name' => 'Bug' }])
    end
  end

  describe 'PATCH #update_relation' do
    let(:current_user) { instance_double(User, id: 7, logged?: true, login: 'tester', language: 'en') }
    let(:issue_scope) { double('IssueScope') }
    let(:relation) { instance_double(IssueRelation, id: 77, issue_from_id: 10, issue_to_id: 11, save: true) }
    let(:project_from) { instance_double(Project, id: 1) }
    let(:project_to) { instance_double(Project, id: 2) }
    let(:issue_from) { instance_double(Issue, id: 10, project_id: 1, project: project_from, editable?: true, relations: []) }
    let(:issue_to) { instance_double(Issue, id: 11, project_id: 2, project: project_to, editable?: true, relations: []) }

    before do
      allow(User).to receive(:current).and_return(current_user)
      allow(current_user).to receive(:allowed_to?).and_return(false)
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(controller).to receive(:current_view_issue_ids).and_return(Set[10, 11])
      allow(controller).to receive(:current_view_scope).and_return({ scope_project_ids: [1, 2, 3], issues: [] })
      allow(controller).to receive(:mutation_scope_issues).and_return([issue_from, issue_to])
      allow(IssueRelation).to receive(:find).with('77').and_return(relation)
      allow(relation).to receive(:id).and_return(77)
      allow(relation).to receive(:issue_from_id).and_return(10)
      allow(relation).to receive(:issue_to_id).and_return(11)
      allow(relation).to receive(:issue_from).and_return(issue_from)
      allow(relation).to receive(:issue_to).and_return(issue_to)
      allow(Issue).to receive(:visible).and_return(issue_scope)
      allow(issue_scope).to receive(:find).with(10).and_return(issue_from)
      allow(issue_scope).to receive(:find).with(11).and_return(issue_to)
      allow(issue_from).to receive(:due_date).and_return(Date.new(2026, 1, 2))
      allow(issue_to).to receive(:start_date).and_return(Date.new(2026, 1, 7))
      allow(relation).to receive(:errors).and_return(double(full_messages: ['Save failed']))
      allow(Setting).to receive(:non_working_week_days).and_return(['6', '7'])
      allow(User.current).to receive(:allowed_to?).with(:edit_issues, project_from).and_return(true)
      allow(User.current).to receive(:allowed_to?).with(:edit_issues, project_to).and_return(true)

      current_type = 'precedes'
      current_delay = 2
      allow(relation).to receive(:relation_type) { current_type }
      allow(relation).to receive(:delay) { current_delay }
      allow(relation).to receive(:relation_type=) { |value| current_type = value }
      allow(relation).to receive(:delay=) { |value| current_delay = value }
    end

    it 'updates a relation and returns the canonical payload' do
      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'blocks' } },
            format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq(
        'status' => 'ok',
        'completeness' => 'complete',
        'invalidated_entity_ids' => [10, 11],
        'relation' => {
          'id' => 77,
          'from' => 10,
          'to' => 11,
          'type' => 'blocks',
          'delay' => nil
        }
      )
    end

    it 'returns forbidden when owned issue is not editable' do
      allow(User.current).to receive(:allowed_to?).with(:edit_issues, project_from).and_return(false)
      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'blocks' } },
            format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end

    it 'returns not found when relation is outside the current project' do
      allow(relation).to receive(:issue_from).and_return(instance_double(Issue, id: 30, project_id: 3, project: project_from, editable?: true))
      allow(relation).to receive(:issue_to).and_return(instance_double(Issue, id: 40, project_id: 4, project: project_to, editable?: true))
      allow(issue_scope).to receive(:find).with(10).and_return(instance_double(Issue, id: 30, project_id: 3, project: project_from, editable?: true))
      allow(issue_scope).to receive(:find).with(11).and_return(instance_double(Issue, id: 40, project_id: 4, project: project_to, editable?: true))

      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'blocks' } },
            format: :json

      expect(response).to have_http_status(:not_found)
      expect(JSON.parse(response.body)).to include(
        'error' => 'Relation not found in this project',
        'status' => 'not_found',
        'failure' => include(
          'kind' => 'not_found',
          'resource_role' => 'relation',
          'resource_type' => 'relation'
        )
      )
    end

    it 'rejects an invalid relation type' do
      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'duplicates' } },
            format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)).to eq('errors' => ['Relation type is invalid'])
    end

    it 'rejects blank delay for delay-capable relation types' do
      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'precedes', delay: '' } },
            format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)).to eq('errors' => ['Delay is required for this relation type'])
    end

    it 'rejects non-integer delay values' do
      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'precedes', delay: 'abc' } },
            format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)).to eq('errors' => ['Delay must be an integer that is 0 or greater'])
    end

    it 'rejects negative delay values' do
      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'precedes', delay: '-1' } },
            format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)).to eq('errors' => ['Delay must be an integer that is 0 or greater'])
    end

    it 'rejects delay for non-delay relation types when explicitly provided' do
      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'blocks', delay: '2' } },
            format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)).to eq('errors' => ['Delay is not allowed for this relation type'])
    end

    it 'rejects delay when it does not match current task dates' do
      allow(issue_from).to receive(:editable?).and_return(true)
      allow(issue_from).to receive(:due_date).and_return(Date.new(2026, 1, 2))
      allow(issue_to).to receive(:start_date).and_return(Date.new(2026, 1, 4))

      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'precedes', delay: '3' } },
            format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)).to eq('errors' => ['Delay does not match the current task dates.'])
    end

    it 'rejects relation updates that would create a scheduling cycle' do
      allow(issue_from).to receive(:editable?).and_return(true)
      existing_relations = [{ id: '12', from: 11, to: 10, type: 'precedes', delay: 0 }]
      allow(controller).to receive(:current_view_scope).and_return({ scope_project_ids: [1, 2, 3], issues: [double('Issue')] })
      allow(controller).to receive(:build_relations).and_return(existing_relations)

      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'precedes', delay: '2' } },
            format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)).to eq('errors' => ['This dependency would create a scheduling cycle.'])
    end

    it 'allows delay when dependency dates are missing' do
      allow(issue_from).to receive(:editable?).and_return(true)
      allow(issue_from).to receive(:due_date).and_return(nil)

      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'precedes', delay: '3' } },
            format: :json

      expect(response).to have_http_status(:ok)
    end
  end

  describe 'POST #create_relation' do
    let(:current_user) { instance_double(User, id: 7, logged?: true, login: 'tester', language: 'en') }
    let(:issue_scope) { double('IssueScope') }
    let(:issue_project) { instance_double(Project, id: 1) }
    let(:issue_from) { instance_double(Issue, id: 10, project_id: 1, project: issue_project, editable?: true, due_date: Date.new(2026, 1, 2), start_date: Date.new(2026, 1, 1), relations: []) }
    let(:issue_to) { instance_double(Issue, id: 11, project_id: 1, project: issue_project, editable?: true, due_date: Date.new(2026, 1, 8), start_date: Date.new(2026, 1, 7), relations: []) }
    let(:relation) { instance_double(IssueRelation, id: 88, issue_from_id: 10, issue_to_id: 11, relation_type: 'precedes', delay: 2, save: true) }

    before do
      allow(User).to receive(:current).and_return(current_user)
      allow(current_user).to receive(:allowed_to?).and_return(false)
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(controller).to receive(:current_view_issue_ids).and_return(Set[10, 11])
      allow(controller).to receive(:current_view_scope).and_return({ scope_project_ids: [1, 2, 3], issues: [] })
      allow(controller).to receive(:mutation_scope_issues).and_return([issue_from, issue_to])
      allow(Issue).to receive(:visible).and_return(issue_scope)
      allow(issue_scope).to receive(:find).with('10').and_return(issue_from)
      allow(issue_scope).to receive(:find).with('11').and_return(issue_to)
      allow(IssueRelation).to receive(:new).and_return(relation)
      allow(relation).to receive(:relation_type=)
      allow(relation).to receive(:delay=)
      allow(Setting).to receive(:non_working_week_days).and_return(['6', '7'])
      allow(User.current).to receive(:allowed_to?).with(:edit_issues, issue_project).and_return(true)
    end

    it 'creates a relation when delay matches current task dates' do
      post :create_relation,
           params: { project_id: 'demo', relation: { issue_from_id: '10', issue_to_id: '11', relation_type: 'precedes', delay: '2' } },
           format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq(
        'status' => 'ok',
        'completeness' => 'complete',
        'invalidated_entity_ids' => [10, 11],
        'relation' => {
          'id' => 88,
          'from' => 10,
          'to' => 11,
          'type' => 'precedes',
          'delay' => 2
        }
      )
    end

    it 'rejects relation creation when delay does not match current task dates' do
      post :create_relation,
           params: { project_id: 'demo', relation: { issue_from_id: '10', issue_to_id: '11', relation_type: 'precedes', delay: '3' } },
           format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)).to eq('errors' => ['Delay does not match the current task dates.'])
    end

    it 'rejects relation creation that would create a scheduling cycle' do
      allow(controller).to receive(:current_view_scope).and_return({ scope_project_ids: [1, 2, 3], issues: [double('Issue')] })
      allow(controller).to receive(:build_relations).and_return([
        { id: '12', from: 11, to: 10, type: 'precedes', delay: 0 }
      ])

      post :create_relation,
           params: { project_id: 'demo', relation: { issue_from_id: '10', issue_to_id: '11', relation_type: 'precedes', delay: '2' } },
           format: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)).to eq('errors' => ['This dependency would create a scheduling cycle.'])
    end

    it 'allows relation creation when dependency dates are missing' do
      allow(issue_from).to receive(:due_date).and_return(nil)

      post :create_relation,
           params: { project_id: 'demo', relation: { issue_from_id: '10', issue_to_id: '11', relation_type: 'precedes', delay: '3' } },
           format: :json

      expect(response).to have_http_status(:ok)
    end
  end

  describe '#save_relation_change business calendar fallback' do
    let(:relation) { instance_double(IssueRelation, id: 77, issue_from_id: 10, issue_to_id: 11) }
    let(:issue_from) { instance_double(Issue) }
    let(:issue_to) { instance_double(Issue) }

    it 'continues saving a delay relation when calendar configuration is invalid' do
      allow(controller).to receive(:ensure_editable_relation_type!).and_return(true)
      allow(controller).to receive(:relation_params).and_return({ relation_type: 'precedes' })
      allow(controller).to receive(:normalized_relation_delay).and_return(0)
      allow(controller).to receive(:performed?).and_return(false)
      allow(controller).to receive(:ensure_relation_change_valid!).and_return(true)
      allow(controller).to receive(:business_calendar_resolver).and_return(
        instance_double(RedmineCanvasGantt::ProjectCalendarResolver, configuration_error?: true)
      )
      allow(controller).to receive(:render_relation_save_result)
      allow(relation).to receive(:relation_type=)
      allow(relation).to receive(:delay=)

      controller.send(
        :save_relation_change,
        relation: relation,
        issue_from: issue_from,
        issue_to: issue_to,
        relation_id: '77'
      )

      expect(controller).to have_received(:render_relation_save_result).with(relation)
    end
  end

  describe 'DELETE #destroy_relation' do
    let(:current_user) { instance_double(User, id: 7, logged?: true, login: 'tester', language: 'en') }
    let(:issue_scope) { double('IssueScope') }
    let(:relation) { instance_double(IssueRelation, id: 77, issue_from_id: 10, issue_to_id: 11) }
    let(:project_from) { instance_double(Project, id: 1) }
    let(:project_to) { instance_double(Project, id: 2) }
    let(:issue_from) { instance_double(Issue, id: 10, project_id: 1, project: project_from, editable?: false) }
    let(:issue_to) { instance_double(Issue, id: 11, project_id: 2, project: project_to, editable?: true) }

    before do
      allow(User).to receive(:current).and_return(current_user)
      allow(current_user).to receive(:allowed_to?).and_return(false)
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(controller).to receive(:current_view_issue_ids).and_return(Set[10, 11])
      allow(controller).to receive(:current_view_scope).and_return({ scope_project_ids: [1, 2, 3], issues: [] })
      allow(IssueRelation).to receive(:find).with('77').and_return(relation)
      allow(Issue).to receive(:visible).and_return(issue_scope)
      allow(issue_scope).to receive(:find).with(10).and_return(issue_from)
      allow(issue_scope).to receive(:find).with(11).and_return(issue_to)
      allow(relation).to receive(:issue_from).and_return(issue_from)
      allow(relation).to receive(:issue_to).and_return(issue_to)
      allow(User.current).to receive(:allowed_to?).with(:edit_issues, project_from).and_return(false)
      allow(User.current).to receive(:allowed_to?).with(:edit_issues, project_to).and_return(true)
    end

    it 'destroys a relation when either side belongs to a descendant project' do
      descendant_from = instance_double(Issue, id: 10, project_id: 2, project: project_from, editable?: true)
      descendant_to = instance_double(Issue, id: 11, project_id: 3, project: project_to, editable?: true)
      allow(issue_scope).to receive(:find).with(10).and_return(descendant_from)
      allow(issue_scope).to receive(:find).with(11).and_return(descendant_to)
      allow(User.current).to receive(:allowed_to?).with(:edit_issues, project_from).and_return(true)
      allow(relation).to receive(:destroy)

      delete :destroy_relation, params: { project_id: 'demo', id: '77' }, format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq(
        'status' => 'ok',
        'completeness' => 'partial',
        'invalidated_entity_ids' => [10, 11],
        'deleted_entity_ids' => [77]
      )
      expect(relation).to have_received(:destroy)
    end

    it 'returns forbidden when owned issue is not editable' do
      delete :destroy_relation, params: { project_id: 'demo', id: '77' }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end

    it 'returns not found when relation is outside the current project' do
      allow(relation).to receive(:issue_from).and_return(instance_double(Issue, id: 30, project_id: 3, project: project_from, editable?: true))
      allow(relation).to receive(:issue_to).and_return(instance_double(Issue, id: 40, project_id: 4, project: project_to, editable?: true))
      allow(issue_scope).to receive(:find).with(10).and_return(instance_double(Issue, id: 30, project_id: 3, project: project_from, editable?: true))
      allow(issue_scope).to receive(:find).with(11).and_return(instance_double(Issue, id: 40, project_id: 4, project: project_to, editable?: true))

      delete :destroy_relation, params: { project_id: 'demo', id: '77' }, format: :json

      expect(response).to have_http_status(:not_found)
      expect(JSON.parse(response.body)).to include(
        'error' => 'Relation not found in this project',
        'status' => 'not_found',
        'failure' => include(
          'kind' => 'not_found',
          'resource_role' => 'relation',
          'resource_type' => 'relation'
        )
      )
    end
  end

  describe 'DataPayloadBuilder relation serialization' do
    it 'serializes relation delay into the frontend payload' do
      relation = instance_double(
        IssueRelation,
        id: 50,
        issue_from_id: 10,
        issue_to_id: 20,
        relation_type: 'precedes',
        delay: 3
      )
      issue = instance_double(Issue, id: 10, relations: [relation])
      related_issue = instance_double(Issue, id: 20, relations: [])

      expect(controller.send(:data_payload_builder).build_relations([issue, related_issue])).to eq([
        {
          id: 50,
          from: 10,
          to: 20,
          type: 'precedes',
          delay: 3
        }
      ])
    end
  end

  describe '#inline_custom_fields_enabled?' do
    it 'is true when setting is missing (default ON)' do
      allow(controller).to receive(:plugin_settings).and_return({})
      expect(controller.send(:inline_custom_fields_enabled?)).to be(true)
    end

    it 'is false when setting is explicitly OFF' do
      allow(controller).to receive(:plugin_settings).and_return({ 'inline_edit_custom_fields' => '0' })
      expect(controller.send(:inline_custom_fields_enabled?)).to be(false)
    end
  end

  describe 'CustomFieldExtractor helpers' do
    let(:allowed_custom_field) do
      instance_double(
        IssueCustomField,
        id: 1,
        name: 'Allowed CF',
        field_format: 'string',
        multiple?: false,
        is_required: false,
        regexp: nil,
        min_length: nil,
        max_length: nil,
        possible_values: nil
      )
    end
    let(:disallowed_custom_field) do
      instance_double(
        IssueCustomField,
        id: 2,
        name: 'Disallowed CF',
        field_format: 'string',
        multiple?: false,
        is_required: false,
        regexp: nil,
        min_length: nil,
        max_length: nil,
        possible_values: nil
      )
    end
    let(:allowed_custom_field_value) { double('CustomValueAllowed', custom_field: allowed_custom_field, value: 'A-001') }
    let(:disallowed_custom_field_value) { double('CustomValueDisallowed', custom_field: disallowed_custom_field, value: 'B-001') }
    let(:issue) do
      instance_double(
        Issue,
        available_custom_fields: [allowed_custom_field],
        custom_field_values: [allowed_custom_field_value, disallowed_custom_field_value]
      )
    end

    before do
      allow(controller).to receive(:inline_custom_fields_enabled?).and_return(true)
    end

    it 'filters out custom fields that are not applicable to the issue tracker in edit_meta' do
      custom_fields, custom_field_values = controller.send(:custom_field_extractor).extract_custom_fields(issue, true)

      expect(custom_fields.map { |cf| cf[:id] }).to eq([1])
      expect(custom_field_values).to eq('1' => 'A-001')
    end

    it 'filters out custom fields that are not applicable to the issue tracker in data payload values' do
      values = controller.send(:custom_field_extractor).build_task_custom_field_values(issue)
      expect(values).to eq('1' => 'A-001')
    end
  end

  describe 'POST #schedule_mutation' do
    before do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(controller).to receive(:schedule_mutation_coordinator).and_return(
        instance_double(
          RedmineCanvasGantt::ScheduleMutationCoordinator,
          call: RedmineCanvasGantt::ScheduleMutationCoordinator::Result.new(
            status: :ok,
            entities: [],
            revisions: {},
            invalidated_entity_ids: [],
            errors: []
          )
        )
      )
    end

    it 'exposes a single operation boundary for a multi-issue schedule change' do
      post :schedule_mutation,
           params: {
             project_id: 'demo',
             operation_id: 'schedule:test-a-b',
             base_revisions: { '10' => 1, '11' => 1 },
             changes: [
               { task_id: 10, start_date: '2027-01-04', due_date: '2027-01-05' },
               { task_id: 11, start_date: '2027-01-06', due_date: '2027-01-07' }
             ]
           },
           format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to include(
        'status' => 'ok',
        'operation_id' => 'schedule:test-a-b',
        'completeness' => 'complete'
      )
    end

    it 'rejects a calendar-sensitive mutation when the client revision is stale' do
      calendar_resolver = instance_double(
        RedmineCanvasGantt::ProjectCalendarResolver,
        revision: 'calendar-revision-2'
      )
      allow(controller).to receive(:business_calendar_resolver).and_return(calendar_resolver)
      expect(controller).not_to receive(:schedule_mutation_coordinator)
      request.headers['X-Redmine-Canvas-Gantt-Calendar-Revision'] = 'calendar-revision-1'

      post :schedule_mutation,
           params: {
             project_id: 'demo',
             operation_id: 'schedule:stale-calendar',
             base_revisions: { '10' => 1 },
             changes: [{ task_id: 10, due_date: '2027-01-05' }]
           },
           format: :json

      expect(response).to have_http_status(:conflict)
      expect(JSON.parse(response.body)).to include(
        'status' => 'conflict',
        'failure' => include(
          'kind' => 'conflict',
          'resource_role' => 'scope',
          'resource_type' => 'business_calendar',
          'resource_id' => 'calendar-revision-2',
          'remote_availability' => 'needs_refresh'
        ),
        'conflict' => {
          'expected_calendar_revision' => 'calendar-revision-1',
          'actual_calendar_revision' => 'calendar-revision-2'
        }
      )
    end

  end
end
