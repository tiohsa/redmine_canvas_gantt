require 'securerandom'
require 'time'

module RedmineCanvasGantt
  class BaselineRepository
    STORAGE_KEY = 'baseline_snapshots'.freeze
    LoadResult = Struct.new(:snapshot, :warnings, keyword_init: true)

    def initialize(settings_reader: Setting, current_user_class: User)
      @settings_reader = settings_reader
      @current_user_class = current_user_class
    end

    def save(project_id:, snapshot:)
      replace(project_id: project_id, snapshot: snapshot)
    end

    def load(project_id:)
      snapshots = stored_snapshots
      raw_snapshot = snapshots[project_id.to_s]
      return LoadResult.new(snapshot: nil, warnings: []) if raw_snapshot.blank?

      load_snapshot(raw_snapshot, expected_project_id: project_id)
    end

    def replace(project_id:, snapshot:)
      raise ArgumentError, 'project_id mismatch' if snapshot.project_id != project_id.to_i

      settings = plugin_settings
      snapshots = normalize_snapshots(settings[STORAGE_KEY])
      snapshots[project_id.to_s] = snapshot.to_storage_hash
      write_plugin_settings(settings.merge(STORAGE_KEY => snapshots))
      snapshot
    end

    def build_snapshot(project:, issues:, current_user:, snapshot_id: SecureRandom.uuid, captured_at: Time.now.utc, scope: 'filtered')
      BaselineSnapshot.new(
        snapshot_id: snapshot_id,
        project_id: project.id,
        captured_at: captured_at,
        captured_by_id: current_user.id,
        captured_by_name: current_user.name.to_s,
        scope: scope,
        task_states: issues.filter_map { |issue| build_task_state(issue) }
      )
    end

    private

    def build_task_state(issue)
      return nil unless issue.respond_to?(:id)

      BaselineTaskState.new(
        issue_id: issue.id,
        baseline_start_date: issue.respond_to?(:start_date) ? issue.start_date : nil,
        baseline_due_date: issue.respond_to?(:due_date) ? issue.due_date : nil
      )
    end

    def stored_snapshots
      normalize_snapshots(plugin_settings[STORAGE_KEY])
    end

    def plugin_settings
      @plugin_settings ||= begin
        settings = @settings_reader.plugin_redmine_canvas_gantt
        settings.is_a?(Hash) ? settings.dup : {}
      end
    end

    def write_plugin_settings(settings)
      @settings_reader.plugin_redmine_canvas_gantt = settings
      @plugin_settings = settings
    end

    def normalize_snapshots(value)
      case value
      when Hash
        value.each_with_object({}) do |(key, snapshot_value), result|
          next unless snapshot_value.is_a?(Hash)

          result[key.to_s] = snapshot_value
        end
      else
        {}
      end
    end

    def load_snapshot(raw_snapshot, expected_project_id:)
      warnings = []

      snapshot_id = raw_snapshot['snapshot_id'] || raw_snapshot[:snapshot_id]
      project_id = parse_integer(raw_snapshot['project_id'] || raw_snapshot[:project_id])
      captured_at = parse_time(raw_snapshot['captured_at'] || raw_snapshot[:captured_at])
      captured_by_id = parse_integer(raw_snapshot['captured_by_id'] || raw_snapshot[:captured_by_id])
      captured_by_name = raw_snapshot['captured_by_name'] || raw_snapshot[:captured_by_name]
      scope = raw_snapshot['scope'] || raw_snapshot[:scope] || 'filtered'

      unless snapshot_id.present? && project_id && captured_at && captured_by_id && captured_by_name.present?
        warnings << 'Baseline snapshot payload is incomplete and was ignored.'
        return LoadResult.new(snapshot: nil, warnings: warnings)
      end

      if project_id != expected_project_id.to_i
        warnings << 'Baseline snapshot project mismatch and was ignored.'
        return LoadResult.new(snapshot: nil, warnings: warnings)
      end

      task_states_raw = extract_task_states(raw_snapshot)
      task_states = []

      task_states_raw.each do |task_state_raw|
        task_state = load_task_state(task_state_raw, warnings)
        task_states << task_state if task_state
      end

      snapshot = BaselineSnapshot.new(
        snapshot_id: snapshot_id,
        project_id: project_id,
        captured_at: captured_at,
        captured_by_id: captured_by_id,
        captured_by_name: captured_by_name,
        scope: scope,
        task_states: task_states
      )

      LoadResult.new(snapshot: snapshot, warnings: warnings)
    rescue ArgumentError => e
      warnings << "Baseline snapshot payload is invalid: #{e.message}"
      LoadResult.new(snapshot: nil, warnings: warnings)
    end

    def extract_task_states(raw_snapshot)
      raw_states = raw_snapshot['task_states'] || raw_snapshot[:task_states]
      if raw_states.is_a?(Hash)
        raw_states.values
      elsif raw_states.is_a?(Array)
        raw_states
      else
        lookup = raw_snapshot['tasks_by_issue_id'] || raw_snapshot[:tasks_by_issue_id]
        lookup.is_a?(Hash) ? lookup.values : []
      end
    end

    def load_task_state(raw_task_state, warnings)
      return nil unless raw_task_state.is_a?(Hash)

      issue_id = raw_task_state['issue_id'] || raw_task_state[:issue_id]
      begin
        issue_id = Integer(issue_id)
      rescue ArgumentError, TypeError
        warnings << 'A baseline task state was skipped because it is missing issue_id.'
        return nil
      end

      if issue_id <= 0
        warnings << 'A baseline task state was skipped because it is missing issue_id.'
        return nil
      end

      raw_start_date = raw_task_state['baseline_start_date'] || raw_task_state[:baseline_start_date]
      raw_due_date = raw_task_state['baseline_due_date'] || raw_task_state[:baseline_due_date]
      parsed_start_date = parse_date(raw_start_date)
      parsed_due_date = parse_date(raw_due_date)

      if raw_start_date.present? && parsed_start_date.nil?
        warnings << "Baseline task state for issue #{issue_id} was skipped: baseline_start_date is invalid."
        return nil
      end

      if raw_due_date.present? && parsed_due_date.nil?
        warnings << "Baseline task state for issue #{issue_id} was skipped: baseline_due_date is invalid."
        return nil
      end

      BaselineTaskState.new(
        issue_id: issue_id,
        baseline_start_date: parsed_start_date,
        baseline_due_date: parsed_due_date
      )
    rescue ArgumentError => e
      warnings << "Baseline task state for issue #{issue_id} was skipped: #{e.message}"
      nil
    end

    def parse_integer(value)
      Integer(value)
    rescue ArgumentError, TypeError
      nil
    end

    def parse_time(value)
      return nil if value.nil? || value.to_s.strip.empty?

      Time.iso8601(value.to_s)
    rescue ArgumentError
      nil
    end

    def parse_date(value)
      return nil if value.nil? || value.to_s.strip.empty?

      Date.iso8601(value.to_s)
    rescue ArgumentError
      nil
    end
  end
end
