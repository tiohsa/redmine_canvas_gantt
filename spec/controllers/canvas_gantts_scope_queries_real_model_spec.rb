require_relative '../spec_helper'

RSpec.describe CanvasGanttsController, type: :controller do
  fixtures :projects, :users, :roles, :members, :member_roles, :enabled_modules,
           :trackers, :issue_statuses, :issues

  let(:role) { Role.find(1) }

  before do
    User.current = User.find(2)
    controller.instance_variable_set(:@project, Project.find(1))
  end

  after do
    User.current = nil
  end

  def project_record(identifier, parent: nil, is_public: true)
    Project.create!(name: identifier, identifier: identifier, parent: parent, is_public: is_public).tap do |project|
      project.enable_module!(:issue_tracking)
      project.enable_module!(:canvas_gantt)
    end
  end

  def add_member(project, principal)
    Member.create!(project: project, principal: principal, roles: [role])
  end

  def issue_in_project(project, fixture_id:, subject:)
    template = Issue.find(fixture_id)
    project.trackers = [Tracker.find(template.tracker_id)]
    template.copy.tap do |issue|
      issue.project = project
      issue.subject = subject
      issue.parent_issue_id = nil
      issue.save!
    end
  end

  describe 'assignee and tracker candidate queries' do
    it 'uses active and locked project members, excludes historical nonmembers and builtin groups, and unions memberships' do
      first_project = project_record('canvas-candidate-first', parent: Project.find(1))
      second_project = project_record('canvas-candidate-second', parent: Project.find(1))
      active_member = User.find(2)
      locked_member = User.find(3)
      historical_nonmember = User.find(4)
      locked_member.update!(status: User::STATUS_LOCKED)
      group_member = Group.create!(lastname: 'Canvas candidate regular group')
      builtin_group = Group.non_member
      [active_member, locked_member, group_member, builtin_group].each { |principal| add_member(first_project, principal) }
      add_member(second_project, active_member)

      Issue.find(1).update_columns(project_id: first_project.id, assigned_to_id: historical_nonmember.id)

      allow(Setting).to receive(:issue_group_assignment?).and_return(false)
      users_only = controller.send(:filter_option_assignees, [first_project.id, second_project.id]).index_by { |option| option[:id] }
      expect(users_only.keys).to include(nil, active_member.id, locked_member.id)
      expect(users_only.keys).not_to include(historical_nonmember.id, group_member.id, builtin_group.id)
      expect(users_only.fetch(active_member.id)[:project_ids]).to match_array([first_project.id.to_s, second_project.id.to_s])
      expect(users_only.fetch(nil)[:project_ids]).to match_array([first_project.id.to_s, second_project.id.to_s])

      allow(Setting).to receive(:issue_group_assignment?).and_return(true)
      groups_enabled = controller.send(:filter_option_assignees, [first_project.id, second_project.id]).index_by { |option| option[:id] }
      expect(groups_enabled.keys).to include(nil, active_member.id, locked_member.id, group_member.id)
      expect(groups_enabled.keys).not_to include(historical_nonmember.id, builtin_group.id)

      controller.instance_variable_set(
        :@data_payload_budget,
        RedmineCanvasGantt::DataPayloadBudget.new(
          environment: { 'REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS' => '1' }
        )
      )
      allow(Setting).to receive(:issue_group_assignment?).and_return(false)
      expect { controller.send(:filter_option_assignees, [first_project.id, second_project.id]) }
        .to raise_error(RedmineCanvasGantt::DataPayloadBudget::Exceeded) { |error|
          expect(error.resource).to eq('assignees')
          expect(error.limit).to eq(0)
        }
    end

    it 'returns configured unused Trackers and excludes Trackers hidden by Redmine visibility' do
      visible_first = project_record('canvas-tracker-first', parent: Project.find(1))
      visible_second = project_record('canvas-tracker-second', parent: Project.find(1))
      hidden_project = project_record('canvas-tracker-hidden', parent: nil, is_public: false)
      shared_tracker = Tracker.create!(name: 'Canvas configured shared', default_status: IssueStatus.find(1))
      second_only_tracker = Tracker.create!(name: 'Canvas configured second', default_status: IssueStatus.find(1))
      hidden_tracker = Tracker.create!(name: 'Canvas configured private', default_status: IssueStatus.find(1))
      unconfigured_tracker = Tracker.create!(name: 'Canvas not configured', default_status: IssueStatus.find(1))
      visible_first.trackers = [shared_tracker]
      visible_second.trackers = [shared_tracker, second_only_tracker]
      hidden_project.trackers = [hidden_tracker]

      options = controller.send(:filter_option_trackers, [visible_first.id, visible_second.id, hidden_project.id])
        .index_by { |option| option[:id] }

      expect(options.keys).to include(shared_tracker.id, second_only_tracker.id)
      expect(options.keys).not_to include(hidden_tracker.id, unconfigured_tracker.id)
      expect(options.fetch(shared_tracker.id)[:project_ids]).to match_array([visible_first.id.to_s, visible_second.id.to_s])
      expect(options.fetch(second_only_tracker.id)[:project_ids]).to eq([visible_second.id.to_s])
      expect(Issue.where(project_id: [visible_first.id, visible_second.id]).count).to eq(0)
    end
  end

  describe 'targeted operation and relation scope queries' do
    it 'authorizes only visible requested operation IDs in the current project scope' do
      canvas_project = project_record('canvas-operation-scope', parent: Project.find(1))
      outside_project = project_record('canvas-operation-outside', parent: Project.find(1))
      hidden_project = project_record('canvas-operation-hidden', parent: nil, is_public: false)
      outside_project.enable_module!(:issue_tracking)
      visible_issue = Issue.find(1)
      visible_issue.update_columns(project_id: canvas_project.id)
      outside_issue = Issue.find(4)
      hidden_issue = Issue.find(2)
      hidden_issue.update_columns(project_id: hidden_project.id)
      controller.instance_variable_set(:@current_view_scope, { scope_project_ids: [canvas_project.id, hidden_project.id] })

      allow(controller).to receive(:requested_operation_issue_ids).and_return(Set[visible_issue.id])
      expect(controller.send(:ensure_issue_in_operation_scope, visible_issue)).to be(true)

      allow(controller).to receive(:requested_operation_issue_ids).and_return(Set[hidden_issue.id])
      expect(controller).to receive(:render) do |json:, status:|
        expect(status).to eq(:not_found)
        expect(json[:failure]).to include(kind: 'not_found', resource_role: 'scope', resource_type: 'task')
      end
      expect(controller.send(:ensure_issue_in_operation_scope, hidden_issue)).to be(false)

      outside_issue.update_columns(project_id: outside_project.id)
      allow(controller).to receive(:requested_operation_issue_ids).and_return(Set[outside_issue.id])
      expect(controller).to receive(:render) do |json:, status:|
        expect(status).to eq(:not_found)
        expect(json[:failure]).to include(kind: 'not_found', resource_role: 'scope', resource_type: 'task')
      end
      expect(controller.send(:ensure_issue_in_operation_scope, outside_issue)).to be(false)
    end

    it 'returns only relations with two visible scoped endpoints' do
      first_project = project_record('canvas-relation-visible-first', parent: Project.find(1))
      second_project = project_record('canvas-relation-visible-second', parent: Project.find(1))
      hidden_project = project_record('canvas-relation-hidden', parent: nil, is_public: false)
      outside_project = project_record('canvas-relation-outside', parent: Project.find(1))
      visible_from = issue_in_project(first_project, fixture_id: 1, subject: 'Visible relation from')
      visible_to = issue_in_project(first_project, fixture_id: 3, subject: 'Visible relation to')
      hidden_issue = issue_in_project(hidden_project, fixture_id: 2, subject: 'Private relation endpoint')
      out_of_scope_issue = issue_in_project(outside_project, fixture_id: 4, subject: 'Outside relation endpoint')
      controller.instance_variable_set(
        :@current_view_scope,
        { scope_project_ids: [first_project.id, second_project.id, hidden_project.id] }
      )

      internal_relation = IssueRelation.new(issue_from: visible_from, issue_to: visible_to, relation_type: 'precedes', delay: 0)
      internal_relation.save!(validate: false)
      outbound_relation = IssueRelation.new(issue_from: visible_from, issue_to: hidden_issue, relation_type: 'precedes', delay: 0)
      outbound_relation.save!(validate: false)
      inbound_relation = IssueRelation.new(issue_from: hidden_issue, issue_to: visible_to, relation_type: 'precedes', delay: 0)
      inbound_relation.save!(validate: false)
      out_of_scope_relation = IssueRelation.new(issue_from: visible_from, issue_to: out_of_scope_issue, relation_type: 'precedes', delay: 0)
      out_of_scope_relation.save!(validate: false)

      relations = controller.send(:relation_change_scope_relations)

      expect(relations.map { |relation| relation[:id] }).to include(internal_relation.id)
      expect(relations.map { |relation| relation[:id] }).not_to include(
        outbound_relation.id, inbound_relation.id, out_of_scope_relation.id
      )
    end
  end
end
