require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/mutation_authorization_policy'

RSpec.describe RedmineCanvasGantt::MutationAuthorizationPolicy do
  let(:user) { instance_double(User) }
  let(:project) { instance_double(Project) }
  let(:issue) { instance_double(Issue, project: project) }
  subject(:policy) { described_class.new(current_user: user) }

  describe '#can_edit_issue?' do
    it 'combines the project permission with the issue editability rule' do
      allow(user).to receive(:allowed_to?).with(:edit_issues, project).and_return(true)
      allow(issue).to receive(:editable?).and_return(true)

      expect(policy.can_edit_issue?(issue)).to be(true)
    end

    it 'does not inspect the issue when the project permission is missing' do
      allow(user).to receive(:allowed_to?).with(:edit_issues, project).and_return(false)
      expect(issue).not_to receive(:editable?)

      expect(policy.can_edit_issue?(issue)).to be(false)
    end
  end

  describe '#can_create_subtask?' do
    it 'requires both issue creation and subtask management permissions' do
      allow(user).to receive(:allowed_to?).with(:add_issues, project).and_return(true)
      allow(user).to receive(:allowed_to?).with(:manage_subtasks, project).and_return(true)

      expect(policy.can_create_subtask?(issue)).to be(true)
    end

    it 'rejects subtask creation without issue creation permission' do
      allow(user).to receive(:allowed_to?).with(:add_issues, project).and_return(false)
      allow(user).to receive(:allowed_to?).with(:manage_subtasks, project).and_return(true)

      expect(policy.can_create_subtask?(issue)).to be(false)
    end

    it 'rejects subtask creation without subtask management permission' do
      allow(user).to receive(:allowed_to?).with(:add_issues, project).and_return(true)
      allow(user).to receive(:allowed_to?).with(:manage_subtasks, project).and_return(false)

      expect(policy.can_create_subtask?(issue)).to be(false)
    end
  end

  describe '#can_delete_issue?' do
    it 'requires Redmine delete permission and issue deletability' do
      allow(user).to receive(:allowed_to?).with(:delete_issues, project).and_return(true)
      allow(issue).to receive(:deletable?).and_return(true)

      expect(policy.can_delete_issue?(issue)).to be(true)
    end

    it 'rejects deletion when the issue is not deletable' do
      allow(user).to receive(:allowed_to?).with(:delete_issues, project).and_return(true)
      allow(issue).to receive(:deletable?).and_return(false)

      expect(policy.can_delete_issue?(issue)).to be(false)
    end
  end
end
