require_relative '../../spec_helper'

RSpec.describe RedmineCanvasGantt::DataPayloadBuilder do
  describe '#build' do
    it 'serializes project, membership-derived assignee, and tracker filter options' do
      custom_field_extractor = instance_double(
        RedmineCanvasGantt::CustomFieldExtractor,
        build_project_custom_fields: []
      )
      current_user = instance_double(User)
      builder = described_class.new(custom_field_extractor: custom_field_extractor, current_user: current_user)
      allow(builder).to receive(:build_versions).with([1, 2]).and_return([])
      allow(IssueStatus).to receive(:sorted).and_return([])

      project = instance_double(Project, id: 1, name: 'Root', start_date: nil, due_date: nil)
      child_project = instance_double(Project, id: 2, name: 'Child')
      root_project = instance_double(Project, id: 1, name: 'Root')
      assignee_options = [
        { id: nil, name: nil, project_ids: %w[1 2] },
        { id: 7, name: 'Alice', project_ids: ['1'] },
        { id: 8, name: 'Bob', project_ids: ['2'] }
      ]

      payload = builder.build(
        project: project,
        permissions: { editable: true, viewable: true, baseline_editable: false },
        project_ids: [1, 2],
        issues: [],
        filter_option_projects: [child_project, root_project],
        filter_option_assignees: assignee_options,
        business_calendar: { status: 'ok', revision: 'revision' }
      )

      expect(payload[:filter_options]).to eq(
        projects: [
          { id: 2, name: 'Child' },
          { id: 1, name: 'Root' }
        ],
        assignees: assignee_options,
        trackers: []
      )
      expect(payload[:businessCalendar]).to eq(status: 'ok', revision: 'revision')
    end

    it 'builds tracker candidates from the project configuration set' do
      custom_field_extractor = instance_double(
        RedmineCanvasGantt::CustomFieldExtractor,
        build_project_custom_fields: []
      )
      builder = described_class.new(custom_field_extractor: custom_field_extractor, current_user: instance_double(User))
      allow(builder).to receive(:build_versions).with([1, 2]).and_return([])
      allow(IssueStatus).to receive(:sorted).and_return([])

      candidates = [
        { id: 3, name: 'Bug', project_ids: ['1'] },
        { id: 4, name: 'Feature', project_ids: ['2'] },
        { id: 3, name: 'Bug', project_ids: ['2'] }
      ]

      payload = builder.build(
        project: instance_double(Project, id: 1, name: 'Root', start_date: nil, due_date: nil),
        permissions: {},
        project_ids: [1, 2],
        issues: [],
        filter_option_projects: [],
        filter_option_assignees: [],
        filter_option_trackers: candidates
      )

      expect(payload[:filter_options][:trackers]).to eq([
        { id: 3, name: 'Bug', project_ids: %w[1 2] },
        { id: 4, name: 'Feature', project_ids: ['2'] }
      ])
    end

    it 'preserves the controller project_ids for a Tracker enabled on multiple projects' do
      builder = described_class.new(
        custom_field_extractor: instance_double(
          RedmineCanvasGantt::CustomFieldExtractor,
          build_project_custom_fields: []
        ),
        current_user: instance_double(User)
      )
      allow(builder).to receive(:build_versions).with([1, 2]).and_return([])
      allow(IssueStatus).to receive(:sorted).and_return([])
      controller_tracker_options = [
        { id: 3, name: 'Bug', project_ids: %w[1 2] },
        { id: 4, name: 'Feature', project_ids: ['2'] }
      ]

      payload = builder.build(
        project: instance_double(Project, id: 1, name: 'Root', start_date: nil, due_date: nil),
        permissions: {},
        project_ids: [1, 2],
        issues: [],
        filter_option_projects: [],
        filter_option_assignees: [],
        filter_option_trackers: controller_tracker_options
      )

      expect(payload.dig(:filter_options, :trackers)).to eq([
        { id: 3, name: 'Bug', project_ids: %w[1 2] },
        { id: 4, name: 'Feature', project_ids: ['2'] }
      ])
    end

    it 'retains compatibility with a single project_id Tracker candidate' do
      builder = described_class.new(
        custom_field_extractor: instance_double(
          RedmineCanvasGantt::CustomFieldExtractor,
          build_project_custom_fields: []
        ),
        current_user: instance_double(User)
      )
      allow(builder).to receive(:build_versions).with([1]).and_return([])
      allow(IssueStatus).to receive(:sorted).and_return([])

      payload = builder.build(
        project: instance_double(Project, id: 1, name: 'Root', start_date: nil, due_date: nil),
        permissions: {},
        project_ids: [1],
        issues: [],
        filter_option_projects: [],
        filter_option_assignees: [],
        filter_option_trackers: [{ id: 3, name: 'Bug', project_id: 1 }]
      )

      expect(payload.dig(:filter_options, :trackers)).to eq([
        { id: 3, name: 'Bug', project_ids: ['1'] }
      ])
    end
  end

  describe '#build_versions' do
    it 'uses each effective Project shared_versions scope and keeps owner project metadata' do
      shared_versions_a = double('shared versions for effective project A')
      shared_versions_b = double('shared versions for effective project B')
      combined_shared_versions = double('shared version union')
      shared_version_ids = double('shared version ID subquery')
      visible_scope = double('visible versions')
      candidate_scope = double('visible shared versions')
      shared_version = double(
        'shared version', id: 30, name: 'Shared', effective_date: nil,
        start_date: nil, completed_percent: 0, project_id: 99, status: 'open'
      )
      project_a = double('effective project A', shared_versions: shared_versions_a)
      project_b = double('effective project B', shared_versions: shared_versions_b)
      budget = instance_double(RedmineCanvasGantt::DataPayloadBudget, collection_limit: 10)
      builder = described_class.new(
        custom_field_extractor: instance_double(RedmineCanvasGantt::CustomFieldExtractor),
        current_user: instance_double(User),
        data_payload_budget: budget
      )

      allow(Project).to receive(:where).with(id: [1, 2]).and_return([project_a, project_b])
      allow(shared_versions_a).to receive(:or).with(shared_versions_b).and_return(combined_shared_versions)
      allow(combined_shared_versions).to receive(:select).with(:id).and_return(shared_version_ids)
      allow(Version).to receive(:visible).and_return(visible_scope)
      allow(visible_scope).to receive(:where).with(id: shared_version_ids).and_return(candidate_scope)
      expect(budget).to receive(:load_records).with(candidate_scope, resource: 'versions', limit: 10)
        .and_return([shared_version])

      expect(builder.build_versions([1, 2])).to eq([
        {
          id: 30, name: 'Shared', effective_date: nil, start_date: nil,
          completed_percent: 0, project_id: 99, status: 'open'
        }
      ])
    end
  end

  describe '#build_relations' do
    it 'returns only relations where both endpoints are visible' do
      builder = described_class.new(
        custom_field_extractor: instance_double(RedmineCanvasGantt::CustomFieldExtractor),
        current_user: instance_double(User)
      )

      visible_relation = instance_double(IssueRelation, issue_from_id: 1, issue_to_id: 2, id: 10, relation_type: 'precedes', delay: 0)
      hidden_relation = instance_double(IssueRelation, issue_from_id: 1, issue_to_id: 99, id: 11, relation_type: 'precedes', delay: 1)
      issue_a = instance_double(Issue, id: 1, relations: [visible_relation, hidden_relation])
      issue_b = instance_double(Issue, id: 2, relations: [visible_relation])

      expect(builder.build_relations([issue_a, issue_b])).to eq([
        { id: 10, from: 1, to: 2, type: 'precedes', delay: 0 }
      ])
    end

    it 'serializes an explicitly bounded relation collection without touching issue associations' do
      builder = described_class.new(
        custom_field_extractor: instance_double(RedmineCanvasGantt::CustomFieldExtractor),
        current_user: instance_double(User)
      )
      relation = instance_double(
        IssueRelation,
        issue_from_id: 1,
        issue_to_id: 2,
        id: 10,
        relation_type: 'precedes',
        delay: 0
      )

      expect(builder.build_relations_from([relation])).to eq([
        { id: 10, from: 1, to: 2, type: 'precedes', delay: 0 }
      ])
    end
  end

  describe '#build_tasks' do
    it 'keeps can_log_time permission work constant for 100 and 500 issues in one project' do
      current_user = instance_double(User)
      extractor = instance_double(RedmineCanvasGantt::CustomFieldExtractor, build_task_custom_field_values: {})
      builder = described_class.new(
        custom_field_extractor: extractor,
        current_user: current_user
      )

      project1 = instance_double(Project, id: 1, name: 'Project 1')
      project2 = instance_double(Project, id: 2, name: 'Project 2')

      allow(current_user).to receive(:allowed_to?).with(:log_time, project1).and_return(true)
      allow(current_user).to receive(:allowed_to?).with(:log_time, project2).and_return(false)
      allow(current_user).to receive(:allowed_to?).with(:edit_issues, any_args).and_return(true)

      now = Time.now
      issue1 = instance_double(
        Issue,
        id: 101,
        subject: 'Task 1',
        start_date: nil,
        due_date: nil,
        done_ratio: 0,
        status_id: 1,
        status: instance_double(IssueStatus, name: 'New', is_closed: false),
        lock_version: 1,
        project: project1,
        project_id: 1,
        tracker_id: 1,
        tracker: instance_double(Tracker, name: 'Bug'),
        priority_id: 1,
        priority: instance_double(IssuePriority, name: 'Normal', position: 1),
        assigned_to_id: nil,
        assigned_to: nil,
        author_id: 1,
        author: instance_double(User, name: 'Admin'),
        fixed_version_id: nil,
        fixed_version: nil,
        category_id: nil,
        category: nil,
        estimated_hours: nil,
        spent_hours: 0.0,
        created_on: now,
        updated_on: now,
        parent_id: nil,
        custom_field_values: [],
        rgt: 2,
        lft: 1,
        editable?: true
      )

      issue2 = instance_double(
        Issue,
        id: 102,
        subject: 'Task 2',
        start_date: nil,
        due_date: nil,
        done_ratio: 0,
        status_id: 1,
        status: instance_double(IssueStatus, name: 'New', is_closed: false),
        lock_version: 1,
        project: project2,
        project_id: 2,
        tracker_id: 1,
        tracker: instance_double(Tracker, name: 'Bug'),
        priority_id: 1,
        priority: instance_double(IssuePriority, name: 'Normal', position: 1),
        assigned_to_id: nil,
        assigned_to: nil,
        author_id: 1,
        author: instance_double(User, name: 'Admin'),
        fixed_version_id: nil,
        fixed_version: nil,
        category_id: nil,
        category: nil,
        estimated_hours: nil,
        spent_hours: 0.0,
        created_on: now,
        updated_on: now,
        parent_id: nil,
        custom_field_values: [],
        rgt: 4,
        lft: 3,
        editable?: true
      )

      allow(RedmineCanvasGantt::SpentHoursBatch).to receive(:for)
        .with(anything, current_user: current_user).and_return(101 => 2.5)

      tasks_100 = builder.build_tasks(Array.new(100, issue1))
      tasks_500 = builder.build_tasks(Array.new(500, issue1))

      expect(tasks_100.first[:can_log_time]).to eq(true)
      expect(tasks_100.first[:spent_hours]).to eq(2.5)
      expect(tasks_500.last[:can_log_time]).to eq(true)
      expect(current_user).to have_received(:allowed_to?).with(:log_time, project1).twice
      expect(tasks_100.first[:has_physical_children]).to eq(false)

      # The payload contains only the parent; its physical child is filtered out.
      allow(issue1).to receive(:rgt).and_return(4)
      expect(issue1).not_to receive(:children)
      expect(builder.build_tasks([issue1]).first[:has_physical_children]).to eq(true)
      expect(builder.build_task_state(issue1)).to include(has_physical_children: true)
      expect(builder.build_task_state(issue1)).not_to have_key(:display_order)
      expect(builder.build_task_state(issue1)).not_to have_key(:has_children)
    end
  end
end
