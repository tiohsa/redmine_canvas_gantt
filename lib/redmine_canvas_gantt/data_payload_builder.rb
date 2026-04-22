require 'set'

module RedmineCanvasGantt
  class DataPayloadBuilder
    def initialize(custom_field_extractor:, current_user:)
      @custom_field_extractor = custom_field_extractor
      @current_user = current_user
    end

    def build(project:, permissions:, project_ids:, issues:, filter_option_projects:, filter_option_issues:, initial_state: nil, warnings: [], baseline: nil)
      {
        tasks: build_tasks(issues),
        custom_fields: @custom_field_extractor.build_project_custom_fields(project_ids, issues),
        relations: build_relations(issues),
        versions: build_versions(project_ids),
        filter_options: build_filter_options(projects: filter_option_projects, issues: filter_option_issues),
        statuses: build_statuses,
        project: build_project_payload(project),
        permissions: permissions,
        initial_state: initial_state,
        baseline: build_baseline_payload(baseline),
        warnings: warnings.presence
      }.compact
    end

    def build_tasks(issues)
      issues.each_with_index.map do |issue, idx|
        {
          id: issue.id,
          subject: issue.subject,
          project_id: issue.project_id,
          project_name: issue.project.name,
          display_order: idx,
          start_date: issue.start_date,
          due_date: issue.due_date,
          ratio_done: issue.done_ratio,
          status_id: issue.status_id,
          status_name: issue.status.name,
          assigned_to_id: issue.assigned_to_id,
          assigned_to_name: issue.assigned_to&.name,
          parent_id: issue.parent_id,
          lock_version: issue.lock_version,
          editable: @current_user.allowed_to?(:edit_issues, issue.project) && issue.editable?,
          tracker_id: issue.tracker_id,
          tracker_name: issue.tracker&.name,
          fixed_version_id: issue.fixed_version_id,
          priority_id: issue.priority_id,
          priority_name: issue.priority&.name,
          priority_position: issue.priority&.position,
          author_id: issue.author_id,
          author_name: issue.author&.name,
          category_id: issue.category_id,
          category_name: issue.category&.name,
          estimated_hours: issue.estimated_hours,
          created_on: issue.created_on,
          updated_on: issue.updated_on,
          spent_hours: issue.spent_hours,
          fixed_version_name: issue.fixed_version&.name,
          custom_field_values: @custom_field_extractor.build_task_custom_field_values(issue)
        }
      end
    end

    def build_relations(issues)
      visible_ids = issues.map(&:id).to_set
      issues.flat_map(&:relations).uniq.filter do |relation|
        visible_ids.include?(relation.issue_from_id) && visible_ids.include?(relation.issue_to_id)
      end.map do |relation|
        serialize_relation(relation)
      end
    end

    def build_versions(project_ids)
      Version.visible.where(project_id: project_ids).map do |version|
        {
          id: version.id,
          name: version.name,
          effective_date: version.effective_date,
          start_date: version.try(:start_date),
          completed_percent: version.completed_percent,
          project_id: version.project_id,
          status: version.status
        }
      end
    end

    def build_filter_options(projects:, issues:)
      {
        projects: build_project_options(projects),
        assignees: build_assignee_options(issues)
      }
    end

    def build_project_options(projects)
      projects
        .map { |entry| { id: entry.id, name: entry.name } }
        .sort_by { |entry| entry[:name].to_s.downcase }
    end

    def build_assignee_options(issues)
      grouped = {}

      issues.each do |issue|
        assignee_id = issue.assigned_to_id
        grouped[assignee_id] ||= {
          id: assignee_id,
          name: assignee_id.nil? ? nil : issue.assigned_to&.name,
          project_ids: Set.new
        }
        grouped[assignee_id][:name] ||= issue.assigned_to&.name if assignee_id
        grouped[assignee_id][:project_ids] << issue.project_id.to_s if issue.project_id.present?
      end

      grouped.values.map do |entry|
        {
          id: entry[:id],
          name: entry[:name],
          project_ids: entry[:project_ids].to_a.sort
        }
      end.sort_by do |entry|
        [entry[:id].nil? ? 0 : 1, entry[:name].to_s.downcase]
      end
    end

    def build_statuses
      IssueStatus.sorted.map { |status| { id: status.id, name: status.name, is_closed: status.is_closed? } }
    end

    def build_project_payload(project)
      {
        id: project.id,
        name: project.name,
        start_date: project.start_date,
        due_date: project.due_date
      }
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

    def build_baseline_payload(baseline)
      return nil if baseline.nil?

      if baseline.respond_to?(:to_payload_hash)
        baseline.to_payload_hash
      elsif baseline.is_a?(Hash)
        baseline
      end
    end
  end
end
