require_relative '../spec_helper'

RSpec.describe CanvasGanttsController, type: :controller do
  fixtures :projects, :users, :roles, :members, :member_roles, :enabled_modules

  let(:user) { User.find(2) }
  let(:root) { Project.find(1) }
  let(:group) { Group.create!(lastname: 'Canvas candidate group') }

  before do
    User.current = user
    controller.instance_variable_set(:@project, root)
    group.users << user
  end

  after do
    User.current = nil
  end

  def candidate_project(identifier, parent: root, **attributes)
    Project.create!({ name: identifier, identifier: identifier, parent: parent, is_public: true }.merge(attributes))
  end

  def membership(project, principal)
    # Persist the principal membership itself, independently of Redmine's
    # callbacks that also materialize inherited individual role memberships.
    Member.insert_all!([{ project_id: project.id, user_id: principal.id, created_on: Time.current }])
  end

  def candidates(member_only: true)
    controller.send(:filter_option_projects, [], member_projects_only: member_only)
      .map { |option| option.fetch(:id) }
  end

  it 'includes direct and group-only memberships across project roots without duplicates' do
    direct = candidate_project('candidate-direct')
    grouped = candidate_project('candidate-group', parent: nil)
    both = candidate_project('candidate-both')
    nonmember = candidate_project('candidate-nonmember', parent: nil)
    membership(direct, user)
    membership(grouped, group)
    membership(both, user)
    membership(both, group)

    warn "DEBUG candidates #{[direct, grouped, both, nonmember].map { |p| [p.id, p.parent_id, p.status, p.lft, p.rgt, p.is_public, Member.where(project_id: p.id).pluck(:user_id)] }.inspect} root=#{[root.lft, root.rgt, root.reload.lft, root.rgt].inspect} tree=#{root.self_and_descendants.pluck(:id).inspect} visible=#{Project.visible(user).pluck(:id).inspect} active=#{Project.active.pluck(:id).inspect} member=#{candidates.inspect}"

    expect(Member.where(project_id: grouped.id, user_id: user.id)).not_to exist
    expect(candidates).to include(direct.id, grouped.id, both.id)
    expect(candidates.count(both.id)).to eq(1)
    expect(candidates).not_to include(nonmember.id)
    expect(candidates(member_only: false)).to include(direct.id)
    expect(candidates(member_only: false)).not_to include(grouped.id)
  end

  it 'keeps closed, archived, and invisible projects out of candidates for members and admins' do
    active = candidate_project('candidate-active')
    archived = candidate_project('candidate-archived')
    closed = candidate_project('candidate-closed', parent: nil, status: Project::STATUS_CLOSED)
    hidden = candidate_project('candidate-hidden', parent: nil, is_public: false)
    outside = candidate_project('candidate-outside', parent: nil)
    [active, archived, closed, hidden, outside].each { |project| membership(project, group) }
    archived.update_column(:status, Project::STATUS_ARCHIVED)

    warn "DEBUG second #{[active, archived, closed, hidden, outside].map { |p| [p.id, p.parent_id, p.status, p.lft, p.rgt, p.is_public, Member.where(project_id: p.id).pluck(:user_id)] }.inspect} tree=#{root.self_and_descendants.pluck(:id).inspect} member=#{candidates.inspect} plain=#{candidates(member_only: false).inspect}"

    expect(candidates).to include(active.id, outside.id)
    expect(candidates).not_to include(archived.id, closed.id, hidden.id)
    expect(candidates(member_only: false)).to include(active.id)
    expect(candidates(member_only: false)).not_to include(outside.id, archived.id, closed.id, hidden.id)

    User.current = User.find(1)
    expect(User.current).to be_admin
    expect(candidates).to include(active.id, outside.id)
    expect(candidates).not_to include(archived.id, closed.id, hidden.id)
    expect(candidates(member_only: false)).not_to include(outside.id, archived.id, closed.id, hidden.id)
  end

  it 'allows visible member projects outside the tree without target Canvas access' do
    in_tree = candidate_project('candidate-in-tree')
    permitted = candidate_project('candidate-permitted', parent: nil)
    denied = candidate_project('candidate-denied', parent: nil)
    permitted.enable_module!(:canvas_gantt)
    denied.enable_module!(:issue_tracking)

    role = Role.find(1)
    role.update!(permissions: role.permissions | [:view_canvas_gantt])
    User.current = User.find(user.id)
    [in_tree, permitted, denied].each do |project|
      Member.create!(project: project, user: user, roles: [role])
    end
    expect(User.current.allowed_to?(:view_canvas_gantt, denied)).to be(false)

    options = controller.send(:filter_option_projects, [], member_projects_only: true).index_by { |option| option[:id] }

    expect(options.fetch(in_tree.id)).to include(selectable: true)
    expect(options.fetch(permitted.id)).to include(selectable: true)
    expect(options.fetch(denied.id)).to include(selectable: true)
    expect(options.fetch(denied.id)).not_to have_key(:disabled_reason)

    allowed_ids = controller.send(:project_scope_policy).allowed_issue_project_ids(mode: 'member_all')
    expect(allowed_ids).to include(root.id, in_tree.id, permitted.id, denied.id)
  end

  it 'uses a bounded number of project queries as candidate count grows' do
    User.current = User.find(1)
    projects = Array.new(4) { |index| candidate_project("candidate-query-#{index}", parent: nil) }
    queries = []
    subscriber = lambda do |_name, _start, _finish, _id, payload|
      queries << payload[:sql] if payload[:sql].match?(/\ASELECT/i) && !payload[:cached]
    end

    ActiveSupport::Notifications.subscribed(subscriber, 'sql.active_record') do
      expect(candidates).to include(*projects.map(&:id))
    end

    project_queries = queries.count { |sql| sql.match?(/\bFROM\s+["`]?projects\b/i) }
    expect(project_queries).to be <= 2
  end
end
