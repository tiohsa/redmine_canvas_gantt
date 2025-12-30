class CanvasGanttsController < ApplicationController
  require_dependency Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'vite_asset_helper').to_s

  helper RedmineCanvasGantt::ViteAssetHelper
  accept_api_auth :data, :edit_meta, :update, :destroy_relation

  before_action :find_project_by_project_id
  before_action :set_permissions
  before_action :ensure_view_permission, only: [:index, :data, :edit_meta]
  before_action :ensure_edit_permission, only: [:update, :destroy_relation]

  # GET /projects/:project_id/canvas_gantt
  def index
    @i18n = {
      field_id: l(:field_id),
      field_start_date: l(:field_start_date),
      field_due_date: l(:field_due_date),
      field_assigned_to: l(:field_assigned_to),
      field_done_ratio: l(:field_done_ratio),
      button_edit: l(:button_edit),
      button_delete: l(:button_delete),
      button_save: l(:button_save),
      button_cancel: l(:button_cancel),
      field_subject: l(:field_subject),
      field_status: l(:field_status),
      label_day_plural: l(:label_day_plural),
      label_relations_remove_heading: l(:label_relations_remove_heading),
      label_relation_remove: l(:label_relation_remove),
      label_relation_removed: l(:label_relation_removed),
      label_relation_remove_failed: l(:label_relation_remove_failed),
      label_relation_added: l(:label_relation_added),
      label_relation_already_exists: l(:label_relation_already_exists),
      label_add_child_task: l(:button_add_subtask),
      label_issue_new: l(:label_issue_new),
      label_unassigned: l(:label_none),
      text_are_you_sure: l(:text_are_you_sure),
      label_filter: l(:label_filter),
      label_filter_tasks: l(:label_filter_tasks),
      label_filter_by_subject: l(:label_filter_by_subject),
      label_clear_filter: l(:button_clear),
      label_column_plural: l(:label_column_plural),
      button_reset: l(:button_reset),
      label_progress_line: l(:label_progress_line),
      label_group_by_project: l(:label_group_by_project),
      label_previous_month: l(:label_previous_month),
      label_next_month: l(:label_next_month),
      label_today: l(:label_today),
      button_top: l(:button_top),
      label_toggle_sidebar: l(:label_toggle_sidebar),
      label_month: l(:label_month),
      label_week: l(:label_week),
      label_day: l(:label_day),
      label_loading: l(:label_loading),
      button_expand: l(:label_expand),
      button_collapse: l(:label_collapse),
      label_sort_by: l(:label_sort_by),
      label_project: l(:label_project),
      label_success: l(:label_success),
      label_error: l(:label_error),
      label_delete_task_failed: l(:label_delete_task_failed),
      label_select_task_to_view_details: l(:label_select_task_to_view_details),
      label_failed_to_load_edit_options: l(:label_failed_to_load_edit_options),
      label_invalid_date_range: l(:label_invalid_date_range),
      label_custom_field_plural: l(:label_custom_field_plural),
      label_must_be_0_100: l(:label_must_be_0_100),
      label_required: l(:label_required),
      label_too_long: l(:label_too_long),
      label_too_short: l(:label_too_short),
      label_invalid_format: l(:label_invalid_format),
      label_search: l(:label_search),
      label_failed_to_save: l(:label_failed_to_save),
      label_yes: l(:general_text_yes),
      label_no: l(:general_text_no),
      button_expand_all: l(:button_expand_all),
      button_collapse_all: l(:button_collapse_all),
      label_show_subprojects: l(:label_show_subprojects),
      label_version_plural: l(:label_version_plural),
      label_project_plural: l(:label_project_plural),
      field_project: l(:field_project),
      field_tracker: l(:field_tracker),
      field_priority: l(:field_priority),
      field_author: l(:field_author),
      field_updated_on: l(:field_updated_on),
      field_category: l(:field_category),
      field_estimated_hours: l(:field_estimated_hours),
      field_created_on: l(:field_created_on),
      field_spent_hours: l(:label_spent_time),
      field_version: l(:field_fixed_version),
      label_all_select: l(:label_all_select),
      label_unassigned: l(:label_unassigned),
      label_assigned_to_filter: l(:label_assigned_to_filter),
      label_project_filter: l(:label_project_filter),
      label_version_filter: l(:label_version_filter),
      label_status_filter: l(:label_status_filter),
      label_organize_by_dependency: l(:label_organize_by_dependency),
      label_row_height_xs: l(:label_row_height_xs),
      label_row_height_s: l(:label_row_height_s),
      label_row_height_m: l(:label_row_height_m),
      label_row_height_l: l(:label_row_height_l),
      label_row_height_xl: l(:label_row_height_xl),
      label_assigned_to_short: l(:label_assigned_to_short),
      label_project_short: l(:label_project_short),
      label_version_short: l(:label_version_short),
      label_status_short: l(:label_status_short),
      label_progress_short: l(:label_progress_short),
      label_column_short: l(:label_column_short),
      label_dependencies_short: l(:label_dependencies_short),
      label_refresh_failed: l(:label_refresh_failed),
      label_relation_add_failed: l(:label_relation_add_failed),
      label_add_new_ticket: l(:label_issue_new)
    }

    @settings = Setting.plugin_redmine_canvas_gantt || {}
  end

  # GET /projects/:project_id/canvas_gantt/data.json
  def data
    begin
      # Fetch issues, relations, and versions
      # This is a simplified fetch logic. Real implementation needs recursive query or similar for subtasks.
      project_ids = @project.self_and_descendants.pluck(:id)

      scope = Issue.visible.where(project_id: project_ids).includes(:relations_to, :relations_from, :status, :tracker, :assigned_to, :priority, :author, :category, :project, :fixed_version)

      if params[:status_ids].present?
        scope = scope.where(status_id: params[:status_ids])
      end

      issues = scope.all
      
      tasks = issues.each_with_index.map do |issue, idx|
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
          lock_version: issue.lock_version, # Critical for Optimistic Locking
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

      relations = issues.map { |i| i.relations }.flatten.uniq.map do |r|
        {
          id: r.id,
          from: r.issue_from_id,
          to: r.issue_to_id,
          type: r.relation_type
        }
      end

      versions = Version.visible.where(project_id: project_ids).where.not(effective_date: nil).map do |v|
        {
          id: v.id,
          name: v.name,
          effective_date: v.effective_date,
          start_date: v.try(:start_date),
          completed_percent: v.completed_percent,
          project_id: v.project_id,
          status: v.status
        }
      end

      render json: {
        tasks: tasks,
        relations: relations,
        versions: versions,
        statuses: IssueStatus.sorted.collect { |s| { id: s.id, name: s.name } },
        project: {
          id: @project.id,
          name: @project.name,
          start_date: @project.start_date, # Requires Redmine 5.x or plugin for project dates
          due_date: @project.due_date
        },
        permissions: @permissions
      }
    rescue => e
      render json: { error: e.message }, status: :internal_server_error
    end
  end

  # GET /projects/:project_id/canvas_gantt/tasks/:id/edit_meta.json
  def edit_meta
    issue = Issue.visible.find(params[:id])

    if issue.project_id != @project.id
      render json: { error: 'Issue not found in this project' }, status: :not_found
      return
    end

    editable = @permissions[:editable] && issue.editable?

    field_editable = {
      subject: editable && issue.safe_attribute?('subject'),
      assigned_to_id: editable && issue.safe_attribute?('assigned_to_id'),
      status_id: editable && issue.safe_attribute?('status_id'),
      done_ratio: editable && issue.safe_attribute?('done_ratio'),
      due_date: editable && issue.safe_attribute?('due_date'),
      start_date: editable && issue.safe_attribute?('start_date'),
      priority_id: editable && issue.safe_attribute?('priority_id'),
      category_id: editable && issue.safe_attribute?('category_id'),
      estimated_hours: editable && issue.safe_attribute?('estimated_hours'),
      project_id: editable && issue.safe_attribute?('project_id'),
      tracker_id: editable && issue.safe_attribute?('tracker_id'),
      fixed_version_id: editable && issue.safe_attribute?('fixed_version_id'),
      custom_field_values: editable && issue.safe_attribute?('custom_field_values')
    }

    statuses = issue.new_statuses_allowed_to(User.current).to_a
    statuses << issue.status if issue.status && !statuses.include?(issue.status)
    statuses = statuses.uniq.sort_by(&:position)

    assignables = issue.assignable_users.to_a
    assignables = assignables.sort_by { |u| u.name.to_s.downcase }

    settings = Setting.plugin_redmine_canvas_gantt || {}
    custom_fields_enabled = settings['inline_edit_custom_fields'].to_s == '1'

    custom_fields = []
    custom_field_values = {}

    if custom_fields_enabled && field_editable[:custom_field_values]
      issue.custom_field_values.each do |cfv|
        cf = cfv.custom_field
        next unless cf
        next if cf.multiple?
        next unless %w[string int float list bool date text].include?(cf.field_format.to_s)

        custom_fields << {
          id: cf.id,
          name: cf.name,
          field_format: cf.field_format,
          is_required: cf.is_required,
          regexp: cf.regexp,
          min_length: cf.min_length,
          max_length: cf.max_length,
          possible_values: (cf.field_format.to_s == 'list' ? cf.possible_values : nil),
          text_formatting: (cf.field_format.to_s == 'text' ? (cf.text_formatting rescue nil) : nil)
        }

        custom_field_values[cf.id.to_s] = cfv.value
      end
    end

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
    
    # Check if issue belongs to project or one of its descendants
    project_ids = @project.self_and_descendants.pluck(:id)
    unless project_ids.include?(issue.project_id)
      render json: { error: 'Issue not found in this project' }, status: :not_found
      return
    end

    unless User.current.allowed_to?(:edit_issues, issue.project) && issue.editable?
      render json: { error: 'Permission denied' }, status: :forbidden
      return
    end

    # Optimistic Locking Check handled by ActiveRecord automatically if lock_version is present
    issue.init_journal(User.current)
    issue.safe_attributes = params.require(:task).permit(
      :start_date,
      :due_date,
      :lock_version,
      :subject,
      :assigned_to_id,
      :status_id,
      :done_ratio,
      :priority_id,
      :author_id,
      :category_id,
      :estimated_hours,
      :project_id,
      :tracker_id,
      :fixed_version_id,
      custom_field_values: {}
    )

    if issue.save
      render json: { status: 'ok', lock_version: issue.lock_version }
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
end
