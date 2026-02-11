class CanvasGanttsController < ApplicationController
  I18N_LABELS = {
    field_id: :field_id,
    field_start_date: :field_start_date,
    field_due_date: :field_due_date,
    field_assigned_to: :field_assigned_to,
    field_done_ratio: :field_done_ratio,
    button_edit: :button_edit,
    button_delete: :button_delete,
    button_save: :button_save,
    button_cancel: :button_cancel,
    field_subject: :field_subject,
    field_status: :field_status,
    label_day_plural: :label_day_plural,
    label_relations_remove_heading: :label_relations_remove_heading,
    label_relation_remove: :label_relation_remove,
    label_relation_removed: :label_relation_removed,
    label_relation_remove_failed: :label_relation_remove_failed,
    label_relation_added: :label_relation_added,
    label_relation_already_exists: :label_relation_already_exists,
    label_add_child_task: :button_add_subtask,
    label_issue_new: :label_issue_new,
    label_unassigned: :label_unassigned,
    text_are_you_sure: :text_are_you_sure,
    label_filter: :label_filter,
    label_filter_tasks: :label_filter_tasks,
    label_filter_by_subject: :label_filter_by_subject,
    label_clear_filter: :button_clear,
    label_column_plural: :label_column_plural,
    button_reset: :button_reset,
    label_progress_line: :label_progress_line,
    label_group_by_project: :label_group_by_project,
    label_group_by_assignee: :label_group_by_assignee,
    label_previous_month: :label_previous_month,
    label_next_month: :label_next_month,
    label_today: :label_today,
    button_top: :button_top,
    label_toggle_sidebar: :label_toggle_sidebar,
    label_month: :label_month,
    label_week: :label_week,
    label_day: :label_day,
    label_loading: :label_loading,
    button_expand: :label_expand,
    button_collapse: :label_collapse,
    label_sort_by: :label_sort_by,
    label_project: :label_project,
    label_success: :label_success,
    label_error: :label_error,
    label_delete_task_failed: :label_delete_task_failed,
    label_select_task_to_view_details: :label_select_task_to_view_details,
    label_failed_to_load_edit_options: :label_failed_to_load_edit_options,
    label_invalid_date_range: :label_invalid_date_range,
    label_custom_field_plural: :label_custom_field_plural,
    label_must_be_0_100: :label_must_be_0_100,
    label_required: :label_required,
    label_too_long: :label_too_long,
    label_too_short: :label_too_short,
    label_invalid_format: :label_invalid_format,
    label_search: :label_search,
    label_failed_to_save: :label_failed_to_save,
    label_yes: :general_text_yes,
    label_no: :general_text_no,
    button_expand_all: :button_expand_all,
    button_collapse_all: :button_collapse_all,
    label_show_subprojects: :label_show_subprojects,
    label_version_plural: :label_version_plural,
    label_project_plural: :label_project_plural,
    field_project: :field_project,
    field_tracker: :field_tracker,
    field_priority: :field_priority,
    field_author: :field_author,
    field_updated_on: :field_updated_on,
    field_category: :field_category,
    field_estimated_hours: :field_estimated_hours,
    field_created_on: :field_created_on,
    field_spent_hours: :label_spent_time,
    field_version: :field_fixed_version,
    label_all_select: :label_all_select,
    label_assigned_to_filter: :label_assigned_to_filter,
    label_project_filter: :label_project_filter,
    label_version_filter: :label_version_filter,
    label_status_filter: :label_status_filter,
    label_organize_by_dependency: :label_organize_by_dependency,
    label_row_height_xs: :label_row_height_xs,
    label_row_height_s: :label_row_height_s,
    label_row_height_m: :label_row_height_m,
    label_row_height_l: :label_row_height_l,
    label_row_height_xl: :label_row_height_xl,
    label_assigned_to_short: :label_assigned_to_short,
    label_project_short: :label_project_short,
    label_version_short: :label_version_short,
    label_status_short: :label_status_short,
    label_progress_short: :label_progress_short,
    label_column_short: :label_column_short,
    label_dependencies_short: :label_dependencies_short,
    label_refresh_failed: :label_refresh_failed,
    label_relation_add_failed: :label_relation_add_failed,
    label_add_new_ticket: :label_issue_new,
    label_show_versions: :label_show_versions,
    label_none: :label_none,
    label_toggle_points_orphans: :label_toggle_points_orphans,
    label_points_short: :label_points_short,
    label_parent_drop_success: :label_parent_drop_success,
    label_parent_drop_invalid_target: :label_parent_drop_invalid_target,
    label_parent_drop_forbidden: :label_parent_drop_forbidden,
    label_parent_drop_conflict: :label_parent_drop_conflict,
    label_parent_drop_failed: :label_parent_drop_failed
  }.freeze

  ISSUE_INCLUDES = [
    :relations_to, :relations_from, :status, :tracker, :assigned_to, :priority,
    :author, :category, :project, :fixed_version
  ].freeze
  EDITABLE_FIELDS = %i[
    subject assigned_to_id status_id done_ratio due_date start_date priority_id
    category_id estimated_hours project_id tracker_id fixed_version_id custom_field_values
  ].freeze
  TASK_PERMITTED_ATTRIBUTES = %i[
    start_date due_date lock_version subject assigned_to_id status_id done_ratio priority_id
    author_id category_id estimated_hours project_id tracker_id fixed_version_id parent_issue_id
  ].freeze
  CUSTOM_FIELD_FORMATS = %w[string int float list bool date text].freeze

  menu_item :canvas_gantt
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'vite_asset_helper').to_s

  helper RedmineCanvasGantt::ViteAssetHelper
  accept_api_auth :data, :edit_meta, :update, :destroy_relation

  before_action :find_project_by_project_id
  before_action :set_permissions
  before_action :ensure_view_permission, only: [:index, :data, :edit_meta]
  before_action :ensure_edit_permission, only: [:update, :destroy_relation]

  # GET /projects/:project_id/canvas_gantt
  def index
    @i18n = I18N_LABELS.transform_values { |label_key| l(label_key) }
    @settings = plugin_settings
  end

  # GET /projects/:project_id/canvas_gantt/data.json
  def data
    begin
      project_ids = descendant_project_ids
      issues = issue_scope(project_ids).to_a

      render json: {
        tasks: build_tasks(issues),
        relations: build_relations(issues),
        versions: build_versions(project_ids),
        statuses: build_statuses,
        project: build_project_payload,
        permissions: @permissions
      }
    rescue => e
      render json: { error: e.message }, status: :internal_server_error
    end
  end

  # GET /projects/:project_id/canvas_gantt/tasks/:id/edit_meta.json
  def edit_meta
    issue = Issue.visible.find(params[:id])
    return unless ensure_issue_in_scope(issue)

    editable = @permissions[:editable] && issue.editable?
    field_editable = build_field_editable(issue, editable)

    statuses = issue.new_statuses_allowed_to(User.current).to_a
    statuses << issue.status if issue.status && !statuses.include?(issue.status)
    statuses = statuses.uniq.sort_by(&:position)

    assignables = issue.assignable_users.to_a
    assignables = assignables.sort_by { |u| u.name.to_s.downcase }

    custom_fields, custom_field_values = extract_custom_fields(issue, field_editable)

    render json: {
      task: {
        id: issue.id,
        subject: issue.subject,
        assigned_to_id: issue.assigned_to_id,
        status_id: issue.status_id,
        done_ratio: issue.done_ratio,
        due_date: issue.due_date,
        lock_version: issue.lock_version
      },
      editable: field_editable,
      options: {
        statuses: statuses.map { |s| { id: s.id, name: s.name } },
        assignees: assignables.map { |u| { id: u.id, name: u.name } },
        priorities: IssuePriority.active.map { |p| { id: p.id, name: p.name } },
        categories: issue.project.issue_categories.map { |c| { id: c.id, name: c.name } },
        projects: Project.allowed_to(:add_issues).active.map { |p| { id: p.id, name: p.name } },
        trackers: issue.project.trackers.map { |t| { id: t.id, name: t.name } },
        versions: issue.project.shared_versions.map { |v| { id: v.id, name: v.name } },
        custom_fields: custom_fields
      },
      custom_field_values: custom_field_values,
      permissions: @permissions
    }
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Task not found' }, status: :not_found
  rescue => e
    render json: { error: e.message }, status: :internal_server_error
  end

  # PATCH /projects/:project_id/canvas_gantt/tasks/:id.json
  def update
    issue = Issue.visible.find(params[:id])
    return unless ensure_issue_in_scope(issue)
    return unless ensure_issue_editable(issue)
    parent_issue = load_parent_issue(issue, params.dig(:task, :parent_issue_id))
    return unless parent_issue != :invalid

    # Optimistic Locking Check handled by ActiveRecord automatically if lock_version is present
    issue.init_journal(User.current)
    issue.safe_attributes = permitted_task_params

    if issue.save
      render json: {
        status: 'ok',
        lock_version: issue.lock_version,
        task_id: issue.id,
        parent_id: issue.parent_id,
        sibling_position: 'tail'
      }
    else
      render json: { errors: issue.errors.full_messages }, status: :unprocessable_entity
    end
  rescue ActiveRecord::StaleObjectError
    render json: { error: 'Conflict: This task has been updated by another user. Please reload.' }, status: :conflict
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Task not found' }, status: :not_found
  end

  # DELETE /projects/:project_id/canvas_gantt/relations/:id.json
  def destroy_relation
    relation = IssueRelation.find(params[:id])

    issue_from = relation.issue_from
    issue_to = relation.issue_to

    if issue_from.nil? || issue_to.nil?
      render json: { error: 'Relation not found' }, status: :not_found
      return
    end

    # Relations can be cross-project. Allow deletion when either side belongs to this project.
    owned_issue = [issue_from, issue_to].find { |issue| issue.project_id == @project.id }
    unless owned_issue
      render json: { error: 'Relation not found in this project' }, status: :not_found
      return
    end

    unless @permissions[:editable] && owned_issue.editable?
      render json: { error: 'Permission denied' }, status: :forbidden
      return
    end

    relation.destroy
    render json: { status: 'ok' }
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Relation not found' }, status: :not_found
  rescue => e
    render json: { error: e.message }, status: :internal_server_error
  end

  private

  def ensure_view_permission
    return if @permissions[:viewable]

    respond_to do |format|
      format.json { render json: { error: 'Permission denied' }, status: :forbidden }
      format.any { deny_access }
    end
    false
  end

  def ensure_edit_permission
    unless @permissions[:editable]
      render json: { error: 'Permission denied' }, status: :forbidden
      return false
    end
  end

  def set_permissions
    @permissions ||= {
      editable: User.current.allowed_to?(:edit_issues, @project),
      viewable: User.current.allowed_to?(:view_canvas_gantt, @project)
    }
  end

  def plugin_settings
    @plugin_settings ||= Setting.plugin_redmine_canvas_gantt || {}
  end

  def descendant_project_ids
    @descendant_project_ids ||= @project.self_and_descendants.pluck(:id)
  end

  def issue_scope(project_ids)
    scope = Issue.visible.where(project_id: project_ids).includes(*ISSUE_INCLUDES)
    scope = scope.where(status_id: params[:status_ids]) if params[:status_ids].present?
    scope
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
        editable: User.current.allowed_to?(:edit_issues, issue.project) && issue.editable?,
        tracker_id: issue.tracker_id,
        tracker_name: issue.tracker&.name,
        fixed_version_id: issue.fixed_version_id,
        priority_id: issue.priority_id,
        priority_name: issue.priority&.name,
        author_id: issue.author_id,
        author_name: issue.author&.name,
        category_id: issue.category_id,
        category_name: issue.category&.name,
        estimated_hours: issue.estimated_hours,
        created_on: issue.created_on,
        updated_on: issue.updated_on,
        spent_hours: issue.spent_hours,
        fixed_version_name: issue.fixed_version&.name
      }
    end
  end

  def build_relations(issues)
    issues.flat_map(&:relations).uniq.map do |relation|
      {
        id: relation.id,
        from: relation.issue_from_id,
        to: relation.issue_to_id,
        type: relation.relation_type
      }
    end
  end

  def build_versions(project_ids)
    Version.visible.where(project_id: project_ids).where.not(effective_date: nil).map do |version|
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

  def build_statuses
    IssueStatus.sorted.map { |status| { id: status.id, name: status.name, is_closed: status.is_closed? } }
  end

  def build_project_payload
    {
      id: @project.id,
      name: @project.name,
      start_date: @project.start_date,
      due_date: @project.due_date
    }
  end

  def ensure_issue_in_scope(issue)
    return true if descendant_project_ids.include?(issue.project_id)

    render json: { error: 'Issue not found in this project' }, status: :not_found
    false
  end

  def ensure_issue_editable(issue)
    return true if User.current.allowed_to?(:edit_issues, issue.project) && issue.editable?

    render json: { error: 'Permission denied' }, status: :forbidden
    false
  end

  def build_field_editable(issue, editable)
    EDITABLE_FIELDS.each_with_object({}) do |field, result|
      result[field] = editable && issue.safe_attribute?(field.to_s)
    end
  end

  def inline_custom_fields_enabled?
    plugin_settings['inline_edit_custom_fields'].to_s == '1'
  end

  def extract_custom_fields(issue, field_editable)
    return [[], {}] unless inline_custom_fields_enabled? && field_editable[:custom_field_values]

    custom_fields = []
    custom_field_values = {}

    issue.custom_field_values.each do |custom_field_value|
      custom_field = custom_field_value.custom_field
      next unless custom_field
      next if custom_field.multiple?
      next unless CUSTOM_FIELD_FORMATS.include?(custom_field.field_format.to_s)

      custom_fields << {
        id: custom_field.id,
        name: custom_field.name,
        field_format: custom_field.field_format,
        is_required: custom_field.is_required,
        regexp: custom_field.regexp,
        min_length: custom_field.min_length,
        max_length: custom_field.max_length,
        possible_values: custom_field.field_format.to_s == 'list' ? custom_field.possible_values : nil,
        text_formatting: custom_field.field_format.to_s == 'text' ? safe_text_formatting(custom_field) : nil
      }
      custom_field_values[custom_field.id.to_s] = custom_field_value.value
    end

    [custom_fields, custom_field_values]
  end

  def safe_text_formatting(custom_field)
    custom_field.text_formatting
  rescue StandardError
    nil
  end

  def permitted_task_params
    params.require(:task).permit(*(TASK_PERMITTED_ATTRIBUTES + [{ custom_field_values: {} }]))
  end

  def load_parent_issue(source_issue, raw_parent_issue_id)
    return nil if raw_parent_issue_id.blank?

    parent_issue = Issue.visible.find(raw_parent_issue_id)
    unless ensure_issue_in_scope(parent_issue)
      return :invalid
    end

    if parent_issue.id == source_issue.id
      render json: { errors: ['A task cannot be a child of itself.'] }, status: :unprocessable_entity
      return :invalid
    end

    # No hierarchy change: keep current parent without failing cycle checks.
    return parent_issue if source_issue.parent_id == parent_issue.id

    # Reject only when trying to move under own descendant.
    if source_issue.descendants.exists?(parent_issue.id)
      render json: { errors: ['Cannot move a task under its own descendant.'] }, status: :unprocessable_entity
      return :invalid
    end

    parent_issue
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Parent task not found' }, status: :not_found
    :invalid
  end
end
