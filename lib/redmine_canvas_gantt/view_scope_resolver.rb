require 'set'

module RedmineCanvasGantt
  class ViewScopeResolver
    def initialize(project:, params:, current_user:, issue_includes:)
      @project = project
      @params = params
      @current_user = current_user
      @issue_includes = issue_includes
    end

    def resolve
      resolved_scope_project_ids = project_scope_ids
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

    # Operation endpoints need only the Canvas project boundary.  Keep this
    # separate from #resolve so capability previews and mutations never load
    # the filtered Issue collection merely to authorize one already-visible
    # Issue.
    def project_scope_ids
      @project_scope_ids ||= resolved_project_scope_ids
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

    def resolved_project_scope_ids
      query_state_resolver.bounded_project_ids(project_ids: descendant_project_ids)
    end
  end
end
