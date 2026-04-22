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
      query_resolution = query_state_resolver.resolve(project_ids: descendant_project_ids)
      issues = query_resolution[:issues]
      issue_ids = issues.map(&:id).to_set
      visible_project_ids = issues.map(&:project_id).uniq

      {
        issues: issues,
        issue_ids: issue_ids,
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
  end
end
