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
    label_maximize_left_pane: :label_maximize_left_pane,
    label_maximize_right_pane: :label_maximize_right_pane,
    label_restore_split_view: :label_restore_split_view,
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
    label_relation_delay_auto_calc_unavailable: :label_relation_delay_auto_calc_unavailable,
    label_relation_delay_invalid: :label_relation_delay_invalid,
    label_relation_delay_required: :label_relation_delay_required,
    label_relation_delay_mismatch: :label_relation_delay_mismatch,
    label_relation_updated: :label_relation_updated,
    label_relation_title: :label_relation_title,
    label_delay: :label_delay,
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
    button_create: :button_create
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
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'relation_params_normalizer').to_s

  helper RedmineCanvasGantt::ViteAssetHelper
  accept_api_auth :data, :edit_meta, :update, :bulk_create_subtasks, :create_relation, :update_relation, :destroy_relation

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
    @i18n = I18N_LABELS.transform_values { |label_key| l(label_key) }
    @settings = plugin_settings
    @non_working_week_days = Array(Setting.non_working_week_days).map(&:to_i).uniq.sort
  end

  # GET /projects/:project_id/canvas_gantt/data.json
  def data
    begin
      project_ids = descendant_project_ids
      issues = issue_scope(project_ids).to_a

      render json: data_payload_builder.build(
        project: @project,
        permissions: @permissions,
        project_ids: project_ids,
        issues: issues
      )
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

    custom_fields, custom_field_values = custom_field_extractor.extract_custom_fields(issue, field_editable[:custom_field_values])

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
        versions: Version.visible.where(project_id: issue.project_id).map { |v| { id: v.id, name: v.name } },
        custom_fields: custom_fields
      },
      custom_field_values: custom_field_values,
      permissions: @permissions
    }
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

    unless allowed_to_bulk_create_subtasks?(parent_issue)
      render json: { error: l(:error_canvas_gantt_permission_denied) }, status: :forbidden
      return
    end

    subjects = Array(params[:subjects])
    if subjects.empty?
      render json: { error: l(:error_canvas_gantt_subjects_non_empty_array) }, status: :unprocessable_entity
      return
    end

    inherited_attrs = build_inherited_subtask_attributes(parent_issue)
    results = subjects.map { |raw_subject| create_subtask_from_subject(raw_subject, parent_issue, inherited_attrs) }
    success_count = results.count { |result| result[:status] == 'ok' }
    fail_count = results.length - success_count

    render json: {
      status: 'ok',
      success_count: success_count,
      fail_count: fail_count,
      results: results
    }
  rescue ActiveRecord::RecordNotFound
    render json: { error: l(:error_canvas_gantt_parent_task_not_found) }, status: :not_found
  end

  # POST /projects/:project_id/canvas_gantt/relations.json
  def create_relation
    issue_from = Issue.visible.find(relation_params[:issue_from_id])
    issue_to = Issue.visible.find(relation_params[:issue_to_id])
    return unless ensure_relation_createable!(issue_from, issue_to)

    relation_type = relation_params[:relation_type].to_s
    unless EDITABLE_RELATION_TYPES.include?(relation_type)
      render json: { errors: [l(:error_canvas_gantt_relation_type_invalid)] }, status: :unprocessable_entity
      return
    end

    delay = relation_params_normalizer.normalize_delay(relation_type)
    return if performed?
    return unless ensure_relation_delay_consistent!(issue_from, issue_to, relation_type, delay)

    relation = IssueRelation.new(
      issue_from: issue_from,
      issue_to: issue_to,
      relation_type: relation_type,
      delay: delay
    )

    if relation.save
      render json: { status: 'ok', relation: relation_params_normalizer.serialize_relation(relation) }
    else
      render json: { errors: relation.errors.full_messages }, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotFound
    render json: { error: l(:error_canvas_gantt_task_not_found) }, status: :not_found
  rescue => e
    render json: { error: e.message }, status: :internal_server_error
  end

  # PATCH /projects/:project_id/canvas_gantt/relations/:id.json
  def update_relation
    relation = IssueRelation.find(params[:id])
    return unless ensure_relation_editable!(relation)

    relation_type = relation_params[:relation_type].to_s
    unless EDITABLE_RELATION_TYPES.include?(relation_type)
      render json: { errors: [l(:error_canvas_gantt_relation_type_invalid)] }, status: :unprocessable_entity
      return
    end

    delay = relation_params_normalizer.normalize_delay(relation_type)
    return if performed?
    return unless ensure_relation_delay_consistent!(relation.issue_from, relation.issue_to, relation_type, delay)

    relation.relation_type = relation_type
    relation.delay = delay

    if relation.save
      render json: { status: 'ok', relation: relation_params_normalizer.serialize_relation(relation) }
    else
      render json: { errors: relation.errors.full_messages }, status: :unprocessable_entity
    end
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

  def ensure_relation_delay_consistent!(issue_from, issue_to, relation_type, delay)
    return true unless DELAY_RELATION_TYPES.include?(relation_type) && delay.is_a?(Integer)

    predecessor, successor = relation_type == 'follows' ? [issue_to, issue_from] : [issue_from, issue_to]
    predecessor_due = predecessor&.due_date
    successor_start = successor&.start_date
    return true if predecessor_due.blank? || successor_start.blank?

    minimum_successor_start = add_working_days_to_date(predecessor_due.to_date, 1 + delay, relation_non_working_week_days)
    return true if successor_start.to_date >= minimum_successor_start

    render json: { errors: [l(:error_canvas_gantt_relation_delay_mismatch)] }, status: :unprocessable_entity
    false
  end

  def relation_non_working_week_days
    Array(Setting.non_working_week_days).filter_map do |day|
      parsed = Integer(day, exception: false)
      parsed if parsed && parsed.between?(0, 6)
    end.to_set
  end

  def add_working_days_to_date(date, days, non_working_week_days)
    current = date.to_date
    remaining = [days.to_i, 0].max

    while remaining.positive?
      current += 1
      next if non_working_week_days.include?(current.wday)

      remaining -= 1
    end

    current
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
    return nil if raw_parent_issue_id.blank?

    parent_issue = Issue.visible.find(raw_parent_issue_id)
    unless ensure_issue_in_scope(parent_issue)
      return :invalid
    end

    if parent_issue.id == source_issue.id
      render json: { errors: [l(:error_canvas_gantt_task_cannot_be_child_of_itself)] }, status: :unprocessable_entity
      return :invalid
    end

    # No hierarchy change: keep current parent without failing cycle checks.
    return parent_issue if source_issue.parent_id == parent_issue.id

    # Reject only when trying to move under own descendant.
    if source_issue.descendants.exists?(parent_issue.id)
      render json: { errors: [l(:error_canvas_gantt_cannot_move_under_own_descendant)] }, status: :unprocessable_entity
      return :invalid
    end

    parent_issue
  rescue ActiveRecord::RecordNotFound
    render json: { error: l(:error_canvas_gantt_parent_task_not_found) }, status: :not_found
    :invalid
  end

  def build_inherited_subtask_attributes(parent_issue)
    {
      parent_issue_id: parent_issue.id,
      project_id: parent_issue.project_id,
      tracker_id: parent_issue.tracker_id,
      status_id: parent_issue.status_id,
      priority_id: parent_issue.priority_id,
      assigned_to_id: parent_issue.assigned_to_id,
      fixed_version_id: parent_issue.fixed_version_id,
      category_id: parent_issue.category_id
    }
  end

  def allowed_to_bulk_create_subtasks?(parent_issue)
    User.current.allowed_to?(:add_issues, parent_issue.project) &&
      User.current.allowed_to?(:manage_subtasks, parent_issue.project)
  end

  def create_subtask_from_subject(raw_subject, parent_issue, inherited_attrs)
    subject = raw_subject.to_s.strip
    if subject.blank?
      return {
        status: 'error',
        subject: subject,
        errors: [l(:error_canvas_gantt_subject_blank)]
      }
    end

    issue = Issue.new
    issue.author = User.current
    issue.safe_attributes = inherited_attrs.merge(subject: subject)
    issue.parent_issue_id = parent_issue.id

    if issue.save
      unless issue.parent_id == parent_issue.id
        begin
          issue.destroy
        rescue StandardError
          # Keep original linkage error even if cleanup fails.
        end
        return {
          status: 'error',
          subject: subject,
          errors: [l(:error_canvas_gantt_parent_linkage_failed)]
        }
      end
      {
        status: 'ok',
        subject: subject,
        issue_id: issue.id
      }
    else
      {
        status: 'error',
        subject: subject,
        errors: issue.errors.full_messages
      }
    end
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

  def build_tasks(issues)
    data_payload_builder.build_tasks(issues)
  end

  def build_project_custom_fields(project_ids, issues = [])
    custom_field_extractor.build_project_custom_fields(project_ids, issues)
  end

  def build_relations(issues)
    data_payload_builder.build_relations(issues)
  end

  def build_versions(project_ids)
    data_payload_builder.build_versions(project_ids)
  end

  def build_statuses
    data_payload_builder.build_statuses
  end

  def build_project_payload
    data_payload_builder.build_project_payload(@project)
  end

  def extract_custom_fields(issue, field_editable)
    custom_field_extractor.extract_custom_fields(issue, inline_custom_fields_enabled? && field_editable[:custom_field_values])
  end

  def build_task_custom_field_values(issue)
    custom_field_extractor.build_task_custom_field_values(issue)
  end

  def serialize_relation(relation)
    relation_params_normalizer.serialize_relation(relation)
  end

  def normalize_relation_delay(relation_type)
    relation_params_normalizer.normalize_delay(relation_type)
  end
end
