require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/baseline_task_state'
require_relative '../../../lib/redmine_canvas_gantt/baseline_snapshot'
require_relative '../../../lib/redmine_canvas_gantt/baseline_repository'

RSpec.describe RedmineCanvasGantt::BaselineRepository do
  let(:settings_hash) { { 'row_height' => '36' } }
  let(:captured_settings) { [] }
  let(:settings_reader) do
    Class.new do
      def initialize(value, sink)
        @value = value
        @sink = sink
      end

      def plugin_redmine_canvas_gantt
        @value
      end

      def plugin_redmine_canvas_gantt=(value)
        @sink << value
        @value = value
      end
    end.new(settings_hash, captured_settings)
  end

  subject(:repository) { described_class.new(settings_reader: settings_reader) }

  describe '#build_snapshot' do
    it 'captures the current issue dates in a baseline snapshot' do
      project = instance_double(Project, id: 1)
      current_user = instance_double(User, id: 7, name: 'Alice')
      issue = instance_double(Issue, id: 10, start_date: Date.new(2026, 4, 10), due_date: Date.new(2026, 4, 15))

      snapshot = repository.build_snapshot(project: project, issues: [issue], current_user: current_user, snapshot_id: 'baseline-1', captured_at: Time.utc(2026, 4, 1, 12, 0, 0))

      expect(snapshot.snapshot_id).to eq('baseline-1')
      expect(snapshot.project_id).to eq(1)
      expect(snapshot.captured_by_name).to eq('Alice')
      expect(snapshot.scope).to eq('filtered')
      expect(snapshot.task_states_by_issue_id['10'].baseline_due_date).to eq(Date.new(2026, 4, 15))
    end
  end

  describe '#replace' do
    it 'stores the snapshot under the project id key' do
      snapshot = RedmineCanvasGantt::BaselineSnapshot.new(
        snapshot_id: 'baseline-1',
        project_id: 1,
        captured_at: Time.utc(2026, 4, 1, 12, 0, 0),
        captured_by_id: 7,
        captured_by_name: 'Alice',
        scope: 'project',
        task_states: [
          RedmineCanvasGantt::BaselineTaskState.new(
            issue_id: 10,
            baseline_start_date: Date.new(2026, 4, 10),
            baseline_due_date: Date.new(2026, 4, 15)
          )
        ]
      )

      repository.replace(project_id: 1, snapshot: snapshot)

      expect(captured_settings).not_to be_empty
      persisted = captured_settings.last
      expect(persisted['baseline_snapshots']['1']).to eq(snapshot.to_storage_hash)
    end
  end

  describe '#load' do
    it 'returns a snapshot and skips malformed task states' do
      settings_hash['baseline_snapshots'] = {
        '1' => {
          'snapshot_id' => 'baseline-1',
          'project_id' => 1,
          'captured_at' => '2026-04-01T12:00:00Z',
          'captured_by_id' => 7,
          'captured_by_name' => 'Alice',
          'scope' => 'project',
          'task_states' => [
            { 'issue_id' => 10, 'baseline_start_date' => '2026-04-10', 'baseline_due_date' => '2026-04-15' },
            { 'baseline_start_date' => '2026-04-11', 'baseline_due_date' => '2026-04-16' }
          ]
        }
      }

      result = repository.load(project_id: 1)

      expect(result.snapshot).to be_a(RedmineCanvasGantt::BaselineSnapshot)
      expect(result.snapshot.scope).to eq('project')
      expect(result.snapshot.task_states_by_issue_id.keys).to eq(['10'])
      expect(result.snapshot.task_states_by_issue_id['10'].baseline_start_date).to eq(Date.new(2026, 4, 10))
      expect(result.warnings).to include('A baseline task state was skipped because it is missing issue_id.')
    end

    it 'rejects snapshots for a different project' do
      settings_hash['baseline_snapshots'] = {
        '2' => {
          'snapshot_id' => 'baseline-2',
          'project_id' => 2,
          'captured_at' => '2026-04-01T12:00:00Z',
          'captured_by_id' => 7,
          'captured_by_name' => 'Alice',
          'task_states' => []
        }
      }

      result = repository.load(project_id: 1)

      expect(result.snapshot).to be_nil
      expect(result.warnings.join("\n")).to include('Baseline snapshot project mismatch and was ignored.')
    end

    it 'defaults missing scope to filtered for older payloads' do
      settings_hash['baseline_snapshots'] = {
        '1' => {
          'snapshot_id' => 'baseline-1',
          'project_id' => 1,
          'captured_at' => '2026-04-01T12:00:00Z',
          'captured_by_id' => 7,
          'captured_by_name' => 'Alice',
          'task_states' => []
        }
      }

      result = repository.load(project_id: 1)

      expect(result.snapshot).to be_a(RedmineCanvasGantt::BaselineSnapshot)
      expect(result.snapshot.scope).to eq('filtered')
    end
  end
end
