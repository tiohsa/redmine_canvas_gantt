# frozen_string_literal: true

module RedmineCanvasGantt
  # Resolves the project candidates shown by Canvas Gantt and the project IDs
  # that may be used for issue reads and operations. Project visibility and
  # activity always bound the candidate set.
  class ProjectScopePolicy
    CURRENT_TREE = 'current_tree'.freeze
    MEMBER_ALL = 'member_all'.freeze

    def initialize(project:, current_user:)
      @project = project
      @current_user = current_user
    end

    def candidate_projects(mode:)
      return Project.none unless @current_user

      candidates = Project.visible(@current_user).active
      if normalize_mode(mode) == MEMBER_ALL
        return candidates if admin?

        principal_ids = member_principal_ids
        return Project.none if principal_ids.empty?

        candidates.where(id: Member.where(user_id: principal_ids).select(:project_id))
      else
        candidates.where(id: descendant_project_ids)
      end
    end

    def candidate_options(projects:)
      Array(projects).map do |project|
        {
          id: project.id,
          name: project.name,
          identifier: project.identifier,
          selectable: true
        }
      end
    end

    # Root and descendant project scope remains the existing Canvas boundary.
    # Only an explicitly selected, visible, active member project outside that
    # tree can extend issue access.
    def allowed_issue_project_ids(mode:, descendant_project_ids: self.descendant_project_ids)
      tree_ids = Array(descendant_project_ids).map(&:to_i).uniq & self.descendant_project_ids
      return tree_ids unless normalize_mode(mode) == MEMBER_ALL && @current_user

      external_ids = candidate_projects(mode: MEMBER_ALL)
        .where.not(id: tree_ids)
        .pluck(:id)
      (tree_ids + external_ids.map(&:to_i)).uniq
    end

    def mode_for(member_projects_only)
      member_projects_only ? MEMBER_ALL : CURRENT_TREE
    end

    def selection_explicit?(params)
      PROJECT_SELECTION_PARAMS.any? { |key| params.key?(key) || params.key?(key.to_sym) }
    end

    def self.parse_project_id_list(values)
      tokens = Array(values).flat_map { |value| value.to_s.split(/[|,]/) }
        .map(&:strip).reject(&:blank?)
      return [] if tokens.empty?

      invalid_tokens = tokens.reject do |token|
        %w[none _none].include?(token) || (token.match?(/\A\d+\z/) && token.to_i.positive?)
      end
      raise ArgumentError, 'Invalid project IDs' if invalid_tokens.any?

      tokens.reject { |token| %w[none _none].include?(token) }.map(&:to_i).uniq
    end

    def self.validate_project_selection!(params)
      PROJECT_SELECTION_PARAMS.each do |key|
        next unless params.key?(key) || params.key?(key.to_sym)

        parse_project_id_list(params[key])
      end
      true
    end

    PROJECT_SELECTION_PARAMS = %w[canvas_project_ids project_ids].freeze

    private

    def normalize_mode(mode)
      mode == true || mode.to_s == MEMBER_ALL ? MEMBER_ALL : CURRENT_TREE
    end

    def admin?
      @current_user.respond_to?(:admin?) && @current_user.admin?
    end

    def descendant_project_ids
      @descendant_project_ids ||= @project.self_and_descendants.pluck(:id).map(&:to_i).uniq
    end

    def member_principal_ids
      return [] unless @current_user&.id

      group_ids = if @current_user.respond_to?(:groups)
                    groups = @current_user.groups
                    if groups.respond_to?(:where)
                      groups.where.not(type: %w[GroupAnonymous GroupNonMember]).pluck(:id)
                    elsif groups.respond_to?(:pluck)
                      groups.pluck(:id)
                    else
                      Array(groups).filter_map do |group|
                        group.id unless group.respond_to?(:builtin?) && group.builtin?
                      end
                    end
                  else
                    []
                  end

      ([@current_user.id] + group_ids).map(&:to_i).select(&:positive?).uniq
    end
  end
end
