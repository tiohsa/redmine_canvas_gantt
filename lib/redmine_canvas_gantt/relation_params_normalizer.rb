module RedmineCanvasGantt
  class RelationParamsNormalizer
    def initialize(delay_relation_types:, relation_params:, delay_provided:, error_renderer:)
      @delay_relation_types = delay_relation_types
      @relation_params = relation_params
      @delay_provided = delay_provided
      @error_renderer = error_renderer
    end

    def normalize_delay(relation_type)
      raw_delay = @relation_params[:delay]

      unless @delay_relation_types.include?(relation_type)
        if @delay_provided.call && raw_delay.present?
          @error_renderer.call(:error_canvas_gantt_relation_delay_not_allowed)
        end
        return nil
      end

      if raw_delay.blank?
        @error_renderer.call(:error_canvas_gantt_relation_delay_required)
        return nil
      end

      delay = Integer(raw_delay)
      if delay.negative?
        @error_renderer.call(:error_canvas_gantt_relation_delay_invalid)
        return nil
      end

      delay
    rescue ArgumentError, TypeError
      @error_renderer.call(:error_canvas_gantt_relation_delay_invalid)
      nil
    end

    def serialize_relation(relation)
      {
        id: relation.id,
        from: relation.issue_from_id,
        to: relation.issue_to_id,
        type: relation.relation_type,
        delay: relation.delay
      }
    end
  end
end
