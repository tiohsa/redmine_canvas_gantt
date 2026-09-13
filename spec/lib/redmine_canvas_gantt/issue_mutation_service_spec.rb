require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/issue_mutation_service'

RSpec.describe RedmineCanvasGantt::IssueMutationService do
  let(:evaluator) { instance_double(RedmineCanvasGantt::IssueDraftEvaluator) }
  let(:service) { described_class.new(draft_evaluator: evaluator) }
  let(:issue) { instance_double(Issue, parent_id: 4) }
  let(:intent) { { subject: 'Updated' } }
  let(:valid_evaluation) { instance_double(RedmineCanvasGantt::IssueDraftEvaluator::Result, valid?: true) }
  let(:invalid_evaluation) { instance_double(RedmineCanvasGantt::IssueDraftEvaluator::Result, valid?: false) }

  describe '#update' do
    it 'returns the evaluator result without saving an invalid intent' do
      allow(evaluator).to receive(:evaluate).and_return(invalid_evaluation)
      expect(issue).not_to receive(:save)

      result = service.update(
        issue: issue,
        intent: intent,
        parent_issue_id_provided: false,
        requested_parent_issue_id: nil
      )

      expect(result.status).to eq(:invalid)
      expect(result.evaluation).to eq(invalid_evaluation)
    end

    it 'returns model errors when persistence fails' do
      allow(evaluator).to receive(:evaluate).and_return(valid_evaluation)
      allow(issue).to receive(:save).and_return(false)
      allow(issue).to receive(:errors).and_return(instance_double(ActiveModel::Errors, full_messages: ['Subject is invalid']))

      result = service.update(
        issue: issue,
        intent: intent,
        parent_issue_id_provided: false,
        requested_parent_issue_id: nil
      )

      expect(result.status).to eq(:save_failed)
      expect(result.errors).to eq(['Subject is invalid'])
    end

    it 'reports a failed parent linkage after a successful save' do
      allow(evaluator).to receive(:evaluate).and_return(valid_evaluation)
      allow(issue).to receive(:save).and_return(true)
      allow(issue).to receive(:parent_id).and_return(4)

      result = service.update(
        issue: issue,
        intent: intent,
        parent_issue_id_provided: true,
        requested_parent_issue_id: 9
      )

      expect(result.status).to eq(:parent_linkage_failed)
      expect(result.previous_parent_id).to eq(4)
    end

    it 'returns the persisted issue and previous parent for a successful update' do
      allow(evaluator).to receive(:evaluate).and_return(valid_evaluation)
      allow(issue).to receive(:save).and_return(true)
      allow(issue).to receive(:parent_id).and_return(4, 9)

      result = service.update(
        issue: issue,
        intent: intent,
        parent_issue_id_provided: true,
        requested_parent_issue_id: 9
      )

      expect(result.status).to eq(:ok)
      expect(result.issue).to eq(issue)
      expect(result.previous_parent_id).to eq(4)
    end
  end

  describe '#destroy' do
    it 'destroys the issue and returns its previous parent' do
      expect(issue).to receive(:destroy)

      result = service.destroy(issue: issue)

      expect(result.issue).to eq(issue)
      expect(result.parent_id).to eq(4)
    end
  end
end
