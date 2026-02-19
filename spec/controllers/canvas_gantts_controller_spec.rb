require 'spec_helper'

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
end
