module RedmineCanvasGantt
  class ProjectMovePolicy
    Result = Struct.new(:attributes, :violations, :policy_fields, :mandatory_fields, keyword_init: true)

    def initialize(current_user:)
      @current_user = current_user
    end

    def apply(issue:, user_intent:, before_values:, target_project: nil)
      return empty_result unless user_intent.key?(:project_id)
      destination_id = target_project ? target_project.id : issue.project_id
      return empty_result if before_values[:project_id].to_i == destination_id.to_i

      attributes = {}
      violations = []
      policy_fields = []

      mandatory_fields = []

      unless user_intent.key?(:tracker_id)
        allowed_trackers = allowed_trackers_for(issue, target_project, before_values[:tracker_id])
        persisted_tracker_allowed = allowed_trackers.any? do |tracker|
          tracker.id.to_i == before_values[:tracker_id].to_i
        end
        unless persisted_tracker_allowed
          fallback = allowed_trackers.first
          if fallback
            attributes[:tracker_id] = fallback.id
            policy_fields << :tracker_id
            mandatory_fields << :tracker_id
          else
            violations << {
              field: 'tracker_id',
              code: 'no_allowed_tracker',
              message: 'No tracker is available in the target project.'
            }
          end
        end
      end

      Result.new(
        attributes: attributes,
        violations: violations,
        policy_fields: policy_fields,
        mandatory_fields: mandatory_fields
      )
    end

    private

    def empty_result
      Result.new(attributes: {}, violations: [], policy_fields: [], mandatory_fields: [])
    end

    def allowed_trackers_for(issue, target_project, current_tracker_id)
      if target_project && issue.class.respond_to?(:allowed_target_trackers)
        return issue.class.allowed_target_trackers(
          target_project,
          @current_user,
          current_tracker_id
        ).to_a
      end

      issue.allowed_target_trackers(@current_user).to_a
    end
  end
end
