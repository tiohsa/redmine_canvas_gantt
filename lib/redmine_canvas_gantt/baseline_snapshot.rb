module RedmineCanvasGantt
  class BaselineSnapshot
    VALID_SCOPES = %w[filtered project].freeze

    attr_reader :snapshot_id, :project_id, :captured_at, :captured_by_id, :captured_by_name, :task_states, :scope

    def initialize(snapshot_id:, project_id:, captured_at:, captured_by_id:, captured_by_name:, task_states:, scope: 'filtered')
      @snapshot_id = snapshot_id.to_s
      @project_id = project_id.to_i
      @captured_at = normalize_time(captured_at)
      @captured_by_id = captured_by_id.to_i
      @captured_by_name = captured_by_name.to_s
      @scope = normalize_scope(scope)
      @task_states = Array(task_states).map do |task_state|
        task_state.is_a?(BaselineTaskState) ? task_state : BaselineTaskState.new(**symbolize_keys(task_state))
      end
    end

    def task_states_by_issue_id
      @task_states_by_issue_id ||= task_states.each_with_object({}) do |task_state, result|
        result[task_state.issue_id.to_s] = task_state
      end
    end

    def to_storage_hash
      {
        'snapshot_id' => snapshot_id,
        'project_id' => project_id,
        'captured_at' => captured_at&.utc&.iso8601,
        'captured_by_id' => captured_by_id,
        'captured_by_name' => captured_by_name,
        'scope' => scope,
        'task_states' => task_states.map(&:to_storage_hash)
      }
    end

    def to_payload_hash
      {
        snapshot_id: snapshot_id,
        project_id: project_id,
        captured_at: captured_at&.utc&.iso8601,
        captured_by_id: captured_by_id,
        captured_by_name: captured_by_name,
        scope: scope,
        tasks_by_issue_id: task_states_by_issue_id.transform_values(&:to_payload_hash)
      }
    end

    private

    def normalize_time(value)
      return nil if value.nil?
      return value if value.respond_to?(:utc)

      Time.iso8601(value.to_s)
    end

    def symbolize_keys(value)
      return {} unless value.is_a?(Hash)

      value.each_with_object({}) do |(key, entry), result|
        result[key.to_sym] = entry
      end
    end

    def normalize_scope(value)
      normalized = value.to_s.presence || 'filtered'
      raise ArgumentError, 'scope is invalid' unless VALID_SCOPES.include?(normalized)

      normalized
    end
  end
end
