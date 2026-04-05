require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/bulk_subtask_creator'

RSpec.describe RedmineCanvasGantt::BulkSubtaskCreator do
  describe '#call' do
    it 'creates subtasks and reports empty subjects as errors' do
      parent_project = instance_double(Project, id: 2)
      parent_issue = instance_double(
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
      created_issue = instance_double(Issue, id: 501, parent_id: 99, errors: double(full_messages: []))
      allow(created_issue).to receive(:author=)
      allow(created_issue).to receive(:safe_attributes=)
      allow(created_issue).to receive(:parent_issue_id=)
      allow(created_issue).to receive(:save).and_return(true)
      allow(Issue).to receive(:new).and_return(created_issue)

      creator = described_class.new(current_user: User.current)
      result = creator.call(parent_issue: parent_issue, subjects: ['Task A', ''])

      expect(result[:success_count]).to eq(1)
      expect(result[:fail_count]).to eq(1)
      expect(result[:results].map { |entry| entry[:status] }).to eq(%w[ok error])
      expect(result[:results][1][:errors]).to eq([I18n.t(:"canvas_gantt.error_canvas_gantt_subject_blank")])
    end
  end
end
