module RedmineCanvasGantt
  # The controller is responsible for translating authorization failures into
  # HTTP responses.  This object owns the Redmine permission rules used by
  # Canvas Gantt mutations so a new endpoint has one place to consult.
  class MutationAuthorizationPolicy
    def initialize(current_user: User.current)
      @current_user = current_user
    end

    def can_edit_project?(project)
      @current_user.allowed_to?(:edit_issues, project)
    end

    def can_view_project?(project)
      @current_user.allowed_to?(:view_canvas_gantt, project)
    end

    def can_edit_issue?(issue)
      can_edit_project?(issue.project) && issue.editable?
    end

    def can_delete_issue?(issue)
      @current_user.allowed_to?(:delete_issues, issue.project) && issue.deletable?
    end

    def can_add_issue?(project)
      @current_user.allowed_to?(:add_issues, project)
    end

    def can_create_subtask?(parent_issue)
      can_add_issue?(parent_issue.project) &&
        @current_user.allowed_to?(:manage_subtasks, parent_issue.project)
    end

    def can_log_time?(project)
      @current_user.allowed_to?(:log_time, project)
    end

    def can_manage_baseline?(project)
      @current_user.allowed_to?(:manage_canvas_gantt_baseline, project)
    end
  end
end
