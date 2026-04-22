module RedmineCanvasGantt
  class EditMetaPayloadBuilder
    def initialize(current_user:, issue_priority_class: IssuePriority, project_class: Project, version_class: Version)
      @current_user = current_user
      @issue_priority_class = issue_priority_class
      @project_class = project_class
      @version_class = version_class
    end

    def build(issue:, editable:, custom_fields:, custom_field_values:, permissions:, visible_project_ids:)
      {
        task: {
          id: issue.id,
          subject: issue.subject,
          assigned_to_id: issue.assigned_to_id,
          status_id: issue.status_id,
          done_ratio: issue.done_ratio,
          due_date: issue.due_date,
          start_date: issue.start_date,
          priority_id: issue.priority_id,
          category_id: issue.category_id,
          estimated_hours: issue.estimated_hours,
          project_id: issue.project_id,
          tracker_id: issue.tracker_id,
          fixed_version_id: issue.fixed_version_id,
          lock_version: issue.lock_version
        },
        editable: editable,
        options: {
          statuses: statuses_for(issue),
          assignees: assignables_for(issue),
          priorities: @issue_priority_class.active.sort_by(&:position).map do |priority|
            { id: priority.id, name: priority.name, position: priority.position }
          end,
          categories: issue.project.issue_categories.map { |category| { id: category.id, name: category.name } },
          projects: project_options_for(visible_project_ids),
          trackers: issue.project.trackers.map { |tracker| { id: tracker.id, name: tracker.name } },
          versions: @version_class.visible.where(project_id: issue.project_id).map { |version| { id: version.id, name: version.name } },
          custom_fields: custom_fields
        },
        custom_field_values: custom_field_values,
        permissions: permissions
      }
    end

    private

    def statuses_for(issue)
      statuses = issue.new_statuses_allowed_to(@current_user).to_a
      statuses << issue.status if issue.status && !statuses.include?(issue.status)
      statuses.uniq.sort_by(&:position).map { |status| { id: status.id, name: status.name } }
    end

    def assignables_for(issue)
      issue.assignable_users.to_a
        .sort_by { |user| user.name.to_s.downcase }
        .map { |user| { id: user.id, name: user.name } }
    end

    def project_options_for(visible_project_ids)
      @project_class.allowed_to(:add_issues)
        .active
        .where(id: visible_project_ids)
        .map { |project| { id: project.id, name: project.name } }
    end
  end
end
