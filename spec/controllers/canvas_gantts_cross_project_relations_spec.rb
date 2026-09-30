require_relative '../spec_helper'

RSpec.describe CanvasGanttsController, type: :controller do
  fixtures :projects, :users, :roles, :members, :member_roles, :enabled_modules,
           :trackers, :issue_statuses, :issues, :enumerations

  let(:project) { Project.find(1) }
  let(:external_project) do
    Project.create!(name: 'Canvas external scope', identifier: 'canvas-external-scope', is_public: true)
  end
  let(:local_issue) { copy_issue_to(project, 'Canvas local endpoint') }
  let(:external_issue) { copy_issue_to(external_project, 'Canvas external endpoint') }

  before do
    project.enable_module!(:canvas_gantt)
    external_project.enable_module!(:issue_tracking)
    controller.send(:start_user_session, User.find(1))
    User.current = User.find(1)
  end

  it 'creates cross-root relations only when Redmine permits them' do
    allow(Setting).to receive(:cross_project_issue_relations?).and_return(true)

    post :create_relation, params: relation_request_params, format: :json

    expect(response).to have_http_status(:ok)
    relation = IssueRelation.find_by!(issue_from_id: local_issue.id, issue_to_id: external_issue.id)
    expect(relation.relation_type).to eq('blocks')

    IssueRelation.where(issue_from_id: local_issue.id, issue_to_id: external_issue.id).delete_all
    allow(Setting).to receive(:cross_project_issue_relations?).and_return(false)

    post :create_relation, params: relation_request_params, format: :json

    expect(response).to have_http_status(:unprocessable_entity)
    expect(IssueRelation.where(issue_from_id: local_issue.id, issue_to_id: external_issue.id)).to be_empty
  end

  it 'updates cross-root relations only when Redmine permits them' do
    allow(Setting).to receive(:cross_project_issue_relations?).and_return(true)
    relation = IssueRelation.create!(issue_from: local_issue, issue_to: external_issue, relation_type: 'blocks')

    patch :update_relation,
          params: relation_request_params.merge(id: relation.id, relation: { relation_type: 'relates' }),
          format: :json

    expect(response).to have_http_status(:ok)
    expect(relation.reload.relation_type).to eq('relates')

    allow(Setting).to receive(:cross_project_issue_relations?).and_return(false)

    patch :update_relation,
          params: relation_request_params.merge(id: relation.id, relation: { relation_type: 'blocks' }),
          format: :json

    expect(response).to have_http_status(:unprocessable_entity)
    expect(relation.reload.relation_type).to eq('relates')
  end

  ['local', 'external', 'mixed'].each do |selection_case|
    it "schedules #{selection_case} project issues through the real controller scope" do
      local = local_issue
      external = external_issue
      issues, selected_project_ids = case selection_case
      when 'local' then [[local], [project.id, external_project.id]]
      when 'external' then [[external], [project.id, external_project.id]]
      else [[local, external], [project.id, external_project.id]]
      end
      due_date = Date.new(2027, 1, 5)
      changes = issues.map { |issue| { task_id: issue.id, due_date: due_date.iso8601 } }
      revisions = issues.to_h { |issue| [issue.id.to_s, issue.reload.lock_version] }

      post :schedule_mutation,
           params: {
             project_id: project.id,
             member_projects_only: '1',
             canvas_project_ids: selected_project_ids.map(&:to_s),
             operation_id: "cross-project-#{selection_case}",
             base_revisions: revisions,
             changes: changes,
             date_placement_mode: 'calendar_days'
           },
           format: :json

      expect(response).to have_http_status(:ok), response.body
      issues.each { |issue| expect(issue.reload.due_date).to eq(due_date) }
    end
  end

  private

  def copy_issue_to(target_project, subject)
    copied = Issue.find(1).dup
    copied.project = target_project
    copied.subject = subject
    copied.author = User.find(1)
    copied.save!
    copied.reload
  end

  def relation_request_params
    {
      project_id: project.id,
      member_projects_only: '1',
      canvas_project_ids: [project.id.to_s, external_project.id.to_s],
      relation: {
        issue_from_id: local_issue.id.to_s,
        issue_to_id: external_issue.id.to_s,
        relation_type: 'blocks'
      }
    }
  end
end
