module RedmineCanvasGantt
  module CanvasGanttsControllerPatch
    private

    # Business-calendar validation is only required by relation types whose
    # delay is calculated in working days. Other relation types must remain
    # usable even when the external calendar configuration is invalid.
    def ensure_business_calendar_available!
      relation_type = relation_params[:relation_type].to_s
      delay_relation_types = self.class.const_get(:DELAY_RELATION_TYPES)
      return true unless delay_relation_types.include?(relation_type)

      super
    end

    # Do not expose project-to-calendar assignments for projects that the
    # current user cannot see.
    def business_calendar_projects(project_ids)
      Project.visible.where(id: project_ids).to_a
    end
  end
end
