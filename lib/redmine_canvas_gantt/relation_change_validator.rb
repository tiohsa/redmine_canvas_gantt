module RedmineCanvasGantt
  class RelationChangeValidator
    def initialize(non_working_week_days: [], calendar_service: nil, constraint_graph_class: RedmineCanvasGantt::ConstraintGraph)
      @non_working_week_days = non_working_week_days
      @calendar_service = calendar_service
      @constraint_graph_class = constraint_graph_class
    end

    def validate!(
      issue_from:,
      issue_to:,
      relation_type:,
      delay:,
      existing_relations:,
      candidate_relation:,
      replacing_relation_id: nil,
      error_renderer:
    )
      return false unless delay_consistent?(issue_from, issue_to, relation_type, delay, error_renderer)

      next_relations = Array(existing_relations)
        .reject { |relation| relation[:id].to_s == replacing_relation_id.to_s }
        .push(candidate_relation)

      return true unless @constraint_graph_class.new(relations: next_relations).cyclic?

      error_renderer.call(:error_canvas_gantt_relation_cycle_detected)
      false
    end

    private

    def delay_consistent?(issue_from, issue_to, relation_type, delay, error_renderer)
      return true unless %w[precedes follows].include?(relation_type) && delay.is_a?(Integer)

      predecessor, successor = relation_type == 'follows' ? [issue_to, issue_from] : [issue_from, issue_to]
      predecessor_due = predecessor&.due_date
      successor_start = successor&.start_date
      return true if predecessor_due.blank? || successor_start.blank?

      minimum_successor_start = add_working_days_to_date(
        predecessor_due.to_date,
        1 + delay,
        project: successor.project
      )
      return true if successor_start.to_date >= minimum_successor_start

      error_renderer.call(:error_canvas_gantt_relation_delay_mismatch)
      false
    end

    def add_working_days_to_date(date, days, project:)
      if @calendar_service
        return @calendar_service.add_working_days(date, days, project: project)
      end

      current = date.to_date
      remaining = [days.to_i, 0].max

      while remaining.positive?
        current += 1
        next if @non_working_week_days.include?(current.wday)

        remaining -= 1
      end

      current
    end
  end
end
