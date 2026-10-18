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

    it 'preserves another project baseline when repositories have cached an older settings value' do
      first_repository = described_class.new(settings_reader: settings_reader)
      second_repository = described_class.new(settings_reader: settings_reader)
      first_repository.send(:plugin_settings)
      second_repository.send(:plugin_settings)

      [
        [first_repository, 1, 'baseline-1'],
        [second_repository, 2, 'baseline-2']
      ].each do |repository, project_id, snapshot_id|
        repository.replace(project_id: project_id, snapshot: RedmineCanvasGantt::BaselineSnapshot.new(
          snapshot_id: snapshot_id, project_id: project_id, captured_at: Time.utc(2026, 4, 1),
          captured_by_id: 7, captured_by_name: 'Alice', scope: 'project', task_states: []
        ))
      end

      expect(captured_settings.last['baseline_snapshots'].keys).to contain_exactly('1', '2')
    end

    it 'preserves every project baseline during concurrent saves' do
      repositories = [1, 2].map { described_class.new(settings_reader: settings_reader) }
      threads = repositories.each_with_index.map do |concurrent_repository, index|
        Thread.new do
          project_id = index + 1
          concurrent_repository.replace(project_id: project_id, snapshot: RedmineCanvasGantt::BaselineSnapshot.new(
            snapshot_id: "baseline-#{project_id}", project_id: project_id, captured_at: Time.utc(2026, 4, 1),
            captured_by_id: 7, captured_by_name: 'Alice', scope: 'project', task_states: []
          ))
        end
      end
      threads.each(&:join)

      expect(captured_settings.last['baseline_snapshots'].keys).to contain_exactly('1', '2')
    end

    context 'with the real Setting model' do
      self.use_transactional_tests = false

      around do |example|
        existing_setting = Setting.find_by(name: described_class::SETTING_NAME)
        original_value = existing_setting&.value&.deep_dup
        Setting.find_or_create_by!(name: described_class::SETTING_NAME).update!(value: {})
        Setting.clear_cache

        example.run
      ensure
        if existing_setting
          existing_setting.reload.update!(value: original_value)
        else
          Setting.where(name: described_class::SETTING_NAME).delete_all
        end
        Setting.clear_cache
      end

      def concurrent_snapshot(project_id, snapshot_id)
        RedmineCanvasGantt::BaselineSnapshot.new(
          snapshot_id: snapshot_id, project_id: project_id, captured_at: Time.utc(2026, 4, 1),
          captured_by_id: 7, captured_by_name: 'Alice', scope: 'project', task_states: []
        )
      end

      def run_concurrent_replacements(replacements)
        ready = Queue.new
        start = Queue.new
        errors = Queue.new
        threads = replacements.map do |project_id, snapshot_id|
          Thread.new do
            Setting.connection_pool.with_connection do
              repository = described_class.new(settings_reader: Setting)
              ready << true
              start.pop
              repository.replace(
                project_id: project_id,
                snapshot: concurrent_snapshot(project_id, snapshot_id)
              )
            end
          rescue StandardError => error
            errors << error
          end
        end
        replacements.length.times { ready.pop }
        replacements.length.times { start << true }
        threads.each(&:join)
        raise errors.pop unless errors.empty?
      end

      it 'preserves different project baselines through the row-lock path' do
        run_concurrent_replacements([[1, 'baseline-1'], [2, 'baseline-2']])

        snapshots = Setting.find_by!(name: described_class::SETTING_NAME).value.fetch('baseline_snapshots')
        expect(snapshots.keys).to contain_exactly('1', '2')
      end

      it 'keeps a valid value when the same project is saved concurrently' do
        run_concurrent_replacements([[1, 'baseline-a'], [1, 'baseline-b']])

        stored = Setting.find_by!(name: described_class::SETTING_NAME).value
        expect(stored.fetch('baseline_snapshots').fetch('1').fetch('snapshot_id'))
          .to be_in(%w[baseline-a baseline-b])
      end

      it 'does not delete a replacement saved concurrently with a stale delete' do
        original = concurrent_snapshot(1, 'baseline-original')
        replacement = concurrent_snapshot(1, 'baseline-new')
        described_class.new(settings_reader: Setting).replace(project_id: 1, snapshot: original)

        ready = Queue.new
        start = Queue.new
        errors = Queue.new
        deleter = Thread.new do
          Setting.connection_pool.with_connection do
            repository = described_class.new(settings_reader: Setting)
            ready << true
            start.pop
            repository.delete(project_id: 1, expected_snapshot_id: 'baseline-original')
          end
        rescue described_class::SnapshotConflict
          # The save acquired the row lock first; retaining the new snapshot is
          # the expected compare-and-delete outcome.
        rescue StandardError => error
          errors << error
        end
        saver = Thread.new do
          Setting.connection_pool.with_connection do
            repository = described_class.new(settings_reader: Setting)
            ready << true
            start.pop
            repository.replace(project_id: 1, snapshot: replacement)
          end
        rescue StandardError => error
          errors << error
        end

        2.times { ready.pop }
        2.times { start << true }
        [deleter, saver].each(&:join)
        raise errors.pop unless errors.empty?

        stored = Setting.find_by!(name: described_class::SETTING_NAME).value
        expect(stored.dig('baseline_snapshots', '1', 'snapshot_id')).to eq('baseline-new')
      end
    end
  end

  describe '#delete' do
    let(:stored_snapshot) do
      {
        'snapshot_id' => 'snapshot-current',
        'project_id' => 1,
        'captured_at' => '2026-04-01T12:00:00Z',
        'captured_by_id' => 7,
        'captured_by_name' => 'Alice',
        'scope' => 'project',
        'task_states' => []
      }
    end

    before do
      settings_hash['unrelated_setting'] = 'keep-me'
      settings_hash['baseline_snapshots'] = {
        '1' => stored_snapshot,
        '2' => stored_snapshot.merge('project_id' => 2, 'snapshot_id' => 'other-project-snapshot')
      }
    end

    it 'deletes only the matching project snapshot and preserves other settings' do
      result = repository.delete(project_id: 1, expected_snapshot_id: 'snapshot-current')

      expect(result).to eq('snapshot-current')
      persisted = captured_settings.last
      expect(persisted['unrelated_setting']).to eq('keep-me')
      expect(persisted['baseline_snapshots']).to eq('2' => settings_hash['baseline_snapshots']['2'])
    end

    it 'raises not found when the project has no snapshot' do
      expect do
        repository.delete(project_id: 3, expected_snapshot_id: 'snapshot-current')
      end.to raise_error(described_class::SnapshotNotFound)
      expect(captured_settings).to be_empty
    end

    it 'raises conflict and keeps the newer snapshot when the expected id is stale' do
      expect do
        repository.delete(project_id: 1, expected_snapshot_id: 'snapshot-old')
      end.to raise_error(described_class::SnapshotConflict)

      expect(captured_settings).to be_empty
      expect(settings_hash.dig('baseline_snapshots', '1', 'snapshot_id')).to eq('snapshot-current')
    end

    it 'preserves a replacement saved concurrently with a stale delete under the fallback lock' do
      settings_hash['baseline_snapshots'] = { '1' => stored_snapshot }
      saver = described_class.new(settings_reader: settings_reader)
      deleter = described_class.new(settings_reader: settings_reader)
      replacement = RedmineCanvasGantt::BaselineSnapshot.new(
        snapshot_id: 'snapshot-new', project_id: 1, captured_at: Time.utc(2026, 4, 2),
        captured_by_id: 7, captured_by_name: 'Alice', scope: 'project', task_states: []
      )
      ready = Queue.new
      start = Queue.new
      outcomes = Queue.new

      threads = [
        Thread.new do
          ready << true
          start.pop
          saver.replace(project_id: 1, snapshot: replacement)
        end,
        Thread.new do
          ready << true
          start.pop
          deleter.delete(project_id: 1, expected_snapshot_id: 'snapshot-current')
        rescue described_class::SnapshotConflict
          :conflict
        end
      ]
      2.times { ready.pop }
      2.times { start << true }
      threads.each { |thread| outcomes << thread.value }

      expect(settings_reader.plugin_redmine_canvas_gantt.dig('baseline_snapshots', '1', 'snapshot_id'))
        .to eq('snapshot-new')
      expect(outcomes.size).to eq(2)
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
        '1' => {
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
