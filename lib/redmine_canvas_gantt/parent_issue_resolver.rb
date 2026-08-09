module RedmineCanvasGantt
  class ParentIssueResolver
    def initialize(issue_finder: Issue.visible)
      @issue_finder = issue_finder
    end

    def call(source_issue:, raw_parent_issue_id:, issue_scope_checker:, validation_error_renderer:, not_found_renderer:)
      return nil if raw_parent_issue_id.blank?

      parent_issue = @issue_finder.find(raw_parent_issue_id)
      if parent_issue.id == source_issue.id
        validation_error_renderer.call(:error_canvas_gantt_task_cannot_be_child_of_itself)
        return :invalid
      end

      unless issue_scope_checker.call(parent_issue)
        not_found_renderer.call(:error_canvas_gantt_parent_task_not_found)
        return :invalid
      end

      # No hierarchy change: keep current parent without failing cycle checks.
      return parent_issue if source_issue.parent_id == parent_issue.id

      # Reject only when trying to move under own descendant.
      if source_issue.descendants.exists?(parent_issue.id)
        validation_error_renderer.call(:error_canvas_gantt_cannot_move_under_own_descendant)
        return :invalid
      end

      parent_issue
    rescue ActiveRecord::RecordNotFound
      not_found_renderer.call(:error_canvas_gantt_parent_task_not_found)
      :invalid
    end
  end
end
