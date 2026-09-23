require 'set'
require 'digest'
require_relative 'constraint_graph'
require_relative 'business_calendar_repository'
require_relative 'project_calendar_resolver'
require_relative 'schedule_calendar_context'
require_relative 'mutation_authorization_policy'

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
      :conflicts,
      :failure,
      :resolution_context,
      :adjustments,
      keyword_init: true
    )

    SCHEDULE_FIELDS = %i[start_date due_date].freeze
    SAVE_EVENT = :save
    RESCHEDULE_EVENT = :reschedule
    MAX_ATTEMPTS = 3

    def initialize(current_user:, project_scope_ids:, payload_builder:, evaluator: nil, calendar_resolver: nil, authorization_policy: nil)
      @current_user = current_user
      @project_scope_ids = Array(project_scope_ids).map(&:to_i)
      @payload_builder = payload_builder
      @evaluator = evaluator
      @calendar_resolver = calendar_resolver
      @authorization_policy = authorization_policy || MutationAuthorizationPolicy.new(current_user: current_user)
    end

    def call(operation_id:, base_revisions:, changes:, date_placement_mode: :working_days, resolution: nil)
      resolution = resolution.to_unsafe_h if resolution.respond_to?(:to_unsafe_h)
      resolution = resolution&.symbolize_keys
      request_date_placement_mode = normalize_date_placement_mode(date_placement_mode)
      normalized_changes = normalize_changes(changes)
      return failure('changes must contain at least one task') if normalized_changes.empty? && !resolution

      ids = normalized_changes.map { |change| change[:task_id] }.uniq.sort
      seed_ids = resolution ? Array(resolution[:task_ids]).map(&:to_i).select(&:positive?).uniq.sort : ids
      return failure('Resolution scope is required') if seed_ids.empty?
      return failure('Changes must belong to the reviewed operation') if resolution && (ids - seed_ids).any?
      revisions = normalize_revisions(base_revisions)
      missing_revision_id = ids.find { |id| !revisions.key?(id) }
      return failure("Missing base revision for task #{missing_revision_id}") if missing_revision_id
      planned_id_set = ids.to_set

      attempts = 0
      loop do
        attempts += 1
        transaction_result = nil
        topology_changed = false

        Issue.transaction do
          scope_a = resolution ? resolve_resolution_scope(seed_ids) : resolve_callback_scope(ids)
          lock_ids = scope_a[:ids].sort
          issues = Issue.where(id: lock_ids).order(:id).lock.to_a
          issues_by_id = issues.to_h { |issue| [issue.id.to_i, issue] }

          # The second resolution is intentionally performed without adding
          # locks. If the reachable topology expanded after A, the attempt is
          # rolled back and the next attempt locks the new stable scope.
          scope_b = resolution ? resolve_resolution_scope(seed_ids) : resolve_callback_scope(ids)
          if callback_scope_changed?(scope_a, scope_b)
            topology_changed = true
            raise ActiveRecord::Rollback
          end

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

          unless planned_issues.all? { |issue| editable?(issue) }
            transaction_result = failure('Permission denied', status: :forbidden)
            raise ActiveRecord::Rollback
          end

          stale_issues = planned_issues.select { |issue| issue.lock_version.to_i != revisions.fetch(issue.id.to_i) }
          if stale_issues.any?
            transaction_result = conflict_result(operation_id, stale_issues, revisions)
            raise ActiveRecord::Rollback
          end

          calendar_resolver = calendar_resolver_for_attempt
          if resolution
            # Read-only participants must also be visible, in scope and locked.
            visible_ids = Issue.visible.where(id: lock_ids).pluck(:id)
            unless (seed_ids - lock_ids).empty? && (lock_ids - visible_ids).empty? &&
                issues.all? { |issue| @project_scope_ids.include?(issue.project_id.to_i) }
              transaction_result = failure('Schedule scope is unavailable', status: :not_found)
              raise ActiveRecord::Rollback
            end
            token = resolution_token(scope_b, issues, calendar_resolver)
            if resolution[:preview].to_s == 'true'
              transaction_result = Result.new(status: :ok, operation_id: operation_id,
                entities: issues.map { |issue| @payload_builder.build_task_state(issue) },
                revisions: issues.to_h { |issue| [issue.id, issue.lock_version] },
                invalidated_entity_ids: [], errors: [],
                resolution_context: { token: token, task_ids: lock_ids, relations: resolution_relations(lock_ids).map { |r|
                  { id: r.id, from: r.issue_from_id, to: r.issue_to_id, type: r.relation_type, delay: r.delay }
                } })
              next
            end
            unless resolution[:token] == token
              transaction_result = topology_conflict_result(operation_id)
              raise ActiveRecord::Rollback
            end
            expected_dates = issues.to_h { |issue| [issue.id, issue.slice(:start_date, :due_date).symbolize_keys] }
            normalized_changes.each do |change|
              change.slice(*SCHEDULE_FIELDS).each do |field, value|
                expected_dates.fetch(change[:task_id])[field] = value.present? ? Date.iso8601(value.to_s) : nil
              end
            end
            errors = resolution_constraint_errors(issues, expected_dates, calendar_resolver)
            unless errors.empty?
              transaction_result = failure(errors.join('; '))
              raise ActiveRecord::Rollback
            end
          end

          apply_order = causal_apply_order(ids, scope_b[:event_edges])
          unless apply_order
            transaction_result = failure('Schedule dependency graph cannot be ordered safely')
            raise ActiveRecord::Rollback
          end
          initial_revisions = issues_by_id.to_h { |id, issue| [id, issue.lock_version.to_i] }
          changes_by_id = normalized_changes.to_h { |change| [change[:task_id], change] }

          RedmineCanvasGantt::ScheduleCalendarContext.with(resolver: calendar_resolver) do
            # Locks are stable for deadlock avoidance, while applying the
            # explicit Canvas plan follows callback/dependency causality.
            # Reloading before each write lets a preceding callback's
            # materialization become the next save's effective baseline.
            apply_order.each do |task_id|
              issue = issues_by_id.fetch(task_id)
              issue.reload
              change = changes_by_id.fetch(issue.id.to_i)
              change_date_placement_mode = normalize_date_placement_mode(
                change[:date_placement_mode] || request_date_placement_mode
              )
              normalized_interval = calendar_resolver.normalize_date_interval(
                start_date: change.key?(:start_date) ? change[:start_date] : issue.start_date,
                due_date: change.key?(:due_date) ? change[:due_date] : issue.due_date,
                changed_fields: change.keys & SCHEDULE_FIELDS,
                project: issue.project,
                date_placement_mode: change_date_placement_mode
              )
              unless normalized_interval[:valid]
                transaction_result = Result.new(
                  status: :validation_error,
                  operation_id: operation_id,
                  entities: [],
                  revisions: {},
                  invalidated_entity_ids: [],
                  errors: [:invalid_dates]
                )
                raise ActiveRecord::Rollback
              end

              intent = change.slice(*SCHEDULE_FIELDS).tap do |fields|
                fields[:start_date] = normalized_interval[:start_date] if fields.key?(:start_date)
                fields[:due_date] = normalized_interval[:due_date] if fields.key?(:due_date)
              end
              evaluation = evaluator.evaluate(issue: issue, intent: intent)
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

            # A callback may have observed a committed relation or hierarchy
            # change after B. Never return a partial success from this attempt.
            scope_c = resolution ? resolve_resolution_scope(seed_ids) : resolve_callback_scope(ids)
            if callback_scope_changed?(scope_b, scope_c)
              topology_changed = true
              raise ActiveRecord::Rollback
            end

            canonical = Issue.visible.where(id: scope_c[:ids].sort).order(:id).to_a
            if resolution
              # A valid draft is insufficient: Redmine callbacks may move a
              # retained successor or a derived parent. Never silently accept it.
              adjustments = canonical.filter_map do |issue|
                expected = expected_dates.fetch(issue.id)
                next if expected.all? { |field, value| issue.public_send(field) == value }

                { task_id: issue.id,
                  before_start_date: expected[:start_date]&.iso8601,
                  before_due_date: expected[:due_date]&.iso8601,
                  start_date: issue.start_date&.iso8601,
                  due_date: issue.due_date&.iso8601 }
              end
              final_dates = canonical.to_h { |issue| [issue.id, issue.slice(:start_date, :due_date).symbolize_keys] }
              errors = resolution_constraint_errors(canonical, final_dates, calendar_resolver)
              canonical.each do |issue|
                minimum = issue.soonest_start(true)
                errors << "Task #{issue.id} must start on or after #{minimum}" if minimum && issue.start_date && issue.start_date < minimum
                if issue.lock_version.to_i != initial_revisions.fetch(issue.id) && !editable?(issue)
                  errors << 'Permission denied for a callback update'
                end
              end
              approved = normalize_accepted_adjustments(resolution[:accepted_adjustments])
              approved_matches = approved && approved == adjustments.map { |item| item.slice(:task_id, :start_date, :due_date) }.sort_by { |item| item[:task_id] }
              if errors.any? || (adjustments.any? && !approved_matches) || (approved&.any? && !approved_matches)
                transaction_result = Result.new(status: :validation_error, operation_id: operation_id,
                  entities: [], revisions: {}, invalidated_entity_ids: [],
                  errors: errors.any? ? errors : ['Review the adjusted schedule before applying.'],
                  adjustments: errors.empty? ? adjustments : nil)
                raise ActiveRecord::Rollback
              end
            end
            changed_ids = canonical.filter_map do |issue|
              id = issue.id.to_i
              id if resolution || planned_id_set.include?(id) || issue.lock_version.to_i > initial_revisions.fetch(id, issue.lock_version.to_i)
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
        end

        return transaction_result if transaction_result
        return topology_conflict_result(operation_id) if topology_changed && attempts >= MAX_ATTEMPTS
        return failure('Schedule mutation failed') unless topology_changed
      end
    rescue ActiveRecord::StaleObjectError => error
      remote = Issue.visible.find_by(id: error.record&.id)
      conflict_result(operation_id, Array(remote), revisions)
    end

    private

    attr_reader :evaluator

    def normalize_accepted_adjustments(value)
      return nil if value.nil?

      raw = value.respond_to?(:to_unsafe_h) ? value.to_unsafe_h.values : Array(value)
      normalized = raw.filter_map do |entry|
        entry = entry.to_unsafe_h if entry.respond_to?(:to_unsafe_h)
        entry = entry.to_h.symbolize_keys
        id = Integer(entry[:task_id], exception: false)
        next unless id&.positive?

        { task_id: id, start_date: entry[:start_date]&.to_s, due_date: entry[:due_date]&.to_s }
      end
      normalized.sort_by { |entry| entry[:task_id] }
    end

    # Validation closure is undirected and includes read-only intermediaries.
    # Only precedes/follows are scheduling edges; other relation types are not.
    def resolve_resolution_scope(seed_ids)
      ids = seed_ids.to_set
      loop do
        previous = ids.dup
        Issue.where(id: ids.to_a).pluck(:parent_id).compact.each { |id| ids.add(id) }
        Issue.where(parent_id: ids.to_a).pluck(:id).each { |id| ids.add(id) }
        resolution_relations(ids.to_a).each do |relation|
          ids.add(relation.issue_from_id)
          ids.add(relation.issue_to_id)
        end
        break if previous == ids
      end
      resolve_callback_scope(ids.to_a.sort)
    end

    def resolution_relations(ids)
      IssueRelation.where(relation_type: %w[precedes follows])
        .where('issue_from_id IN (?) OR issue_to_id IN (?)', ids, ids).order(:id).to_a
    end

    def resolution_token(scope, issues, calendar)
      Digest::SHA256.hexdigest(JSON.generate([
        @current_user.id, scope[:signature],
        issues.map { |issue| [issue.id, issue.lock_version, issue.start_date, issue.due_date] },
        calendar.payload(projects: issues.map(&:project).uniq), Setting.non_working_week_days,
        Setting.parent_issue_dates
      ]))
    end

    def resolution_constraint_errors(issues, dates, calendar)
      by_id = issues.to_h { |issue| [issue.id.to_s, issue] }
      graph = ConstraintGraph.new(relations: resolution_relations(issues.map(&:id)))
      return ['Schedule dependency cycle'] if graph.cyclic?

      errors = dates.filter_map do |id, interval|
        if interval[:start_date] && interval[:due_date] && interval[:start_date] > interval[:due_date]
          "Invalid dates for task #{id}"
        end
      end
      graph.edges.each do |edge|
        predecessor = dates[edge.predecessor_id.to_i]
        successor = dates[edge.successor_id.to_i]
        next unless predecessor && successor && predecessor[:due_date] && successor[:start_date]

        earliest = calendar.add_working_days(predecessor[:due_date], edge.gap_days,
          project: by_id.fetch(edge.successor_id).project)
        errors << "Task #{edge.successor_id} must start on or after #{earliest}" if successor[:start_date] < earliest
      end
      errors
    end

    def calendar_resolver_for_attempt
      return @calendar_resolver if @calendar_resolver

      repository = RedmineCanvasGantt::BusinessCalendarRepository.instance
      RedmineCanvasGantt::ProjectCalendarResolver.new(
        repository: repository,
        fallback_non_working_week_days: Setting.non_working_week_days,
        snapshot: repository.snapshot
      )
    end

    def callback_scope_changed?(left, right)
      left[:signature] != right[:signature]
    end

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

        { task_id: task_id, **fields, date_placement_mode: change[:date_placement_mode] }
      end
    end

    # Resolve the finite callback graph reachable from explicit Canvas saves.
    #
    # Redmine has two materially different callback states:
    # - save(issue): after_save can reschedule successors and recalculate parent
    # - reschedule(issue): a leaf/independent-date issue is saved, while a
    #   derived parent propagates the reschedule down to its descendants
    #
    # Keeping those states separate avoids collapsing the upward
    # child->parent recomputation and downward derived-parent reschedule into a
    # false issue-level cycle. Direct-child propagation is a conservative,
    # linear representation of Issue#reschedule_on!'s leaf propagation.
    def resolve_callback_scope(seed_ids)
      visited_events = Set.new
      issue_ids = Set.new
      apply_edges = Set.new
      event_edges = Set.new
      relation_signatures = Set.new
      hierarchy_signatures = Set.new
      classification_signatures = Set.new
      project_signatures = Set.new
      issue_cache = {}
      frontier = seed_ids.map { |id| schedule_event(SAVE_EVENT, id) }

      until frontier.empty?
        current_events = frontier.uniq.reject { |event| visited_events.include?(event) }
        break if current_events.empty?

        current_events.each { |event| visited_events.add(event) }
        current_ids = current_events.map { |event| event[1] }.uniq
        missing_ids = current_ids.reject { |id| issue_cache.key?(id) }
        Issue.where(id: missing_ids).order(:id).each do |issue|
          issue_cache[issue.id.to_i] = issue
        end

        current_ids.each do |id|
          issue = issue_cache[id]
          next unless issue

          issue_ids.add(id)
          parent_id = issue.parent_id&.to_i
          hierarchy_signatures.add([parent_id, issue.id.to_i])
          classification_signatures.add([
            issue.id.to_i,
            issue.respond_to?(:leaf?) && issue.leaf?,
            issue.respond_to?(:dates_derived?) && issue.dates_derived?
          ])
          project_signatures.add([issue.id.to_i, issue.project_id.to_i])
        end

        child_rows = Issue
          .where(parent_id: current_ids)
          .order(:parent_id, :id)
          .pluck(:parent_id, :id)
        children_by_parent = Hash.new { |hash, key| hash[key] = [] }
        child_rows.each do |parent_id, child_id|
          parent_id = parent_id.to_i
          child_id = child_id.to_i
          hierarchy_signatures.add([parent_id, child_id])
          children_by_parent[parent_id] << child_id
        end

        next_events = []

        save_ids = current_events.filter_map do |kind, id|
          id if kind == SAVE_EVENT && issue_cache.key?(id)
        end
        if save_ids.any?
          relation_rows = IssueRelation
            .where(issue_from_id: save_ids)
            .order(:issue_from_id, :issue_to_id, :id)
            .pluck(:id, :issue_from_id, :issue_to_id, :relation_type, :delay)

          relation_rows.each do |relation_id, from_id, to_id, relation_type, delay|
            from_id = from_id.to_i
            to_id = to_id.to_i
            relation_signatures.add([
              relation_id.to_i,
              from_id,
              to_id,
              relation_type.to_s,
              delay
            ])
            next unless relation_type.to_s == IssueRelation::TYPE_PRECEDES

            apply_edges.add([from_id, to_id])
            from_event = schedule_event(SAVE_EVENT, from_id)
            to_event = schedule_event(RESCHEDULE_EVENT, to_id)
            event_edges.add([from_event, to_event])
            next_events << to_event
          end

          save_ids.each do |id|
            issue = issue_cache[id]
            next unless issue

            if issue.parent_id
              parent_id = issue.parent_id.to_i
              apply_edges.add([issue.id.to_i, parent_id])
              from_event = schedule_event(SAVE_EVENT, issue.id)
              to_event = schedule_event(SAVE_EVENT, parent_id)
              event_edges.add([from_event, to_event])
              next_events << to_event
            end
          end
        end

        reschedule_ids = current_events.filter_map do |kind, id|
          id if kind == RESCHEDULE_EVENT && issue_cache.key?(id)
        end
        derived_parent_ids = []
        reschedule_ids.each do |id|
          issue = issue_cache[id]
          next unless issue

          if issue.respond_to?(:dates_derived?) && issue.dates_derived? && !issue.leaf?
            derived_parent_ids << id
          else
            from_event = schedule_event(RESCHEDULE_EVENT, id)
            to_event = schedule_event(SAVE_EVENT, id)
            event_edges.add([from_event, to_event])
            next_events << to_event
          end
        end

        if derived_parent_ids.any?
          derived_parent_ids.each do |parent_id|
            children_by_parent[parent_id].each do |child_id|
              from_event = schedule_event(RESCHEDULE_EVENT, parent_id)
              to_event = schedule_event(RESCHEDULE_EVENT, child_id)
              event_edges.add([from_event, to_event])
              next_events << to_event
            end
          end
        end

        frontier = next_events.reject { |event| visited_events.include?(event) }
      end

      signature = {
        ids: issue_ids.to_a.sort,
        relation_edges: relation_signatures.to_a.sort_by(&:to_s),
        hierarchy_edges: hierarchy_signatures.to_a.sort_by(&:to_s),
        classifications: classification_signatures.to_a.sort_by(&:to_s),
        project_assignments: project_signatures.to_a.sort_by(&:to_s),
        callback_edges: event_edges.to_a.sort_by(&:to_s),
        apply_edges: apply_edges.to_a.sort_by(&:to_s)
      }.freeze

      { ids: issue_ids, apply_edges: apply_edges, event_edges: event_edges, signature: signature }
    end

    def schedule_event(kind, issue_id)
      [kind, issue_id.to_i]
    end

    # Topologically order only callback events that are reachable from the
    # explicit Canvas saves, then project that event order back to planned
    # Issue saves. A callback-only intermediary therefore preserves transitive
    # causality without forcing unrelated callback states into the plan.
    def causal_apply_order(planned_ids, event_edges)
      planned_id_set = planned_ids.to_set
      outgoing = Hash.new { |hash, key| hash[key] = Set.new }

      event_edges.each do |from_event, to_event|
        outgoing[from_event].add(to_event)
      end

      start_events = planned_ids.map { |id| schedule_event(SAVE_EVENT, id) }
      reachable = Set.new
      stack = start_events.reverse
      until stack.empty?
        event = stack.pop
        next if reachable.include?(event)

        reachable.add(event)
        outgoing[event].to_a.sort_by { |successor| event_sort_key(successor) }.reverse_each do |successor|
          stack << successor
        end
      end

      indegree = reachable.to_h { |event| [event, 0] }
      reachable.each do |from_event|
        outgoing[from_event].each do |to_event|
          next unless reachable.include?(to_event)

          indegree[to_event] += 1
        end
      end

      ready = indegree.filter_map { |event, degree| event if degree.zero? }
        .sort_by { |event| event_sort_key(event) }
      event_order = []
      ready_index = 0
      while ready_index < ready.length
        event = ready[ready_index]
        ready_index += 1
        event_order << event

        outgoing[event].to_a.sort_by { |successor| event_sort_key(successor) }.each do |successor|
          next unless indegree.key?(successor)

          indegree[successor] -= 1
          ready << successor if indegree[successor].zero?
        end
      end

      return nil unless event_order.length == reachable.length

      planned_order = event_order.filter_map do |kind, id|
        id if kind == SAVE_EVENT && planned_id_set.include?(id)
      end
      planned_order.length == planned_ids.length ? planned_order : nil
    end

    def event_sort_key(event)
      kind, id = event
      [id.to_i, kind == SAVE_EVENT ? 0 : 1]
    end

    def normalize_revisions(revisions)
      raw_revisions = revisions.respond_to?(:to_unsafe_h) ? revisions.to_unsafe_h : revisions.to_h
      raw_revisions.each_with_object({}) do |(id, revision), normalized|
        parsed_id = Integer(id, exception: false)
        parsed_revision = Integer(revision, exception: false)
        normalized[parsed_id] = parsed_revision if parsed_id&.positive? && parsed_revision && parsed_revision >= 0
      end
    end

    def normalize_date_placement_mode(value)
      value.to_s == 'calendar_days' ? :calendar_days : :working_days
    end

    def editable?(issue)
      @authorization_policy.can_edit_issue?(issue)
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

    def topology_conflict_result(operation_id)
      Result.new(
        status: :conflict,
        operation_id: operation_id,
        entities: [],
        revisions: {},
        invalidated_entity_ids: [],
        errors: ['The schedule topology changed while the operation was running.'],
        failure: {
          kind: 'conflict',
          resource_role: 'scope',
          resource_type: 'schedule_scope',
          remote_availability: 'needs_refresh'
        }
      )
    end

    def conflict_result(operation_id, issues, revisions)
      conflicts = issues.map do |issue|
        {
          task_id: issue.id,
          expected_revision: revisions[issue.id.to_i],
          actual_revision: issue.lock_version
        }
      end
      Result.new(
        status: :conflict,
        operation_id: operation_id,
        entities: issues.map { |issue| @payload_builder.build_task_state(issue) },
        revisions: issues.to_h { |issue| [issue.id.to_i, issue.lock_version.to_i] },
        invalidated_entity_ids: issues.map(&:id),
        errors: ['The issue was updated by another request.'],
        conflict: conflicts.first,
        conflicts: conflicts
      )
    end
  end
end
