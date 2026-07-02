require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/relation_change_validator'

RSpec.describe RedmineCanvasGantt::RelationChangeValidator do
  let(:error_renderer) { instance_double(Proc, call: true) }

  describe '#validate!' do
    it 'skips Sunday when validating relation delay with internal non-working weekdays' do
      issue_from = instance_double(Issue, due_date: Date.new(2026, 1, 2), start_date: nil)
      issue_to = instance_double(Issue, due_date: nil, start_date: Date.new(2026, 1, 5))
      validator = described_class.new(non_working_week_days: [0, 6])

      result = validator.validate!(
        issue_from: issue_from,
        issue_to: issue_to,
        relation_type: 'precedes',
        delay: 0,
        existing_relations: [],
        candidate_relation: { id: 1, from: 10, to: 11, type: 'precedes', delay: 0 },
        error_renderer: error_renderer
      )

      expect(result).to be(true)
    end

    it 'rejects relation delays that do not match the current dates' do
      issue_from = instance_double(Issue, due_date: Date.new(2026, 1, 2), start_date: nil)
      issue_to = instance_double(Issue, due_date: nil, start_date: Date.new(2026, 1, 4))
      validator = described_class.new(non_working_week_days: [0, 6])

      result = validator.validate!(
        issue_from: issue_from,
        issue_to: issue_to,
        relation_type: 'precedes',
        delay: 3,
        existing_relations: [],
        candidate_relation: { id: 1, from: 10, to: 11, type: 'precedes', delay: 3 },
        error_renderer: error_renderer
      )

      expect(result).to be(false)
      expect(error_renderer).to have_received(:call).with(:error_canvas_gantt_relation_delay_mismatch)
    end

    it 'rejects relation cycles' do
      issue_from = instance_double(Issue, due_date: nil, start_date: nil)
      issue_to = instance_double(Issue, due_date: nil, start_date: nil)
      constraint_graph_class = class_double(RedmineCanvasGantt::ConstraintGraph)
      graph = instance_double(RedmineCanvasGantt::ConstraintGraph, cyclic?: true)
      allow(constraint_graph_class).to receive(:new).and_return(graph)
      validator = described_class.new(non_working_week_days: [], constraint_graph_class: constraint_graph_class)

      result = validator.validate!(
        issue_from: issue_from,
        issue_to: issue_to,
        relation_type: 'blocks',
        delay: nil,
        existing_relations: [{ id: 12, from: 11, to: 10, type: 'precedes', delay: 0 }],
        candidate_relation: { id: 13, from: 10, to: 11, type: 'blocks', delay: nil },
        error_renderer: error_renderer
      )

      expect(result).to be(false)
      expect(error_renderer).to have_received(:call).with(:error_canvas_gantt_relation_cycle_detected)
    end
  end
end
