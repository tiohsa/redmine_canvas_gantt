require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/parent_issue_resolver'

RSpec.describe RedmineCanvasGantt::ParentIssueResolver do
  let(:validation_error_renderer) { instance_double(Proc, call: true) }
  let(:not_found_renderer) { instance_double(Proc, call: true) }
  let(:issue_scope_checker) { instance_double(Proc, call: true) }
  let(:parent_issue) { instance_double(Issue, id: 11, project_id: 1) }
  let(:issue_finder) { double('IssueFinder') }

  describe '#call' do
    it 'rejects self-parenting' do
      source_issue = instance_double(Issue, id: 10, parent_id: nil, descendants: double(exists?: false))
      resolver = described_class.new(issue_finder: issue_finder)
      allow(issue_finder).to receive(:find).with('11').and_return(instance_double(Issue, id: 10, project_id: 1))

      result = resolver.call(
        source_issue: source_issue,
        raw_parent_issue_id: '11',
        issue_scope_checker: issue_scope_checker,
        validation_error_renderer: validation_error_renderer,
        not_found_renderer: not_found_renderer
      )

      expect(result).to eq(:invalid)
      expect(validation_error_renderer).to have_received(:call).with(:error_canvas_gantt_task_cannot_be_child_of_itself)
    end

    it 'returns the parent issue when the hierarchy is valid' do
      source_issue = instance_double(Issue, id: 10, parent_id: nil, descendants: double(exists?: false))
      resolver = described_class.new(issue_finder: issue_finder)
      allow(issue_finder).to receive(:find).with('11').and_return(parent_issue)

      result = resolver.call(
        source_issue: source_issue,
        raw_parent_issue_id: '11',
        issue_scope_checker: issue_scope_checker,
        validation_error_renderer: validation_error_renderer,
        not_found_renderer: not_found_renderer
      )

      expect(result).to eq(parent_issue)
    end
  end
end
