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
    label_prev_month: :label_prev_month,
    label_next_month: :label_next_month,
    label_today: :label_today,
    button_top: :button_top,
    label_toggle_sidebar: :label_toggle_sidebar,
    label_maximize_left_pane: :label_maximize_left_pane,
    label_maximize_right_pane: :label_maximize_right_pane,
    label_restore_split_view: :label_restore_split_view,
    label_month: :label_month,
    label_week: :label_week,
    label_day: :label_day,
    label_loading: :label_loading,
    label_notifications: :label_notifications,
    label_peak: :label_peak,
    label_total: :label_total,
    label_workload: :label_workload,
    label_show_workload: :label_show_workload,
    label_capacity_threshold: :label_capacity_threshold,
    label_leaf_issues_only: :label_leaf_issues_only,
    label_include_closed_issues: :label_include_closed_issues,
    label_today_onward_only: :label_today_onward_only,
    label_edit_query_in_redmine: :label_edit_query_in_redmine,
    label_edit_query_in_redmine_tooltip: :label_edit_query_in_redmine_tooltip,
    label_critical_path_total_slack: :label_critical_path_total_slack,

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
    label_status_completed: :label_status_completed,
    label_status_incomplete: :label_status_incomplete,
    label_assigned_to_filter: :label_assigned_to_filter,
    label_project_filter: :label_project_filter,
    label_version_filter: :label_version_filter,
    label_status_filter: :label_status_filter,
    label_organize_by_dependency: :label_organize_by_dependency,
    label_row_height: :label_row_height,
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
    label_dependency_edit_mode: :label_dependency_edit_mode,
    label_relation_type_precedes_info: :label_relation_type_precedes_info,
    label_relation_type_relates_info: :label_relation_type_relates_info,
    label_relation_type_blocks_info: :label_relation_type_blocks_info,
    label_relation_type_precedes: :label_relation_type_precedes,
    label_relation_type_relates: :label_relation_type_relates,
    label_relation_type_blocks: :label_relation_type_blocks,
    label_relation_create: :label_relation_create,
    label_relation_type: :label_relation_type,
    label_relation_auto_calculate_delay: :label_relation_auto_calculate_delay,
    label_relation_auto_apply_default: :label_relation_auto_apply_default,
    label_auto_schedule_move_mode: :label_auto_schedule_move_mode,
    label_auto_schedule_move_mode_off: :label_auto_schedule_move_mode_off,
    label_auto_schedule_move_mode_constraint_push: :label_auto_schedule_move_mode_constraint_push,
    label_auto_schedule_move_mode_linked_shift: :label_auto_schedule_move_mode_linked_shift,
    label_relation_delay_auto_calc_unavailable: :label_relation_delay_auto_calc_unavailable,
    label_relation_delay_invalid: :label_relation_delay_invalid,
    label_relation_delay_required: :label_relation_delay_required,
    label_relation_delay_mismatch: :label_relation_delay_mismatch,
    label_relation_updated: :label_relation_updated,
    label_relation_title: :label_relation_title,
    label_delay: :label_delay,
    label_scheduling_state_unscheduled: :label_scheduling_state_unscheduled,
    label_scheduling_state_invalid: :label_scheduling_state_invalid,
    label_scheduling_state_conflicted: :label_scheduling_state_conflicted,
    label_scheduling_state_cyclic: :label_scheduling_state_cyclic,
    label_scheduling_state_incomplete_dates: :label_scheduling_state_incomplete_dates,
    label_add_new_ticket: :label_issue_new,
    label_show_versions: :label_show_versions,
    label_none: :label_none,
    label_toggle_points_orphans: :label_toggle_points_orphans,
    label_points_short: :label_points_short,
    label_parent_drop_success: :label_parent_drop_success,
    label_parent_drop_unset_success: :label_parent_drop_unset_success,
    label_unset_parent_task: :label_unset_parent_task,
    label_parent_drop_invalid_target: :label_parent_drop_invalid_target,
    label_parent_drop_forbidden: :label_parent_drop_forbidden,
    label_parent_drop_conflict: :label_parent_drop_conflict,
    label_parent_drop_failed: :label_parent_drop_failed,
    label_issue: :label_issue,
    label_new: :label_new,
    label_bulk_subtask_creation: :label_bulk_subtask_creation,
    placeholder_bulk_subtask_creation: :placeholder_bulk_subtask_creation,
    label_bulk_subtask_creation_success: :label_bulk_subtask_creation_success,
    label_bulk_subtask_creation_partial_fail: :label_bulk_subtask_creation_partial_fail,
    button_create: :button_create,
    label_export: :label_export,
    label_export_png: :label_export_png,
    label_export_csv: :label_export_csv,
    label_export_unavailable: :label_export_unavailable,
    label_export_failed: :label_export_failed,
    label_save_baseline: :label_save_baseline,
    label_saving_baseline: :label_saving_baseline,
    label_show_baseline: :label_show_baseline,
    label_hide_baseline_tooltip: :label_hide_baseline_tooltip,
    label_show_baseline_tooltip: :label_show_baseline_tooltip,
    label_save_baseline_tooltip: :label_save_baseline_tooltip,
    label_save_baseline_filtered: :label_save_baseline_filtered,
    label_save_baseline_project: :label_save_baseline_project,
    label_baseline_saved: :label_baseline_saved,
    label_baseline_save_failed: :label_baseline_save_failed,
    label_baseline_comparison: :label_baseline_comparison,
    label_baseline_duration: :label_baseline_duration,
    label_baseline_saved_meta: :label_baseline_saved_meta,
    label_baseline_scope: :label_baseline_scope,
    label_baseline_scope_filtered: :label_baseline_scope_filtered,
    label_baseline_scope_project: :label_baseline_scope_project,
    label_no_baseline_for_task: :label_no_baseline_for_task,
    label_baseline_diff_exists: :label_baseline_diff_exists,
    label_baseline_diff_none: :label_baseline_diff_none,
    label_help: :label_help,
    help_label_layout_filters: :help_label_layout_filters,
    label_help_toolbar_icons: :label_help_toolbar_icons,
    help_desc_edit_query: :help_desc_edit_query,
    help_desc_workload: :help_desc_workload,
    help_desc_maximize_left: :help_desc_maximize_left,
    help_desc_maximize_right: :help_desc_maximize_right,
    help_desc_issue_new: :help_desc_issue_new,
    help_desc_filter_tasks: :help_desc_filter_tasks,
    help_desc_columns: :help_desc_columns,
    help_desc_assignee_filter: :help_desc_assignee_filter,
    help_desc_project_filter: :help_desc_project_filter,
    help_desc_version_filter: :help_desc_version_filter,
    help_desc_status_filter: :help_desc_status_filter,
    help_desc_progress_line: :help_desc_progress_line,
    help_desc_dependency_settings: :help_desc_dependency_settings,
    help_desc_export: :help_desc_export,
    help_desc_organize_by_dependency: :help_desc_organize_by_dependency,
    help_desc_points_orphans: :help_desc_points_orphans,
    help_label_timeline_view: :help_label_timeline_view,
    help_desc_prev_next_month: :help_desc_prev_next_month,
    help_desc_today: :help_desc_today,
    help_label_zoom: :help_label_zoom,
    help_desc_zoom: :help_desc_zoom,
    help_desc_row_height: :help_desc_row_height,
    help_label_fullscreen: :help_label_fullscreen,
    help_desc_fullscreen: :help_desc_fullscreen,
    help_label_autosave: :help_label_autosave,
    help_desc_autosave: :help_desc_autosave,
    help_label_editing_saving: :help_label_editing_saving,
    help_desc_save: :help_desc_save,
    help_desc_cancel: :help_desc_cancel,
    help_desc_top: :help_desc_top,
    help_label_basic_operations: :help_label_basic_operations,
    help_op_drag_drop: :help_op_drag_drop,
    help_op_drag_drop_desc: :help_op_drag_drop_desc,
    help_op_dependency: :help_op_dependency,
    help_op_dependency_desc: :help_op_dependency_desc,
    help_op_inline_edit: :help_op_inline_edit,
    help_op_inline_edit_desc: :help_op_inline_edit_desc,
    help_op_context_menu: :help_op_context_menu,
    help_op_context_menu_desc: :help_op_context_menu_desc,
    help_op_unscheduled: :help_op_unscheduled,
    help_op_unscheduled_desc: :help_op_unscheduled_desc,
    button_close: :button_close
  }.freeze

  ISSUE_INCLUDES = [
    :relations_to, :relations_from, :status, :tracker, :assigned_to, :priority,
    :author, :category, :project, :fixed_version, { custom_values: :custom_field }
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
  EDITABLE_RELATION_TYPES = %w[precedes follows blocks blocked relates].freeze
  DELAY_RELATION_TYPES = %w[precedes follows].freeze

  menu_item :canvas_gantt
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'vite_asset_helper').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'custom_field_serializer').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'custom_field_extractor').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'data_payload_builder').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'constraint_graph').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'relation_params_normalizer').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'edit_meta_payload_builder').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'relation_change_validator').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'bulk_subtask_creator').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'parent_issue_resolver').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'query_state_resolver').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'baseline_task_state').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'baseline_snapshot').to_s
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'baseline_repository').to_s

  helper RedmineCanvasGantt::ViteAssetHelper
  accept_api_auth :data, :edit_meta, :update, :bulk_create_subtasks, :create_relation, :update_relation, :destroy_relation, :save_baseline

  before_action :find_project_by_project_id
  before_action :set_permissions
  before_action :ensure_view_permission, only: [:index, :data, :edit_meta]
  before_action :ensure_edit_permission, only: [:update, :bulk_create_subtasks, :update_relation, :destroy_relation]
  skip_forgery_protection only: [:asset]
  skip_before_action :find_project_by_project_id, :set_permissions, only: [:asset]

  # GET /plugin_assets/redmine_canvas_gantt/build/*asset_path
  # Fallback asset delivery when public/plugin_assets static serving is disabled.
  def asset
    relative_path = params[:asset_path].to_s
    return head :not_found if relative_path.blank? || relative_path.include?('..')

    build_root = Rails.root.join('plugins', 'redmine_canvas_gantt', 'assets', 'build').to_s
    file_path = File.expand_path(relative_path, build_root)
    return head :not_found unless file_path.start_with?("#{build_root}/") && File.file?(file_path)

    send_file file_path, type: Rack::Mime.mime_type(File.extname(file_path), 'application/octet-stream'), disposition: 'inline'
  end

  # GET /projects/:project_id/canvas_gantt
  def index
    @i18n = I18N_LABELS.transform_values { |label_key| l(:"canvas_gantt.#{label_key}", default: label_key) }
    @settings = plugin_settings
    @non_working_week_days = Array(Setting.non_working_week_days).map(&:to_i).uniq.sort
  end

  # GET /projects/:project_id/canvas_gantt/data.json
  def data
    begin
      project_ids = descendant_project_ids
      resolved_query = query_state_resolver.resolve(project_ids: project_ids)
      baseline_load = baseline_repository.load(project_id: @project.id)

      render json: data_payload_builder.build(
        project: @project,
        permissions: @permissions,
        project_ids: project_ids,
        issues: resolved_query[:issues],
        filter_option_projects: filter_option_projects(project_ids),
        filter_option_issues: filter_option_issues(project_ids),
        initial_state: resolved_query[:initial_state],
        warnings: resolved_query[:warnings] + baseline_load.warnings,
        baseline: baseline_load.snapshot
      )
    rescue => e
      render json: { error: e.message }, status: :internal_server_error
    end
  end

  # POST /projects/:project_id/canvas_gantt/baseline.json
  def save_baseline
    return unless ensure_baseline_edit_permission

    project_ids = descendant_project_ids
    baseline_scope = baseline_save_scope
    return if performed?

    baseline_issues, warnings = baseline_save_issues(baseline_scope, project_ids)
    baseline_snapshot = baseline_repository.build_snapshot(
      project: @project,
      issues: baseline_issues,
      current_user: User.current,
      scope: baseline_scope
    )
    saved_snapshot = baseline_repository.replace(project_id: @project.id, snapshot: baseline_snapshot)

    render json: {
      status: 'ok',
      baseline: saved_snapshot.to_payload_hash,
      warnings: warnings
    }
  rescue ArgumentError => e
    render json: { error: e.message }, status: :unprocessable_entity
  rescue => e
    render json: { error: e.message }, status: :internal_server_error
  end

  # GET /projects/:project_id/canvas_gantt/tasks/:id/edit_meta.json
  def edit_meta
    issue = Issue.visible.find(params[:id])
    return unless ensure_issue_in_scope(issue)

    editable = @permissions[:editable] && issue.editable?
    field_editable = build_field_editable(issue, editable)
    custom_fields, custom_field_values = custom_field_extractor.extract_custom_fields(
      issue,
      inline_custom_fields_enabled? && field_editable[:custom_field_values]
    )

    render json: edit_meta_payload_builder.build(
      issue: issue,
      editable: field_editable,
      custom_fields: custom_fields,
      custom_field_values: custom_field_values,
      permissions: @permissions
    )
  rescue ActiveRecord::RecordNotFound
    render json: { error: l(:error_canvas_gantt_task_not_found) }, status: :not_found
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
      if requested_parent_issue_id_provided? && issue.parent_id != requested_parent_issue_id
        render json: { errors: [l(:error_canvas_gantt_parent_linkage_failed)], parent_id: issue.parent_id }, status: :unprocessable_entity
        return
      end

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
    render json: { error: l(:error_canvas_gantt_conflict_reload) }, status: :conflict
  rescue ActiveRecord::RecordNotFound
    render json: { error: l(:error_canvas_gantt_task_not_found) }, status: :not_found
  end

  # POST /projects/:project_id/canvas_gantt/subtasks/bulk.json
  def bulk_create_subtasks
    parent_issue = Issue.visible.find(params[:parent_issue_id])
    return unless ensure_issue_in_scope(parent_issue)

    unless bulk_subtask_creator.allowed?(parent_issue)
      render json: { error: l(:error_canvas_gantt_permission_denied) }, status: :forbidden
      return
    end

    subjects = Array(params[:subjects])
    if subjects.empty?
      render json: { error: l(:error_canvas_gantt_subjects_non_empty_array) }, status: :unprocessable_entity
      return
    end

    render json: bulk_subtask_creator.call(parent_issue: parent_issue, subjects: subjects)
  rescue ActiveRecord::RecordNotFound
    render json: { error: l(:error_canvas_gantt_parent_task_not_found) }, status: :not_found
  end

  # POST /projects/:project_id/canvas_gantt/relations.json
  def create_relation
    issue_from = Issue.visible.find(relation_params[:issue_from_id])
    issue_to = Issue.visible.find(relation_params[:issue_to_id])
    return unless ensure_relation_createable!(issue_from, issue_to)

    relation = IssueRelation.new(
      issue_from: issue_from,
      issue_to: issue_to
    )

    save_relation_change(
      relation: relation,
      issue_from: issue_from,
      issue_to: issue_to,
      relation_id: '__pending__'
    )
  rescue ActiveRecord::RecordNotFound
    render json: { error: l(:error_canvas_gantt_task_not_found) }, status: :not_found
  rescue => e
    render json: { error: e.message }, status: :internal_server_error
  end

  # PATCH /projects/:project_id/canvas_gantt/relations/:id.json
  def update_relation
    relation = IssueRelation.find(params[:id])
    return unless ensure_relation_editable!(relation)

    save_relation_change(
      relation: relation,
      issue_from: relation.issue_from,
      issue_to: relation.issue_to,
      relation_id: relation.id,
      replacing_relation_id: relation.id
    )
  rescue ActiveRecord::RecordNotFound
    render json: { error: l(:error_canvas_gantt_relation_not_found) }, status: :not_found
  rescue => e
    render json: { error: e.message }, status: :internal_server_error
  end

  # DELETE /projects/:project_id/canvas_gantt/relations/:id.json
  def destroy_relation
    relation = IssueRelation.find(params[:id])
    return unless ensure_relation_editable!(relation)

    relation.destroy
    render json: { status: 'ok' }
  rescue ActiveRecord::RecordNotFound
    render json: { error: l(:error_canvas_gantt_relation_not_found) }, status: :not_found
  rescue => e
    render json: { error: e.message }, status: :internal_server_error
  end

  private

  def ensure_view_permission
    return if @permissions[:viewable]

    respond_to do |format|
      format.json { render json: { error: l(:error_canvas_gantt_permission_denied) }, status: :forbidden }
      format.any { deny_access }
    end
    false
  end

  def ensure_edit_permission
    unless @permissions[:editable]
      render json: { error: l(:error_canvas_gantt_permission_denied) }, status: :forbidden
      return false
    end
  end

  def ensure_baseline_edit_permission
    return true if User.current.allowed_to?(:edit_canvas_gantt, @project)

    render json: { error: l(:error_canvas_gantt_permission_denied) }, status: :forbidden
    false
  end

  def set_permissions
    @permissions ||= {
      editable: User.current.allowed_to?(:edit_issues, @project),
      viewable: User.current.allowed_to?(:view_canvas_gantt, @project),
      baseline_editable: User.current.allowed_to?(:edit_canvas_gantt, @project)
    }
  end

  def plugin_settings
    @plugin_settings ||= Setting.plugin_redmine_canvas_gantt || {}
  end

  def baseline_repository
    @baseline_repository ||= RedmineCanvasGantt::BaselineRepository.new
  end

  def descendant_project_ids
    @descendant_project_ids ||= @project.self_and_descendants.pluck(:id)
  end

  def issue_scope(project_ids)
    scope = Issue.visible.where(project_id: project_ids).includes(*ISSUE_INCLUDES)
    scope = scope.where(status_id: params[:status_ids]) if params[:status_ids].present?
    scope
  end

  def baseline_project_issues(project_ids)
    Issue.visible.where(project_id: project_ids).includes(*ISSUE_INCLUDES).to_a
  end

  def baseline_save_scope
    raw_scope = params[:scope].to_s
    return 'filtered' if raw_scope.blank?
    return raw_scope if RedmineCanvasGantt::BaselineSnapshot::VALID_SCOPES.include?(raw_scope)

    raise ArgumentError, 'scope is invalid'
  end

  def baseline_save_issues(scope, project_ids)
    if scope == 'project'
      [baseline_project_issues(project_ids), []]
    else
      resolved_query = query_state_resolver.resolve(project_ids: project_ids)
      [resolved_query[:issues], resolved_query[:warnings]]
    end
  end

  def query_state_resolver
    @query_state_resolver ||= RedmineCanvasGantt::QueryStateResolver.new(
      project: @project,
      params: params,
      current_user: User.current,
      issue_scope: Issue.visible,
      issue_includes: ISSUE_INCLUDES
    )
  end

  def filter_option_projects(project_ids)
    Project.visible.where(id: project_ids).to_a
  end

  def filter_option_issues(project_ids)
    Issue.visible.where(project_id: project_ids).includes(:assigned_to, :project).to_a
  end

  def ensure_issue_in_scope(issue)
    return true if descendant_project_ids.include?(issue.project_id)

    render json: { error: l(:error_canvas_gantt_issue_not_found_in_project) }, status: :not_found
    false
  end

  def ensure_issue_editable(issue)
    return true if User.current.allowed_to?(:edit_issues, issue.project) && issue.editable?

    render json: { error: l(:error_canvas_gantt_permission_denied) }, status: :forbidden
    false
  end

  def build_field_editable(issue, editable)
    EDITABLE_FIELDS.each_with_object({}) do |field, result|
      result[field] = editable && issue.safe_attribute?(field.to_s)
    end
  end

  def inline_custom_fields_enabled?
    plugin_settings.fetch('inline_edit_custom_fields', '1').to_s == '1'
  end


  def permitted_task_params
    params.require(:task).permit(*(TASK_PERMITTED_ATTRIBUTES + [{ custom_field_values: {} }]))
  end

  def relation_params
    params.require(:relation).permit(:issue_from_id, :issue_to_id, :relation_type, :delay)
  end

  def ensure_relation_editable!(relation)
    issue_from = relation.issue_from
    issue_to = relation.issue_to

    if issue_from.nil? || issue_to.nil?
      render json: { error: l(:error_canvas_gantt_relation_not_found) }, status: :not_found
      return false
    end

    owned_issue = [issue_from, issue_to].find { |issue| descendant_project_ids.include?(issue.project_id) }
    unless owned_issue
      render json: { error: l(:error_canvas_gantt_relation_not_found_in_project) }, status: :not_found
      return false
    end

    unless @permissions[:editable] && owned_issue.editable?
      render json: { error: l(:error_canvas_gantt_permission_denied) }, status: :forbidden
      return false
    end

    true
  end

  def ensure_relation_createable!(issue_from, issue_to)
    return false unless ensure_issue_in_scope(issue_from)
    return false unless ensure_issue_in_scope(issue_to)

    unless @permissions[:editable] && issue_from.editable?
      render json: { error: l(:error_canvas_gantt_permission_denied) }, status: :forbidden
      return false
    end

    true
  end

  def relation_non_working_week_days
    Array(Setting.non_working_week_days).filter_map do |day|
      parsed = Integer(day, exception: false)
      parsed if parsed && parsed.between?(0, 6)
    end.to_set
  end

  def ensure_editable_relation_type!(relation_type)
    return true if EDITABLE_RELATION_TYPES.include?(relation_type)

    render json: { errors: [l(:error_canvas_gantt_relation_type_invalid)] }, status: :unprocessable_entity
    false
  end

  def normalized_relation_delay(relation_type)
    relation_params_normalizer.normalize_delay(relation_type)
  end

  def ensure_relation_change_valid!(issue_from:, issue_to:, relation_id:, relation_type:, delay:, replacing_relation_id: nil)
    relation_change_validator.validate!(
      issue_from: issue_from,
      issue_to: issue_to,
      relation_type: relation_type,
      delay: delay,
      existing_relations: data_payload_builder.build_relations(issue_scope(descendant_project_ids).to_a),
      candidate_relation: build_candidate_relation(
        relation_id: relation_id,
        issue_from: issue_from,
        issue_to: issue_to,
        relation_type: relation_type,
        delay: delay
      ),
      replacing_relation_id: replacing_relation_id,
      error_renderer: lambda { |message_key|
        render json: { errors: [l(message_key)] }, status: :unprocessable_entity
      }
    )
  end

  def save_relation_change(relation:, issue_from:, issue_to:, relation_id:, replacing_relation_id: nil)
    relation_type = relation_params[:relation_type].to_s
    return unless ensure_editable_relation_type!(relation_type)

    delay = normalized_relation_delay(relation_type)
    return if performed?
    return unless ensure_relation_change_valid!(
      issue_from: issue_from,
      issue_to: issue_to,
      relation_id: relation_id,
      relation_type: relation_type,
      delay: delay,
      replacing_relation_id: replacing_relation_id
    )

    relation.relation_type = relation_type
    relation.delay = delay

    render_relation_save_result(relation)
  end

  def build_candidate_relation(relation_id:, issue_from:, issue_to:, relation_type:, delay:)
    {
      id: relation_id,
      from: issue_from.id,
      to: issue_to.id,
      type: relation_type,
      delay: delay
    }
  end

  def render_relation_save_result(relation)
    if relation.save
      render json: { status: 'ok', relation: relation_params_normalizer.serialize_relation(relation) }
    else
      render json: { errors: relation.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def relation_delay_provided?
    relation_payload = params[:relation]
    return false unless relation_payload.respond_to?(:key?)

    relation_payload.key?(:delay) || relation_payload.key?('delay')
  end

  def requested_parent_issue_id_provided?
    task_params = params[:task]
    return false unless task_params.respond_to?(:key?)

    task_params.key?(:parent_issue_id) || task_params.key?('parent_issue_id')
  end

  def requested_parent_issue_id
    raw_parent_issue_id = params.dig(:task, :parent_issue_id)
    return nil if raw_parent_issue_id.blank?

    Integer(raw_parent_issue_id)
  rescue ArgumentError, TypeError
    nil
  end

  def load_parent_issue(source_issue, raw_parent_issue_id)
    parent_issue_resolver.call(
      source_issue: source_issue,
      raw_parent_issue_id: raw_parent_issue_id,
      issue_scope_checker: method(:ensure_issue_in_scope),
      validation_error_renderer: lambda { |message_key|
        render json: { errors: [l(message_key)] }, status: :unprocessable_entity
      },
      not_found_renderer: lambda { |message_key|
        render json: { error: l(message_key) }, status: :not_found
      }
    )
  end

  def custom_field_serializer
    @custom_field_serializer ||= RedmineCanvasGantt::CustomFieldSerializer.new(current_user: User.current)
  end

  def custom_field_extractor
    @custom_field_extractor ||= RedmineCanvasGantt::CustomFieldExtractor.new(
      serializer: custom_field_serializer,
      supported_formats: CUSTOM_FIELD_FORMATS
    )
  end

  def data_payload_builder
    @data_payload_builder ||= RedmineCanvasGantt::DataPayloadBuilder.new(
      custom_field_extractor: custom_field_extractor,
      current_user: User.current
    )
  end

  def relation_params_normalizer
    @relation_params_normalizer ||= RedmineCanvasGantt::RelationParamsNormalizer.new(
      delay_relation_types: DELAY_RELATION_TYPES,
      relation_params: relation_params,
      delay_provided: method(:relation_delay_provided?),
      error_renderer: lambda { |message_key|
        render json: { errors: [l(message_key)] }, status: :unprocessable_entity
      }
    )
  end

  def edit_meta_payload_builder
    @edit_meta_payload_builder ||= RedmineCanvasGantt::EditMetaPayloadBuilder.new(current_user: User.current)
  end

  def relation_change_validator
    @relation_change_validator ||= RedmineCanvasGantt::RelationChangeValidator.new(
      non_working_week_days: relation_non_working_week_days
    )
  end

  def bulk_subtask_creator
    @bulk_subtask_creator ||= RedmineCanvasGantt::BulkSubtaskCreator.new(current_user: User.current)
  end

  def parent_issue_resolver
    @parent_issue_resolver ||= RedmineCanvasGantt::ParentIssueResolver.new
  end
end
