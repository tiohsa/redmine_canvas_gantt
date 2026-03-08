require_relative '../spec_helper'

RSpec.describe CanvasGanttsController, type: :controller do
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
        controller.instance_variable_set(:@permissions, { editable: false, viewable: false })
      end

      get :data, params: { project_id: 'demo' }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end

    it 'returns data payload with expected top-level keys' do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(controller).to receive(:descendant_project_ids).and_return([1, 2])
      allow(controller).to receive(:issue_scope).with([1, 2]).and_return([double('Issue')])
      allow(controller).to receive(:build_tasks).and_return([{ id: 10 }])
      allow(controller).to receive(:build_relations).and_return([{ id: 20 }])
      allow(controller).to receive(:build_versions).with([1, 2]).and_return([{ id: 30 }])
      allow(controller).to receive(:build_statuses).and_return([{ id: 40 }])
      allow(controller).to receive(:build_project_payload).and_return({ id: 1, name: 'Demo' })

      get :data, params: { project_id: 'demo' }, format: :json

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body.keys).to contain_exactly('tasks', 'relations', 'versions', 'statuses', 'project', 'permissions')
      expect(body['permissions']).to eq('editable' => true, 'viewable' => true)
    end
  end

  describe 'GET #index' do
    before do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: false, viewable: true })
      end
      allow(controller).to receive(:plugin_settings).and_return({})
      allow(Setting).to receive(:non_working_week_days).and_return([0, 6])
    end

    it 'includes row height labels in frontend i18n payload' do
      get :index, params: { project_id: 'demo' }

      expect(response).to have_http_status(:ok)
      i18n_payload = controller.instance_variable_get(:@i18n)
      expect(i18n_payload['label_row_height']).to eq(I18n.t(:label_row_height))
      expect(i18n_payload['label_row_height_m']).to eq(I18n.t(:label_row_height_m))
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

  describe 'DELETE #destroy_relation' do
    let(:relation) { instance_double(IssueRelation) }
    let(:issue_from) { instance_double(Issue, project_id: 1, editable?: false) }
    let(:issue_to) { instance_double(Issue, project_id: 2, editable?: true) }

    before do
      allow(controller).to receive(:set_permissions) do
        controller.instance_variable_set(:@permissions, { editable: true, viewable: true })
      end
      allow(IssueRelation).to receive(:find).with('77').and_return(relation)
      allow(relation).to receive(:issue_from).and_return(issue_from)
      allow(relation).to receive(:issue_to).and_return(issue_to)
    end

    it 'returns forbidden when owned issue is not editable' do
      delete :destroy_relation, params: { project_id: 'demo', id: '77' }, format: :json

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)).to eq('error' => 'Permission denied')
    end

    it 'returns not found when relation is outside the current project' do
      allow(relation).to receive(:issue_from).and_return(instance_double(Issue, project_id: 2, editable?: true))
      allow(relation).to receive(:issue_to).and_return(instance_double(Issue, project_id: 3, editable?: true))

      delete :destroy_relation, params: { project_id: 'demo', id: '77' }, format: :json

      expect(response).to have_http_status(:not_found)
      expect(JSON.parse(response.body)).to eq('error' => 'Relation not found in this project')
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

  describe '#extract_custom_fields / #build_task_custom_field_values' do
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
      custom_fields, custom_field_values = controller.send(:extract_custom_fields, issue, { custom_field_values: true })

      expect(custom_fields.map { |cf| cf[:id] }).to eq([1])
      expect(custom_field_values).to eq('1' => 'A-001')
    end

    it 'filters out custom fields that are not applicable to the issue tracker in data payload values' do
      values = controller.send(:build_task_custom_field_values, issue)
      expect(values).to eq('1' => 'A-001')
    end
  end
end
