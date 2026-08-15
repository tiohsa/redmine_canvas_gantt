module RedmineCanvasGantt
  # Coordinates one Canvas schedule intent across every Issue it plans to
  # change. Redmine callbacks are allowed to run; planned Issues are reloaded
  # before their final intent is applied so callback materialization cannot
  # become a false optimistic-lock conflict.
  class ScheduleMutationCoordinator
    Result = Struct.new(
      :status,
      :operation_id,
      :entities,
      :revisions,
      :invalidated_entity_ids,
      :errors,
      :conflict,
      keyword_init: true
    )

    SCHEDULE_FIELDS = %i[start_date due_date].freeze

    def initialize(current_user:, project_scope_ids:, payload_builder:, evaluator: nil)
      @current_user = current_user
      @project_scope_ids = Array(project_scope_ids).map(&:to_i)
      @payload_builder = payload_builder
      @evaluator = evaluator
    end

    def call(operation_id:, base_revisions:, changes:)
      normalized_changes = normalize_changes(changes)
      return failure('changes must contain at least one task') if normalized_changes.empty?

      ids = normalized_changes.map { |change| change[:task_id] }.uniq.sort
      revisions = normalize_revisions(base_revisions)
      missing_revision_id = ids.find { |id| !revisions.key?(id) }
      return failure("Missing base revision for task #{missing_revision_id}") if missing_revision_id

      transaction_result = nil
      Issue.transaction do
        callback_candidate_ids = Issue.where(id: ids).pluck(:parent_id).compact
        callback_candidate_ids.concat(
          IssueRelation.where(issue_from_id: ids)
            .or(IssueRelation.where(issue_to_id: ids))
            .pluck(:issue_from_id, :issue_to_id)
            .flatten
        )
        lock_ids = (ids + callback_candidate_ids).uniq.sort
        issues = Issue.visible.where(id: lock_ids).order(:id).lock.to_a
        planned_issues = issues.select { |issue| ids.include?(issue.id.to_i) }
        missing_id = ids.find { |id| planned_issues.none? { |issue| issue.id.to_i == id } }
        if missing_id
          transaction_result = failure("Task #{missing_id} was not found", status: :not_found)
          raise ActiveRecord::Rollback
        end

        out_of_scope = planned_issues.find { |issue| !@project_scope_ids.include?(issue.project_id.to_i) }
        if out_of_scope
          transaction_result = failure("Task #{out_of_scope.id} is outside the Canvas scope", status: :not_found)
          raise ActiveRecord::Rollback
        end

        stale_issue = planned_issues.find { |issue| issue.lock_version.to_i != revisions.fetch(issue.id.to_i) }
        if stale_issue
          transaction_result = conflict_result(operation_id, stale_issue, revisions.fetch(stale_issue.id.to_i))
          raise ActiveRecord::Rollback
        end

        unless planned_issues.all? { |issue| editable?(issue) }
          transaction_result = failure('Permission denied', status: :forbidden)
          raise ActiveRecord::Rollback
        end

        changes_by_id = normalized_changes.to_h { |change| [change[:task_id], change] }
        evaluations = planned_issues.to_h do |issue|
          change = changes_by_id.fetch(issue.id.to_i)
          intent = change.slice(*SCHEDULE_FIELDS)
          [issue.id.to_i, evaluator.evaluate(issue: issue, intent: intent)]
        end
        invalid = evaluations.values.find { |evaluation| !evaluation.valid? }
        if invalid
          transaction_result = Result.new(
            status: :validation_error,
            operation_id: operation_id,
            entities: [],
            revisions: {},
            invalidated_entity_ids: [],
            errors: invalid.violations.map { |violation| violation[:message] }
          )
          raise ActiveRecord::Rollback
        end

        # Apply the Canvas plan in stable order. Reloading before each write is
        # deliberate: a preceding save may have changed this Issue through a
        # Redmine callback while the row lock remains held by this transaction.
        planned_issues.each do |issue|
          issue.reload
          change = changes_by_id.fetch(issue.id.to_i)
          evaluation = evaluator.evaluate(issue: issue, intent: change.slice(*SCHEDULE_FIELDS))
          unless evaluation.valid? && issue.save
            transaction_result = Result.new(
              status: :validation_error,
              operation_id: operation_id,
              entities: [],
              revisions: {},
              invalidated_entity_ids: [],
              errors: evaluation.violations.map { |violation| violation[:message] } + issue.errors.full_messages
            )
            raise ActiveRecord::Rollback
          end
        end

        canonical = Issue.visible.where(id: lock_ids).order(:id).to_a
        transaction_result = Result.new(
          status: :ok,
          operation_id: operation_id,
          entities: canonical.map { |issue| @payload_builder.build_task_state(issue) },
          revisions: canonical.to_h { |issue| [issue.id.to_i, issue.lock_version.to_i] },
          invalidated_entity_ids: canonical.map(&:id),
          errors: []
        )
      end

      transaction_result || failure('Schedule mutation failed')
    rescue ActiveRecord::StaleObjectError => error
      remote = Issue.visible.find_by(id: error.record&.id)
      conflict_result(operation_id, remote, remote && revisions[remote.id.to_i])
    end

    private

    attr_reader :evaluator

    def normalize_changes(changes)
      raw_changes = if changes.respond_to?(:to_unsafe_h)
                      changes.to_unsafe_h.values
                    else
                      Array(changes)
                    end
      raw_changes.filter_map do |raw_change|
        raw_change = raw_change.to_unsafe_h if raw_change.respond_to?(:to_unsafe_h)
        change = raw_change.to_h.symbolize_keys
        task_id = Integer(change[:task_id], exception: false)
        next unless task_id&.positive?

        fields = change.slice(*SCHEDULE_FIELDS).transform_values do |value|
          value.blank? ? nil : value
        end
        next if fields.empty?

        { task_id: task_id, **fields }
      end
    end

    def normalize_revisions(revisions)
      raw_revisions = revisions.respond_to?(:to_unsafe_h) ? revisions.to_unsafe_h : revisions.to_h
      raw_revisions.each_with_object({}) do |(id, revision), normalized|
        parsed_id = Integer(id, exception: false)
        parsed_revision = Integer(revision, exception: false)
        normalized[parsed_id] = parsed_revision if parsed_id&.positive? && parsed_revision && parsed_revision >= 0
      end
    end

    def editable?(issue)
      @current_user.allowed_to?(:edit_issues, issue.project) && issue.editable?
    end

    def evaluator
      @evaluator ||= IssueDraftEvaluator.new(
        current_user: @current_user,
        project_scope_ids: @project_scope_ids
      )
    end

    def failure(message, status: :validation_error)
      Result.new(
        status: status,
        operation_id: nil,
        entities: [],
        revisions: {},
        invalidated_entity_ids: [],
        errors: [message]
      )
    end

    def conflict_result(operation_id, issue, expected_revision)
      Result.new(
        status: :conflict,
        operation_id: operation_id,
        entities: issue ? [@payload_builder.build_task_state(issue)] : [],
        revisions: issue ? { issue.id.to_i => issue.lock_version.to_i } : {},
        invalidated_entity_ids: issue ? [issue.id] : [],
        errors: ['The issue was updated by another request.'],
        conflict: {
          task_id: issue&.id,
          expected_revision: expected_revision,
          actual_revision: issue&.lock_version
        }
      )
    end
  end
end
