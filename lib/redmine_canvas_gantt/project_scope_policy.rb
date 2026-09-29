# frozen_string_literal: true

require 'set'

module RedmineCanvasGantt
  # Resolves the project candidates shown by Canvas Gantt and the project IDs
  # that may be used for issue reads and operations. Project visibility and
  # activity always bound the candidate set; cross-root issue access also
  # requires the target project's Canvas Gantt permission.
  class ProjectScopePolicy
    CURRENT_TREE = 'current_tree'.freeze
    MEMBER_ALL = 'member_all'.freeze
    CROSS_ROOT_PERMISSION_REASON = 'missing_canvas_gantt_permission'.freeze

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

    def candidate_options(projects:, mode:)
      records = Array(projects)
      return [] if records.empty?

      candidate_mode = normalize_mode(mode)
      tree_ids = descendant_project_ids.to_set
      permitted_ids = if candidate_mode == MEMBER_ALL
                        external_ids = records.map(&:id).reject { |id| tree_ids.include?(id.to_i) }
                        permitted_candidate_ids(external_ids)
                      else
                        Set.new
                      end

      records.map do |project|
        in_current_tree = tree_ids.include?(project.id.to_i)
        selectable = candidate_mode == CURRENT_TREE || in_current_tree || permitted_ids.include?(project.id.to_i)
        option = {
          id: project.id,
          name: project.name,
          identifier: project.identifier,
          selectable: selectable
        }
        option[:disabled_reason] = CROSS_ROOT_PERMISSION_REASON unless selectable
        option
      end
    end

    # Root and descendant project scope remains the existing Canvas boundary.
    # Only an explicitly selected, visible, active member project outside that
    # tree can extend issue access, and its target-side plugin permission is
    # checked from current Redmine roles on every request.
    def allowed_issue_project_ids(mode:, descendant_project_ids: self.descendant_project_ids)
      tree_ids = Array(descendant_project_ids).map(&:to_i).uniq & self.descendant_project_ids
      return tree_ids unless normalize_mode(mode) == MEMBER_ALL && @current_user

      external_ids = candidate_projects(mode: MEMBER_ALL)
        .where.not(id: tree_ids)
        .where(Project.allowed_to_condition(@current_user, :view_canvas_gantt))
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

    def permitted_candidate_ids(project_ids)
      return Set.new if project_ids.empty? || !@current_user

      Project.where(id: project_ids)
        .where(Project.allowed_to_condition(@current_user, :view_canvas_gantt))
        .pluck(:id).map(&:to_i).to_set
    end
  end
end
