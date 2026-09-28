require_relative '../spec_helper'

RSpec.describe CanvasGanttsController, type: :controller do
  fixtures :projects, :users, :roles, :members, :member_roles, :enabled_modules

  let(:user) { User.find(2) }
  let(:root) { Project.find(1) }
  let(:group) { Group.create!(lastname: 'Canvas candidate group') }

  before do
    User.current = user
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

  def candidates(projects, member_only: true)
    controller.send(:filter_option_projects, projects.map(&:id), member_projects_only: member_only).map(&:id)
  end

  it 'includes direct and group-only memberships once, excluding nonmembers' do
    direct = candidate_project('candidate-direct')
    grouped = candidate_project('candidate-group')
    both = candidate_project('candidate-both')
    nonmember = candidate_project('candidate-nonmember')
    membership(direct, user)
    membership(grouped, group)
    membership(both, user)
    membership(both, group)

    expect(Member.where(project_id: grouped.id, user_id: user.id)).not_to exist
    expect(candidates([direct, grouped, both, nonmember])).to contain_exactly(direct.id, grouped.id, both.id)
  end

  it 'returns an empty candidate result when only nonmember projects are visible' do
    nonmember = candidate_project('candidate-empty')

    expect(candidates([nonmember])).to eq([])
    expect(candidates([nonmember], member_only: false)).to eq([nonmember.id])
  end

  it 'includes group membership established through Redmine role inheritance' do
    project = candidate_project('candidate-inherited')
    Member.create!(project: project, principal: group, roles: [Role.find(1)])

    expect(candidates([project])).to eq([project.id])
  end

  it 'preserves active, visible, and supplied project tree boundaries for group members' do
    included = candidate_project('candidate-included')
    archived = candidate_project('candidate-archived')
    hidden = candidate_project('candidate-hidden', is_public: false)
    outside = candidate_project('candidate-outside', parent: nil)
    [included, archived, hidden, outside].each { |project| membership(project, group) }
    archived.update_column(:status, Project::STATUS_ARCHIVED)

    expect(Project.visible.where(id: hidden.id)).not_to exist
    expect(candidates([included, archived, hidden])).to eq([included.id])
  end

  it 'returns all active visible projects in the supplied tree for administrators' do
    User.current = User.find(1)
    included = candidate_project('candidate-admin')
    archived = candidate_project('candidate-admin-archived')
    outside = candidate_project('candidate-admin-outside', parent: nil)
    archived.update_column(:status, Project::STATUS_ARCHIVED)

    expect(User.current).to be_admin
    expect(candidates([included, archived])).to eq([included.id])
    expect(candidates([included, archived])).not_to include(outside.id)
  end

  it 'loads group candidates in one project query without per-project membership queries' do
    projects = Array.new(3) { |index| candidate_project("candidate-query-#{index}") }
    projects.each { |project| membership(project, group) }
    controller.send(:member_candidate_ids)
    Project.visible.to_sql # Warm Redmine's permission caches before counting.
    queries = []
    subscriber = lambda do |_name, _start, _finish, _id, payload|
      queries << payload[:sql] if payload[:sql].match?(/\ASELECT/i) && !payload[:cached]
    end

    ActiveSupport::Notifications.subscribed(subscriber, 'sql.active_record') do
      expect(candidates(projects)).to match_array(projects.map(&:id))
    end

    expect(queries.size).to eq(1)
  end

  it 'accepts the collection limit and raises the existing error when group candidates exceed it' do
    projects = Array.new(3) { |index| candidate_project("candidate-budget-#{index}") }
    projects.each { |project| membership(project, group) }
    budget = RedmineCanvasGantt::DataPayloadBudget.new(
      environment: { 'REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS' => '2' }
    )
    allow(controller).to receive(:data_payload_budget).and_return(budget)

    expect(candidates(projects.take(2))).to match_array(projects.take(2).map(&:id))
    expect { candidates(projects) }.to raise_error(RedmineCanvasGantt::DataPayloadBudget::Exceeded) { |error|
      expect([error.resource, error.limit, error.actual]).to eq(['projects', 2, 3])
    }
  end
end
