require_relative '../spec_helper'

RSpec.describe CanvasGanttsController, type: :controller do
  fixtures :projects, :users, :roles, :members, :member_roles, :enabled_modules,
           :trackers, :issue_statuses, :issues, :enumerations, :time_entries, :queries

  before do
    Project.find(1).enable_module!(:canvas_gantt)
    User.current = User.find(1)
    controller.send(:start_user_session, User.current)
  end

  def make_issue(subject, parent = nil)
    issue = Issue.find(1).copy
    issue.subject = subject
    issue.parent_issue_id = parent&.id
    issue.save!
    issue
  end

  def physical_state(issue)
    controller.send(:data_payload_builder).build_task_state(issue.reload).fetch(:has_physical_children)
  end

  def move(issue, parent)
    patch :update, params: { project_id: 1, id: issue.id, format: :json,
      task: { parent_issue_id: parent&.id, lock_version: issue.reload.lock_version } }
    expect(response).to have_http_status(:ok), response.body
    JSON.parse(response.body)
  end

  it 'invalidates both old and new parents and returns canonical physical state for the moved issue' do
    old_parent = make_issue('Old parent')
    new_parent = make_issue('New parent')
    child = make_issue('Moving child', old_parent)
    expect(physical_state(new_parent)).to be(false)

    body = move(child, new_parent)

    expect(body.fetch('invalidated_entity_ids').map(&:to_i)).to include(old_parent.id, new_parent.id, child.id)
    expect(body.fetch('entity')).to include('parent_id' => new_parent.id, 'has_physical_children' => false)
    expect(body.fetch('entity')).not_to have_key('has_children')
    expect(body.fetch('entity')).not_to have_key('display_order')
    expect(physical_state(old_parent)).to be(false)
    expect(physical_state(new_parent)).to be(true)
  end

  [false, true].each do |hidden_sibling|
    it "refreshes the old parent's physical state after root move (hidden sibling: #{hidden_sibling})" do
      parent = make_issue('Parent')
      child = make_issue('Moving child', parent)
      sibling = make_issue('Private sibling', parent) if hidden_sibling
      sibling.update!(is_private: true) if sibling

      body = move(child, nil)

      expect(body.fetch('invalidated_entity_ids').map(&:to_i)).to include(parent.id, child.id)
      expect(body.fetch('entity')).to include('parent_id' => nil, 'has_physical_children' => false)
      expect(physical_state(parent)).to eq(hidden_sibling)
      # Only the visible parent is serialized; no child IDs or subjects are needed.
      payload = controller.send(:data_payload_builder).build_tasks([parent.reload])
      expect(payload.first.fetch(:has_physical_children)).to eq(hidden_sibling)
      expect(payload.map { |row| row.fetch(:id) }).to eq([parent.id])
    end
  end
end
