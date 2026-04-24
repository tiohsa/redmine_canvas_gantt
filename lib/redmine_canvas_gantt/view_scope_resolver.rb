require 'set'

module RedmineCanvasGantt
  class ViewScopeResolver
    def initialize(project:, params:, current_user:, issue_includes:, member_project_ids_resolver: nil)
      @project = project
      @params = params
      @current_user = current_user
      @issue_includes = issue_includes
      @member_project_ids_resolver = member_project_ids_resolver
    end

    def resolve
      resolved_scope_project_ids = scope_project_ids
      query_resolution = query_state_resolver.resolve(project_ids: resolved_scope_project_ids)
      issues = query_resolution[:issues]
      issue_ids = issues.map(&:id).to_set
      visible_project_ids = issues.map(&:project_id).uniq

      {
        issues: issues,
        issue_ids: issue_ids,
        scope_project_ids: resolved_scope_project_ids,
        visible_project_ids: visible_project_ids,
        initial_state: query_resolution[:initial_state],
        warnings: query_resolution[:warnings]
      }
    end

    private

    def query_state_resolver
      @query_state_resolver ||= RedmineCanvasGantt::QueryStateResolver.new(
        project: @project,
        params: @params,
        current_user: @current_user,
        issue_scope: Issue.visible,
        issue_includes: @issue_includes
      )
    end

    def descendant_project_ids
      @descendant_project_ids ||= @project.self_and_descendants.pluck(:id)
    end

    def base_project_ids
      return descendant_project_ids unless member_projects_only?

      member_project_ids
    end

    def member_projects_only?
      ActiveModel::Type::Boolean.new.cast(@params[:member_projects_only])
    end

    def member_project_ids
      ids = if @member_project_ids_resolver
              Array(@member_project_ids_resolver.call)
            else
              []
            end

      ids.map(&:to_i).select(&:positive?).uniq
    end

    def scope_project_ids
      base_ids = base_project_ids
      explicit_ids = parse_integer_list(@params[:project_ids])
      return base_ids if explicit_ids.blank?

      explicit_ids & base_ids
    end

    def parse_integer_list(values)
      Array(values)
        .flat_map { |value| value.to_s.split(/[|,]/) }
        .filter_map { |value| Integer(value, exception: false) }
        .select(&:positive?)
        .uniq
    end
  end
end
