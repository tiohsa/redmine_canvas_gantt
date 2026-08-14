require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/edit_meta_payload_builder'

RSpec.describe RedmineCanvasGantt::EditMetaPayloadBuilder do
  it 'intersects Issue domain project candidates with the Canvas scope' do
    current_user = instance_double(User)
    builder = described_class.new(current_user: current_user)
    candidate = instance_double(Project, id: 20, name: 'Domain candidate')
    issue = double('Issue domain candidate source')
    allow(issue).to receive(:allowed_target_projects).with(current_user).and_return([candidate])
    visible_scope = double(active: double(where: [candidate]))
    allow(Project).to receive(:visible).and_return(visible_scope)

    expect(builder.send(:project_options_for, issue, [20, 99])).to eq(
      [{ id: 20, name: 'Domain candidate' }]
    )
  end

  it 'does not reinterpret a runtime ArgumentError as an older candidate signature' do
    current_user = instance_double(User)
    builder = described_class.new(current_user: current_user)
    issue = double('Issue domain candidate source')
    expect(issue).to receive(:allowed_target_projects).with(current_user).and_raise(ArgumentError, 'domain failure')
    expect(issue).not_to receive(:allowed_target_projects).with(no_args)
    visible_scope = double(active: double(where: []))
    allow(Project).to receive(:visible).and_return(visible_scope)

    expect {
      builder.send(:project_options_for, issue, [20])
    }.to raise_error(ArgumentError, 'domain failure')
  end

  it 'preserves persisted source and destination project candidates after a draft move' do
    current_user = instance_double(User)
    builder = described_class.new(current_user: current_user)
    source_project = instance_double(Project, id: 10, name: 'Source without add_issues')
    destination_project = instance_double(Project, id: 20, name: 'Destination')
    persisted_source_issue = double('Persisted source issue')
    draft_destination_issue = double('Effective draft issue')
    allow(persisted_source_issue).to receive(:allowed_target_projects).with(current_user).and_return(
      [source_project, destination_project]
    )
    expect(draft_destination_issue).not_to receive(:allowed_target_projects)
    visible_scope = double(active: double(where: [source_project, destination_project]))
    allow(Project).to receive(:visible).and_return(visible_scope)

    expect(
      builder.resolved_project_options(issue: persisted_source_issue, project_scope_ids: [10, 20])
    ).to eq([
      { id: 10, name: 'Source without add_issues' },
      { id: 20, name: 'Destination' }
    ])
  end

  describe '#build' do
    it 'builds the edit meta payload shape expected by the frontend' do
      current_user = instance_double(User)
      builder = described_class.new(current_user: current_user)

      status = instance_double(IssueStatus, id: 2, name: 'In Progress', position: 2)
      current_status = instance_double(IssueStatus, id: 1, name: 'Open', position: 1)
      assignable_user = instance_double(User, id: 7, name: 'Alice')
      priority = instance_double(IssuePriority, id: 3, name: 'High', position: 3)
      visible_project = instance_double(Project, id: 20, name: 'Visible Project')
      category = instance_double(IssueCategory, id: 4, name: 'Backend')
      tracker = instance_double(Tracker, id: 5, name: 'Bug')
      project = instance_double(Project, id: 1, issue_categories: [category], trackers: [tracker])
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
        assigned_to: nil,
        project: project,
        project_id: 1
      )

      allow(issue).to receive(:new_statuses_allowed_to).with(current_user).and_return([status])
      allow(issue).to receive(:assignable_users).and_return([assignable_user])
      allow(issue).to receive(:allowed_target_trackers).with(current_user).and_return([tracker])
      allow(issue).to receive(:assignable_versions).and_return([instance_double(Version, id: 6, name: 'v1')])

      allow(IssuePriority).to receive(:active).and_return([priority])
      project_scope = double(active: double(where: [visible_project]))
      allow(Project).to receive(:allowed_to).with(:add_issues).and_return(project_scope)
      payload = builder.build(
        issue: issue,
        editable: { subject: true },
        custom_fields: [{ id: 99 }],
        custom_field_values: { '99' => 'abc' },
        permissions: { editable: true, viewable: true },
        project_scope_ids: [20]
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
      expect(payload[:capability_context]).to eq(
        task_id: 10,
        project_id: 1,
        tracker_id: 5,
        status_id: 12
      )
      expect(payload[:options][:statuses]).to eq([{ id: 1, name: 'Open' }, { id: 2, name: 'In Progress' }])
      expect(payload[:options][:assignees]).to eq([{ id: 7, name: 'Alice' }])
      expect(payload[:options][:custom_fields]).to eq([{ id: 99 }])
      expect(payload[:options][:projects]).to eq([{ id: 20, name: 'Visible Project' }])
      expect(payload[:options][:versions]).to eq([{ id: 6, name: 'v1' }])
    end

    it 'uses the requested options project for project-dependent choices' do
      current_user = instance_double(User)
      builder = described_class.new(current_user: current_user)

      status = instance_double(IssueStatus, id: 1, name: 'Open', position: 1)
      source_project = instance_double(Project, id: 1, issue_categories: [], trackers: [], assignable_users: [])
      destination_category = instance_double(IssueCategory, id: 40, name: 'Destination category')
      destination_tracker = instance_double(Tracker, id: 30, name: 'Destination tracker')
      destination_assignee = instance_double(User, id: 20, name: 'Destination assignee')
      destination_project = instance_double(
        Project,
        id: 3,
        issue_categories: [destination_category],
        trackers: [destination_tracker],
        assignable_users: [destination_assignee]
      )
      issue = instance_double(
        Issue,
        id: 10,
        subject: 'Move issue',
        assigned_to_id: 11,
        status_id: 1,
        done_ratio: 0,
        due_date: nil,
        start_date: nil,
        priority_id: 1,
        category_id: nil,
        estimated_hours: nil,
        tracker_id: 5,
        fixed_version_id: nil,
        lock_version: 1,
        status: status,
        assigned_to: nil,
        project: source_project,
        project_id: 1
      )

      allow(issue).to receive(:new_statuses_allowed_to).with(current_user).and_return([])
      allow(issue).to receive(:assignable_users).and_return([])
      allow(issue).to receive(:allowed_target_trackers).with(current_user).and_return([])
      allow(issue).to receive(:assignable_versions).and_return([])
      allow(IssuePriority).to receive(:active).and_return([])
      project_scope = double(active: double(where: []))
      allow(Project).to receive(:allowed_to).with(:add_issues).and_return(project_scope)
      capability_issue = instance_double(
        Issue,
        project: destination_project,
        project_id: 3,
        tracker_id: 30,
        status_id: 1,
        status: status,
        assigned_to: nil,
        new_statuses_allowed_to: [],
        assignable_users: [destination_assignee],
        allowed_target_trackers: [destination_tracker],
        assignable_versions: [instance_double(Version, id: 30, name: 'Destination version')]
      )

      payload = builder.build(
        issue: issue,
        editable: { subject: true },
        custom_fields: [],
        custom_field_values: {},
        permissions: { editable: true, viewable: true },
        project_scope_ids: [3],
        capability_issue: capability_issue
      )

      expect(payload[:options][:trackers]).to eq([{ id: 30, name: 'Destination tracker' }])
      expect(payload[:options][:assignees]).to eq([{ id: 20, name: 'Destination assignee' }])
      expect(payload[:options][:categories]).to eq([{ id: 40, name: 'Destination category' }])
      expect(payload[:options][:versions]).to eq([{ id: 30, name: 'Destination version' }])
    end

    it 'keeps the current assignee in issue-project options even when no longer assignable' do
      current_user = instance_double(User)
      builder = described_class.new(current_user: current_user)

      status = instance_double(IssueStatus, id: 1, name: 'Open', position: 1)
      current_assignee = instance_double(User, id: 11, name: 'Former Member')
      assignable_user = instance_double(User, id: 7, name: 'Alice')
      project = instance_double(Project, id: 1, issue_categories: [], trackers: [])
      issue = instance_double(
        Issue,
        id: 10,
        subject: 'Unassign former member',
        assigned_to_id: 11,
        assigned_to: current_assignee,
        status_id: 1,
        done_ratio: 0,
        due_date: nil,
        start_date: nil,
        priority_id: 1,
        category_id: nil,
        estimated_hours: nil,
        tracker_id: 5,
        fixed_version_id: nil,
        lock_version: 1,
        status: status,
        project: project,
        project_id: 1
      )

      allow(issue).to receive(:new_statuses_allowed_to).with(current_user).and_return([])
      allow(issue).to receive(:assignable_users).and_return([assignable_user])
      allow(issue).to receive(:allowed_target_trackers).with(current_user).and_return([])
      allow(issue).to receive(:assignable_versions).and_return([])
      allow(IssuePriority).to receive(:active).and_return([])
      project_scope = double(active: double(where: []))
      allow(Project).to receive(:allowed_to).with(:add_issues).and_return(project_scope)
      payload = builder.build(
        issue: issue,
        editable: { assigned_to_id: true },
        custom_fields: [],
        custom_field_values: {},
        permissions: { editable: true, viewable: true },
        project_scope_ids: [1]
      )

      expect(payload[:options][:assignees]).to eq([
        { id: 7, name: 'Alice' },
        { id: 11, name: 'Former Member' }
      ])
    end
  end
end
