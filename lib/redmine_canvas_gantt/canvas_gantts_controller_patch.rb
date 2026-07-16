module RedmineCanvasGantt
  module CanvasGanttsControllerPatch
    private

    # Business-calendar validation is only required by relation types whose
    # delay is calculated in working days. Other relation types must remain
    # usable even when the external calendar configuration is invalid.
    # Do not expose project-to-calendar assignments for projects that the
    # current user cannot see.
    def business_calendar_projects(project_ids)
      Project.visible.where(id: project_ids).to_a
    end
  end
end
