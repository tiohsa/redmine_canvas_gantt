require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/baseline_task_state'
require_relative '../../../lib/redmine_canvas_gantt/baseline_snapshot'

RSpec.describe RedmineCanvasGantt::BaselineSnapshot do
  it 'returns a copy containing only the supplied visible issue states' do
    snapshot = described_class.new(
      snapshot_id: 'baseline-1', project_id: 1, captured_at: Time.utc(2026, 7, 27),
      captured_by_id: 7, captured_by_name: 'Alice', scope: 'project',
      task_states: [
        RedmineCanvasGantt::BaselineTaskState.new(issue_id: 10, baseline_start_date: Date.new(2026, 7, 1), baseline_due_date: Date.new(2026, 7, 2)),
        RedmineCanvasGantt::BaselineTaskState.new(issue_id: 11, baseline_start_date: Date.new(2026, 7, 3), baseline_due_date: Date.new(2026, 7, 4))
      ]
    )

    visible_snapshot = snapshot.with_task_states([11])

    expect(visible_snapshot.to_payload_hash[:tasks_by_issue_id].keys).to eq(['11'])
    expect(snapshot.to_payload_hash[:tasks_by_issue_id].keys).to contain_exactly('10', '11')
  end
end
