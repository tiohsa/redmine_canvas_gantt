require 'set'

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
      planned_id_set = ids.to_set

      transaction_result = nil
      Issue.transaction do
        callback_scope = resolve_callback_scope(ids)
        lock_ids = callback_scope[:ids].sort
        issues = Issue.where(id: lock_ids).order(:id).lock.to_a
        issues_by_id = issues.to_h { |issue| [issue.id.to_i, issue] }
        visible_planned_ids = Issue.visible.where(id: ids).pluck(:id).to_set
        planned_issues = ids.filter_map do |id|
          issue = issues_by_id[id]
          issue if issue && visible_planned_ids.include?(id)
        end
        missing_id = ids.find { |id| !visible_planned_ids.include?(id) || !issues_by_id.key?(id) }
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

        apply_order = causal_apply_order(ids, callback_scope[:apply_edges])
        unless apply_order
          transaction_result = failure('Schedule dependency graph cannot be ordered safely')
          raise ActiveRecord::Rollback
        end
        initial_revisions = issues_by_id.to_h { |id, issue| [id, issue.lock_version.to_i] }

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

        # Locking is stable for deadlock avoidance, but applying the explicit
        # Canvas plan follows callback/dependency causality. Reloading before
        # each write is deliberate: a preceding save may have changed this
        # Issue through a Redmine callback while the row lock remains held.
        apply_order.each do |task_id|
          issue = issues_by_id.fetch(task_id)
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
        changed_ids = canonical.filter_map do |issue|
          id = issue.id.to_i
          id if planned_id_set.include?(id) || issue.lock_version.to_i > initial_revisions.fetch(id, issue.lock_version.to_i)
        end
        changed_id_set = changed_ids.to_set
        canonical = canonical.select { |issue| changed_id_set.include?(issue.id.to_i) }
        transaction_result = Result.new(
          status: :ok,
          operation_id: operation_id,
          entities: canonical.map { |issue| @payload_builder.build_task_state(issue) },
          revisions: canonical.to_h { |issue| [issue.id.to_i, issue.lock_version.to_i] },
          invalidated_entity_ids: changed_ids,
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

    # Resolve the finite set of Issues that Redmine callbacks can reach from
    # the explicit plan. Relation callbacks travel through stored `precedes`
    # edges, while Issue#update_parent_attributes travels to each ancestor.
    # A derived parent can additionally reschedule descendants, so those
    # descendants are included in the lock/reconciliation closure without
    # being treated as explicit apply dependencies.
    def resolve_callback_scope(seed_ids)
      visited = seed_ids.to_set
      apply_edges = Set.new
      frontier = seed_ids

      until frontier.empty?
        issues = Issue.where(id: frontier).order(:id).to_a
        relation_rows = IssueRelation
          .where(issue_from_id: frontier, relation_type: IssueRelation::TYPE_PRECEDES)
          .order(:issue_from_id, :issue_to_id)
          .pluck(:issue_from_id, :issue_to_id)
        next_ids = []

        relation_rows.each do |from_id, to_id|
          from_id = from_id.to_i
          to_id = to_id.to_i
          apply_edges.add([from_id, to_id])
          next_ids << to_id unless visited.include?(to_id)
        end

        issues.each do |issue|
          if issue.parent_id
            parent_id = issue.parent_id.to_i
            apply_edges.add([issue.id.to_i, parent_id])
            next_ids << parent_id unless visited.include?(parent_id)
          end

          next unless issue.respond_to?(:dates_derived?) && issue.dates_derived?
          next if issue.leaf?

          descendant_ids = Issue
            .where(root_id: issue.root_id, lft: issue.lft..issue.rgt)
            .where.not(id: issue.id)
            .pluck(:id)
          next_ids.concat(descendant_ids.map(&:to_i).reject { |id| visited.include?(id) })
        end

        new_ids = next_ids.uniq.reject { |id| visited.include?(id) }
        new_ids.each { |id| visited.add(id) }
        frontier = new_ids
      end

      { ids: visited, apply_edges: apply_edges }
    end

    def causal_apply_order(planned_ids, edges)
      planned_id_set = planned_ids.to_set
      outgoing = Hash.new { |hash, key| hash[key] = Set.new }
      indegree = planned_ids.to_h { |id| [id, 0] }

      edges.each do |from_id, to_id|
        next unless planned_id_set.include?(from_id) && planned_id_set.include?(to_id)
        next if outgoing[from_id].include?(to_id)

        outgoing[from_id].add(to_id)
        indegree[to_id] += 1
      end

      ready = indegree.filter_map { |id, degree| id if degree.zero? }.sort
      order = []
      ready_index = 0
      while ready_index < ready.length
        id = ready[ready_index]
        ready_index += 1
        order << id
        outgoing[id].each do |successor_id|
          indegree[successor_id] -= 1
          ready << successor_id if indegree[successor_id].zero?
        end
      end

      order.length == planned_ids.length ? order : nil
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
