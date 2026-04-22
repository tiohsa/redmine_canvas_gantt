require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/edit_meta_payload_builder'

RSpec.describe RedmineCanvasGantt::EditMetaPayloadBuilder do
  describe '#build' do
    it 'builds the edit meta payload shape expected by the frontend' do
      current_user = instance_double(User)
      builder = described_class.new(current_user: current_user)

      status = instance_double(IssueStatus, id: 2, name: 'In Progress', position: 2)
      current_status = instance_double(IssueStatus, id: 1, name: 'Open', position: 1)
      assignable_user = instance_double(User, id: 7, name: 'Alice')
      priority = instance_double(IssuePriority, id: 3, name: 'High')
      visible_project = instance_double(Project, id: 20, name: 'Visible Project')
      category = instance_double(IssueCategory, id: 4, name: 'Backend')
      tracker = instance_double(Tracker, id: 5, name: 'Bug')
      project = instance_double(Project, issue_categories: [category], trackers: [tracker])
      issue = instance_double(
        Issue,
        id: 10,
        subject: 'Fix bug',
        assigned_to_id: 11,
        status_id: 12,
        done_ratio: 34,
        due_date: Date.new(2026, 1, 1),
        start_date: Date.new(2025, 12, 1),
        priority_id: 3,
        category_id: 4,
        estimated_hours: 12.5,
        tracker_id: 5,
        fixed_version_id: 6,
        lock_version: 9,
        status: current_status,
        project: project,
        project_id: 1
      )

      allow(issue).to receive(:new_statuses_allowed_to).with(current_user).and_return([status])
      allow(issue).to receive(:assignable_users).and_return([assignable_user])

      allow(IssuePriority).to receive(:active).and_return([priority])
      project_scope = double(active: double(where: [visible_project]))
      allow(Project).to receive(:allowed_to).with(:add_issues).and_return(project_scope)
      version_scope = double(where: [instance_double(Version, id: 6, name: 'v1')])
      allow(Version).to receive(:visible).and_return(version_scope)

      payload = builder.build(
        issue: issue,
        editable: { subject: true },
        custom_fields: [{ id: 99 }],
        custom_field_values: { '99' => 'abc' },
        permissions: { editable: true, viewable: true },
        visible_project_ids: [20]
      )

      expect(payload).to include(
        editable: { subject: true },
        custom_field_values: { '99' => 'abc' },
        permissions: { editable: true, viewable: true }
      )
      expect(payload[:task]).to include(
        id: 10,
        subject: 'Fix bug',
        status_id: 12,
        start_date: Date.new(2025, 12, 1),
        priority_id: 3,
        category_id: 4,
        estimated_hours: 12.5,
        project_id: 1,
        tracker_id: 5,
        fixed_version_id: 6,
        lock_version: 9
      )
      expect(payload[:options][:statuses]).to eq([{ id: 1, name: 'Open' }, { id: 2, name: 'In Progress' }])
      expect(payload[:options][:assignees]).to eq([{ id: 7, name: 'Alice' }])
      expect(payload[:options][:custom_fields]).to eq([{ id: 99 }])
      expect(payload[:options][:projects]).to eq([{ id: 20, name: 'Visible Project' }])
      expect(payload[:options][:versions]).to eq([{ id: 6, name: 'v1' }])
    end
  end
end
