require_relative 'spent_hours_batch'

module RedmineCanvasGantt
  class IssueSelector
    def initialize(issue_scope:, issue_includes:, data_payload_budget: nil)
      @issue_scope = issue_scope
      @issue_includes = issue_includes
      @data_payload_budget = data_payload_budget
    end

    def call(query_issue_scope:, project_ids:, redmine_project_ids:, state:, scope_only: false, none_filters: [])
      scope = issues_scope_for(
        query_issue_scope: query_issue_scope,
        project_ids: project_ids,
        redmine_project_ids: redmine_project_ids,
        state: state,
        none_filters: none_filters
      )
      return scope.except(:includes, :order) if scope_only

      issues = if @data_payload_budget
                 @data_payload_budget.load_records(
                   scope,
                   resource: 'issues',
                   limit: @data_payload_budget.issue_limit
                 )
               else
                 scope.to_a
               end
      sort_issues!(issues, state[:sort_config])
      issues
    end

    private

    def issues_scope_for(query_issue_scope:, project_ids:, redmine_project_ids:, state:, none_filters:)
      scope = @issue_scope.where(project_id: project_ids)
      scope = scope.where(project_id: redmine_project_ids) unless redmine_project_ids.nil?
      scope = scope.where(id: []) if none_filters.any?
      scope = scope.where(id: query_issue_scope) if query_issue_scope
      scope = scope.where(status_id: state[:selected_status_ids]) if state[:selected_status_ids].present?
      scope = apply_version_filter(scope, state[:selected_version_ids]) if state[:selected_version_ids].present?
      scope = apply_assignee_filter(scope, state[:selected_assignee_ids]) if state[:selected_assignee_ids].present?
      scope = scope.where(tracker_id: state[:selected_tracker_ids]) if state[:selected_tracker_ids].present?
      scope.includes(*@issue_includes)
    end

    def apply_assignee_filter(scope, selected_assignee_ids)
      include_none = selected_assignee_ids.include?(nil)
      numeric_ids = selected_assignee_ids.compact
      return scope.where(assigned_to_id: nil) if include_none && numeric_ids.empty?
      return scope.where(assigned_to_id: numeric_ids) unless include_none

      scope.where(assigned_to_id: numeric_ids).or(scope.where(assigned_to_id: nil))
    end

    def apply_version_filter(scope, selected_version_ids)
      include_none = selected_version_ids.include?('_none')
      numeric_ids = selected_version_ids.filter_map { |id| Integer(id, exception: false) }

      return scope.where(fixed_version_id: nil) if include_none && numeric_ids.empty?
      return scope.where(fixed_version_id: numeric_ids) unless include_none

      scope.where(fixed_version_id: numeric_ids).or(scope.where(fixed_version_id: nil))
    end

    def sort_issues!(issues, sort_config)
      return if sort_config.blank?

      spent_hours = sort_config[:key] == 'spentHours' ? SpentHoursBatch.for(issues) : nil
      values = issues.to_h { |issue| [issue.id, spent_hours ? spent_hours.fetch(issue.id, 0.0) : issue_sort_value(issue, sort_config[:key])] }
      issues.sort! do |left, right|
        left_value = values[left.id]
        right_value = values[right.id]
        comparison = if left_value.nil? || right_value.nil?
                       (left_value.nil? ? 1 : 0) <=> (right_value.nil? ? 1 : 0)
                     else
                       left_value <=> right_value
                     end
        comparison = -comparison if sort_config[:direction] == 'desc' && !left_value.nil? && !right_value.nil?
        comparison.zero? ? left.id <=> right.id : comparison
      end
    end

    def issue_sort_value(issue, key)
      case key
      when 'id' then issue.id
      when 'subject' then issue.subject.to_s.downcase
      when 'projectName' then issue.project&.name&.downcase
      when 'trackerName' then issue.tracker&.name&.downcase
      when 'statusId' then issue.status_id
      when 'priorityId' then issue.priority_id
      when 'assignedToName' then issue.assigned_to&.name&.downcase
      when 'authorName' then issue.author&.name&.downcase
      when 'startDate' then issue.start_date
      when 'dueDate' then issue.due_date
      when 'estimatedHours' then issue.estimated_hours
      when 'ratioDone' then issue.done_ratio
      when 'fixedVersionName' then issue.fixed_version&.name&.downcase
      when 'categoryName' then issue.category&.name&.downcase
      when 'createdOn' then issue.created_on
      when 'updatedOn' then issue.updated_on
      when 'spentHours' then issue.spent_hours
      else issue.id
      end
    end
  end
end
