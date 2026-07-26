module RedmineCanvasGantt
  class BulkSubtaskCreator
    def initialize(current_user:, issue_class: Issue)
      @current_user = current_user
      @issue_class = issue_class
    end

    def allowed?(parent_issue)
      @current_user.allowed_to?(:add_issues, parent_issue.project) &&
        @current_user.allowed_to?(:manage_subtasks, parent_issue.project)
    end

    def call(parent_issue:, subjects: nil, subtasks: nil)
      inherited_attrs = build_inherited_subtask_attributes(parent_issue)
      rows = subtasks || Array(subjects).map { |subject| { subject: subject } }
      results = []
      rolled_back = false

      @issue_class.transaction do
        results = rows.map { |row| create_subtask_from_row(row, parent_issue, inherited_attrs) }
        if results.any? { |result| result[:status] == 'error' }
          rolled_back = true
          raise ActiveRecord::Rollback
        end
      end

      if rolled_back
        results = results.map do |result|
          next result if result[:status] == 'error'

          result.merge(
            status: 'error',
            issue_id: nil,
            errors: [I18n.t(:"canvas_gantt.error_canvas_gantt_bulk_subtasks_rolled_back")]
          )
        end
      end
      success_count = results.count { |result| result[:status] == 'ok' }

      {
        status: 'ok',
        success_count: success_count,
        fail_count: results.length - success_count,
        results: results
      }
    end

    private

    def build_inherited_subtask_attributes(parent_issue)
      {
        parent_issue_id: parent_issue.id,
        project_id: parent_issue.project_id,
        tracker_id: parent_issue.tracker_id,
        status_id: parent_issue.status_id,
        priority_id: parent_issue.priority_id,
        assigned_to_id: parent_issue.assigned_to_id
      }
    end

    def create_subtask_from_row(row, parent_issue, inherited_attrs)
      # Rails wraps JSON array entries in ActionController::Parameters;
      # calling `to_h` on an unpermitted instance raises 500. Read only the
      # two expected keys instead.
      subject_value = if row.respond_to?(:key?)
        row[:subject] || row['subject']
      else
        row
      end
      tracker_value = if row.respond_to?(:key?)
        row[:tracker_id] || row['tracker_id']
      end
      subject = subject_value.to_s.strip
      if subject.blank?
        return {
          status: 'error',
          subject: subject,
          errors: [I18n.t(:"canvas_gantt.error_canvas_gantt_subject_blank")]
        }
      end

      issue = @issue_class.new
      issue.author = @current_user
      tracker_id = tracker_value.presence || inherited_attrs[:tracker_id]
      # Project#trackers is already the project's permitted tracker scope in
      # Redmine. Avoid calling Tracker#visible? here: its signature and
      # availability differ between supported Redmine versions.
      available_tracker_ids = parent_issue.project.trackers.map(&:id)
      unless available_tracker_ids.include?(tracker_id.to_i)
        return { status: 'error', subject: subject,
                 errors: [I18n.t(:'canvas_gantt.error_canvas_gantt_tracker_invalid')] }
      end
      issue.safe_attributes = inherited_attrs.merge(subject: subject, tracker_id: tracker_id)
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
            errors: [I18n.t(:"canvas_gantt.error_canvas_gantt_parent_linkage_failed")]
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
  end
end
