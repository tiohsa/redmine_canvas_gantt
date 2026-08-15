require_relative '../spec_helper'

RSpec.describe CanvasGanttsController, type: :controller do
  fixtures :projects, :users, :roles, :members, :member_roles,
           :trackers, :issue_statuses, :workflows, :enumerations, :issues

  let(:current_user) { User.find(2) }
  let(:project) { Project.find(1) }
  let(:issue) { Issue.find(1) }

  before do
    User.current = current_user
    session[:user_id] = current_user.id
    project.enabled_module_names = (project.enabled_module_names + ['canvas_gantt']).uniq
    project.save!
    role = Member.find_by!(user_id: current_user.id, project_id: project.id).roles.first
    role.permissions = (role.permissions + %i[view_issues view_canvas_gantt edit_issues add_issues]).uniq
    role.save!
    session[:tk] = current_user.generate_session_token
  end

  def sql_query_count
    count = 0
    subscriber = lambda do |_name, _start, _finish, _id, payload|
      next if payload[:cached] || payload[:name] == 'SCHEMA'
      next if payload[:sql].to_s.match?(/\A(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/i)

      count += 1
    end
    ActiveSupport::Notifications.subscribed(subscriber, 'sql.active_record') { yield }
    count
  end

  def preview_params
    {
      project_id: project.identifier,
      id: issue.id,
      project_ids: [project.id.to_s],
      task: { tracker_id: issue.tracker_id.to_s, lock_version: issue.lock_version.to_s },
      format: :json
    }
  end

  def legacy_params
    {
      project_id: project.identifier,
      id: issue.id,
      project_ids: [project.id.to_s],
      target_tracker_id: issue.tracker_id.to_s,
      format: :json
    }
  end

  it 'keeps the complete Preview endpoint within the legacy query and response-size gates' do
    get :edit_meta, params: legacy_params
    expect(response).to have_http_status(:ok)
    legacy_response_size = response.body.bytesize
    legacy_query_count = sql_query_count { get :edit_meta, params: legacy_params }

    post :edit_meta_preview, params: preview_params
    expect(response).to have_http_status(:ok)
    preview_query_count = sql_query_count { post :edit_meta_preview, params: preview_params }
    expect(response).to have_http_status(:ok)

    body = JSON.parse(response.body)
    contract_size = JSON.generate(body.fetch('draft_contract')).bytesize
    allowed_growth = [8.kilobytes, (legacy_response_size * 0.1).ceil].max
    expect(preview_query_count).to be <= legacy_query_count + 5
    expect(contract_size).to be <= 8.kilobytes
    expect(response.body.bytesize - legacy_response_size).to be <= allowed_growth
  end

  it 'adds no Preview endpoint queries at 1, 100, and 1000 visible issues' do
    template = issue.attributes.except('id')
    Issue.where.not(id: issue.id).delete_all
    query_counts = [1, 100, 1000].map do |target_count|
      missing_count = target_count - Issue.where(project_id: project.id).count
      if missing_count.positive?
        Issue.insert_all!(missing_count.times.map do |index|
          template.merge(
            'subject' => "Canvas endpoint scale #{target_count}-#{index}",
            'created_on' => Time.current,
            'updated_on' => Time.current
          )
        end)
      end

      post :edit_meta_preview, params: preview_params
      expect(response).to have_http_status(:ok)
      sql_query_count { post :edit_meta_preview, params: preview_params }
    end

    expect(query_counts.uniq).to contain_exactly(query_counts.first)
  end
end
