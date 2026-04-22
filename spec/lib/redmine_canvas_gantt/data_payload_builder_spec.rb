require_relative '../../spec_helper'

RSpec.describe RedmineCanvasGantt::DataPayloadBuilder do
  describe '#build' do
    it 'builds stable filter options for descendant projects and assignees' do
      custom_field_extractor = instance_double(
        RedmineCanvasGantt::CustomFieldExtractor,
        build_project_custom_fields: []
      )
      current_user = instance_double(User)
      builder = described_class.new(custom_field_extractor: custom_field_extractor, current_user: current_user)
      allow(Version).to receive_message_chain(:visible, :where).and_return([])
      allow(IssueStatus).to receive(:sorted).and_return([])

      project = instance_double(Project, id: 1, name: 'Root', start_date: nil, due_date: nil)
      child_project = instance_double(Project, id: 2, name: 'Child')
      root_project = instance_double(Project, id: 1, name: 'Root')
      alice = instance_double(User, name: 'Alice')
      bob = instance_double(User, name: 'Bob')
      issue_a = instance_double(Issue, assigned_to_id: 7, assigned_to: alice, project_id: 1)
      issue_b = instance_double(Issue, assigned_to_id: 8, assigned_to: bob, project_id: 2)
      issue_c = instance_double(Issue, assigned_to_id: nil, assigned_to: nil, project_id: 2)

      payload = builder.build(
        project: project,
        permissions: { editable: true, viewable: true, baseline_editable: false },
        project_ids: [1, 2],
        issues: [],
        filter_option_projects: [child_project, root_project],
        filter_option_issues: [issue_a, issue_b, issue_c]
      )

      expect(payload[:filter_options]).to eq(
        projects: [
          { id: 2, name: 'Child' },
          { id: 1, name: 'Root' }
        ],
        assignees: [
          { id: nil, name: nil, project_ids: ['2'] },
          { id: 7, name: 'Alice', project_ids: ['1'] },
          { id: 8, name: 'Bob', project_ids: ['2'] }
        ]
      )
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
  end
end
