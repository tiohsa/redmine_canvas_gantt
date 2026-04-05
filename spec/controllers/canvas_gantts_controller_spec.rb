require_relative '../spec_helper'

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

  describe 'GET #data' do
    it 'returns forbidden when view permission is missing' do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: false, viewable: false, baseline_editable: false })
      end

      get :data, params: { project_id: 'demo' }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
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
      allow(controller).to receive(:filter_option_projects).with([1, 2]).and_return([filter_option_project])
      allow(controller).to receive(:filter_option_issues).with([1, 2]).and_return([filter_option_issue])
      allow(controller).to receive(:query_state_resolver).and_return(resolver)
      allow(controller).to receive(:baseline_repository).and_return(baseline_repository)
      issue = double('Issue', project_id: 1)
      allow(resolver).to receive(:resolve).and_return({
        issues: [issue],
        initial_state: { query_id: 7 },
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
        baseline: baseline_snapshot.to_payload_hash,
        warnings: ['Invalid query_id ignored', 'Baseline warning']
      })

      get :data, params: { project_id: 'demo' }, format: :json

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body.keys).to contain_exactly('tasks', 'custom_fields', 'relations', 'versions', 'filter_options', 'statuses', 'project', 'permissions', 'initial_state', 'baseline', 'warnings')
      expect(body['permissions']).to eq('editable' => true, 'viewable' => true, 'baseline_editable' => true)
      expect(body['filter_options']).to eq(
        'projects' => [{ 'id' => 1, 'name' => 'Demo' }],
        'assignees' => [{ 'id' => 7, 'name' => 'Alice', 'project_ids' => ['1'] }]
      )
      expect(body['baseline']).to include('snapshot_id' => 'baseline-1', 'project_id' => 1)
      expect(body['warnings']).to contain_exactly('Invalid query_id ignored', 'Baseline warning')
    end
  end

  describe 'GET #queries' do
    let(:current_user) { instance_double(User, id: 7) }
    let(:visible_query) do
      instance_double(IssueQuery, id: 12, name: 'Open issues', visibility: 2, project_id: 1)
    end
    let(:project_query) do
      instance_double(IssueQuery, id: 18, name: 'Team backlog', visibility: 0, project_id: 1)
    end

    before do
      allow(User).to receive(:current).and_return(current_user)
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
    let(:current_user) { instance_double(User, id: 7, name: 'Alice') }
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
      allow(current_user).to receive(:allowed_to?).with(:edit_canvas_gantt, project).and_return(true)
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
      allow(current_user).to receive(:allowed_to?).with(:edit_canvas_gantt, project).and_return(false)

      post :save_baseline, params: { project_id: 'demo' }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end
  end

  describe 'GET #index' do
    before do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: false, viewable: true, baseline_editable: false })
      end
      allow(controller).to receive(:plugin_settings).and_return({})
      allow(Setting).to receive(:non_working_week_days).and_return([0, 6])
    end

    it 'includes row height labels in frontend i18n payload' do
      get :index, params: { project_id: 'demo' }

      expect(response).to have_http_status(:ok)
      i18n_payload = controller.instance_variable_get(:@i18n)
      expect(i18n_payload['label_row_height']).to eq(canvas_gantt_t(:label_row_height))
      expect(i18n_payload['label_row_height_m']).to eq(canvas_gantt_t(:label_row_height_m))
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
    end

    it 'includes localized help labels in Japanese frontend i18n payload' do
      I18n.with_locale(:ja) do
        get :index, params: { project_id: 'demo' }

        expect(response).to have_http_status(:ok)
        i18n_payload = controller.instance_variable_get(:@i18n)
        expect(i18n_payload['label_help']).to eq(canvas_gantt_t(:label_help))
        expect(i18n_payload['help_label_layout_filters']).to eq(canvas_gantt_t(:help_label_layout_filters))
        expect(i18n_payload['help_label_timeline_view']).to eq(canvas_gantt_t(:help_label_timeline_view))
        expect(i18n_payload['help_label_editing_saving']).to eq(canvas_gantt_t(:help_label_editing_saving))
        expect(i18n_payload['help_desc_maximize_left']).to eq(canvas_gantt_t(:help_desc_maximize_left))
        expect(i18n_payload['help_desc_workload']).to eq(canvas_gantt_t(:help_desc_workload))
        expect(i18n_payload['help_desc_prev_next_month']).to eq(canvas_gantt_t(:help_desc_prev_next_month))
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
      end
    end

    it 'includes localized help labels in English frontend i18n payload' do
      I18n.with_locale(:en) do
        get :index, params: { project_id: 'demo' }

        expect(response).to have_http_status(:ok)
        i18n_payload = controller.instance_variable_get(:@i18n)
        expect(i18n_payload['label_help']).to eq(canvas_gantt_t(:label_help))
        expect(i18n_payload['help_label_layout_filters']).to eq(canvas_gantt_t(:help_label_layout_filters))
        expect(i18n_payload['help_label_timeline_view']).to eq(canvas_gantt_t(:help_label_timeline_view))
        expect(i18n_payload['help_label_editing_saving']).to eq(canvas_gantt_t(:help_label_editing_saving))
        expect(i18n_payload['help_desc_maximize_left']).to eq(canvas_gantt_t(:help_desc_maximize_left))
        expect(i18n_payload['help_desc_workload']).to eq(canvas_gantt_t(:help_desc_workload))
        expect(i18n_payload['help_desc_prev_next_month']).to eq(canvas_gantt_t(:help_desc_prev_next_month))
        expect(i18n_payload['button_close']).to eq(canvas_gantt_t(:button_close))
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
      end
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
        editable?: true
      )
    end

    before do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(Issue).to receive(:visible).and_return(issue_scope)
      allow(issue_scope).to receive(:find).with('10').and_return(issue)
      allow(controller).to receive(:ensure_issue_in_scope).and_return(true)
      allow(controller).to receive(:ensure_issue_editable).and_return(true)
    end

    it 'returns conflict on stale object error' do
      allow(issue).to receive(:init_journal)
      allow(issue).to receive(:safe_attributes=)
      allow(issue).to receive(:save).and_raise(ActiveRecord::StaleObjectError.new(issue, 'update'))
      allow(controller).to receive(:load_parent_issue).and_return(nil)

      patch :update, params: { project_id: 'demo', id: '10', task: { subject: 'Updated', lock_version: 1 } }, format: :json

      expect(response).to have_http_status(:conflict)
      expect(JSON.parse(response.body)['error']).to include('Conflict')
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
      allow(issue).to receive(:lock_version).and_return(2)
      allow(controller).to receive(:load_parent_issue).and_return(nil)

      patch :update, params: { project_id: 'demo', id: '10', task: { subject: 'Updated', lock_version: 1 } }, format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)['status']).to eq('ok')
    end
  end

  describe 'POST #bulk_create_subtasks' do
    let(:issue_scope) { double('IssueScope') }
    let(:parent_project) { instance_double(Project, id: 2) }
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
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(Issue).to receive(:visible).and_return(issue_scope)
      allow(issue_scope).to receive(:find).with('99').and_return(parent_issue)
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

    it 'creates subtasks with inherited fields and reports partial failure' do
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
        assigned_to_id: 6,
        fixed_version_id: 7,
        category_id: 8
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
      expect(body['success_count']).to eq(1)
      expect(body['fail_count']).to eq(1)
      expect(body['results'].map { |r| r['status'] }).to eq(['ok', 'error'])
      expect(body['results'][0]['issue_id']).to eq(501)
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

  describe 'PATCH #update_relation' do
    let(:relation) { instance_double(IssueRelation, id: 77, issue_from_id: 10, issue_to_id: 11, save: true) }
    let(:issue_from) { instance_double(Issue, project_id: 1, editable?: false) }
    let(:issue_to) { instance_double(Issue, project_id: 2, editable?: true) }

    before do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(controller).to receive(:descendant_project_ids).and_return([1, 2])
      allow(controller).to receive(:issue_scope).with([1, 2]).and_return(double(to_a: []))
      allow(IssueRelation).to receive(:find).with('77').and_return(relation)
      allow(relation).to receive(:issue_from).and_return(issue_from)
      allow(relation).to receive(:issue_to).and_return(issue_to)
      allow(relation).to receive(:errors).and_return(double(full_messages: ['Save failed']))
      allow(Setting).to receive(:non_working_week_days).and_return([0, 6])

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
      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'blocks' } },
            format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end

    it 'returns not found when relation is outside the current project' do
      allow(relation).to receive(:issue_from).and_return(instance_double(Issue, project_id: 3, editable?: true))
      allow(relation).to receive(:issue_to).and_return(instance_double(Issue, project_id: 4, editable?: true))

      patch :update_relation,
            params: { project_id: 'demo', id: '77', relation: { relation_type: 'blocks' } },
            format: :json

      expect(response).to have_http_status(:not_found)
      expect(JSON.parse(response.body)).to eq('error' => 'Relation not found in this project')
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
      allow(controller).to receive(:issue_scope).with([1, 2]).and_return(double(to_a: [double('Issue')]))
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
    let(:issue_scope) { double('IssueScope') }
    let(:issue_from) { instance_double(Issue, id: 10, project_id: 1, editable?: true, due_date: Date.new(2026, 1, 2), start_date: Date.new(2026, 1, 1)) }
    let(:issue_to) { instance_double(Issue, id: 11, project_id: 1, editable?: true, due_date: Date.new(2026, 1, 5), start_date: Date.new(2026, 1, 4)) }
    let(:relation) { instance_double(IssueRelation, id: 88, issue_from_id: 10, issue_to_id: 11, relation_type: 'precedes', delay: 2, save: true) }

    before do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(controller).to receive(:descendant_project_ids).and_return([1])
      allow(controller).to receive(:issue_scope).with([1]).and_return(double(to_a: []))
      allow(Issue).to receive(:visible).and_return(issue_scope)
      allow(issue_scope).to receive(:find).with('10').and_return(issue_from)
      allow(issue_scope).to receive(:find).with('11').and_return(issue_to)
      allow(IssueRelation).to receive(:new).and_return(relation)
      allow(Setting).to receive(:non_working_week_days).and_return([0, 6])
    end

    it 'creates a relation when delay matches current task dates' do
      post :create_relation,
           params: { project_id: 'demo', relation: { issue_from_id: '10', issue_to_id: '11', relation_type: 'precedes', delay: '2' } },
           format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq(
        'status' => 'ok',
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
      allow(controller).to receive(:issue_scope).with([1]).and_return(double(to_a: [double('Issue')]))
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

  describe 'DELETE #destroy_relation' do
    let(:relation) { instance_double(IssueRelation) }
    let(:issue_from) { instance_double(Issue, project_id: 1, editable?: false) }
    let(:issue_to) { instance_double(Issue, project_id: 2, editable?: true) }

    before do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(controller).to receive(:descendant_project_ids).and_return([1, 2])
      allow(IssueRelation).to receive(:find).with('77').and_return(relation)
      allow(relation).to receive(:issue_from).and_return(issue_from)
      allow(relation).to receive(:issue_to).and_return(issue_to)
    end

    it 'destroys a relation when either side belongs to a descendant project' do
      allow(relation).to receive(:issue_from).and_return(instance_double(Issue, project_id: 2, editable?: true))
      allow(relation).to receive(:issue_to).and_return(instance_double(Issue, project_id: 3, editable?: true))
      allow(relation).to receive(:destroy)

      delete :destroy_relation, params: { project_id: 'demo', id: '77' }, format: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq('status' => 'ok')
      expect(relation).to have_received(:destroy)
    end

    it 'returns forbidden when owned issue is not editable' do
      delete :destroy_relation, params: { project_id: 'demo', id: '77' }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end

    it 'returns not found when relation is outside the current project' do
      allow(relation).to receive(:issue_from).and_return(instance_double(Issue, project_id: 3, editable?: true))
      allow(relation).to receive(:issue_to).and_return(instance_double(Issue, project_id: 4, editable?: true))

      delete :destroy_relation, params: { project_id: 'demo', id: '77' }, format: :json

      expect(response).to have_http_status(:not_found)
      expect(JSON.parse(response.body)).to eq('error' => 'Relation not found in this project')
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
      issue = instance_double(Issue, relations: [relation])

      expect(controller.send(:data_payload_builder).build_relations([issue])).to eq([
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
end
