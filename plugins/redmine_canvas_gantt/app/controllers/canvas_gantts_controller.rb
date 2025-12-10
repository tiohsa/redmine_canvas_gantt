class CanvasGanttsController < ApplicationController
  before_action :find_project_by_project_id
  before_action :authorize

  # GET /projects/:project_id/canvas_gantt
  def index
    # Passes initial permissions to the frontend via data attributes or similar
    @permissions = {
      editable: User.current.allowed_to?(:edit_canvas_gantt, @project),
      viewable: User.current.allowed_to?(:view_canvas_gantt, @project)
    @permissions = {
      editable: User.current.allowed_to?(:edit_canvas_gantt, @project),
      viewable: User.current.allowed_to?(:view_canvas_gantt, @project)
    }
    @i18n = {
      label_start_date: l(:label_start_date),
      label_due_date: l(:label_due_date),
      button_save: l(:button_save),
      button_cancel: l(:button_cancel),
      field_subject: l(:field_subject),
      label_day_plural: l(:label_day_plural)
    }
  end

  # GET /projects/:project_id/canvas_gantt/data.json
  def data
    begin
      # Fetch issues, relations, and versions
      # This is a simplified fetch logic. Real implementation needs recursive query or similar for subtasks.
      issues = @project.issues.visible.includes(:relations_to, :relations_from, :status, :tracker, :assigned_to).all
      
      tasks = issues.map do |issue|
        {
          id: issue.id,
          subject: issue.subject,
          start_date: issue.start_date,
          due_date: issue.due_date,
          ratio_done: issue.done_ratio,
          status_id: issue.status_id,
          assigned_to_id: issue.assigned_to_id,
          assigned_to_name: issue.assigned_to&.name,
          parent_id: issue.parent_id,
          lock_version: issue.lock_version, # Critical for Optimistic Locking
          editable: User.current.allowed_to?(:edit_issues, @project) && issue.editable?
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

      render json: {
        tasks: tasks,
        relations: relations,
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

  # PATCH /projects/:project_id/canvas_gantt/tasks/:id.json
  def update
    issue = Issue.visible.find(params[:id])
    
    # Check if issue belongs to project (optional but good for safety if route doesn't scope strictly)
    if issue.project_id != @project.id
      render json: { error: 'Issue not found in this project' }, status: :not_found
      return
    end

    unless User.current.allowed_to?(:edit_issues, @project) && issue.editable?
      render json: { error: 'Permission denied' }, status: :forbidden
      return
    end

    # Optimistic Locking Check handled by ActiveRecord automatically if lock_version is present
    issue.init_journal(User.current)
    issue.safe_attributes = params.require(:task).permit(:start_date, :due_date, :lock_version)

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
end
