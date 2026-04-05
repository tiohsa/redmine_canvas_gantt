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

    def call(parent_issue:, subjects:)
      inherited_attrs = build_inherited_subtask_attributes(parent_issue)
      results = Array(subjects).map { |raw_subject| create_subtask_from_subject(raw_subject, parent_issue, inherited_attrs) }
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
        assigned_to_id: parent_issue.assigned_to_id,
        fixed_version_id: parent_issue.fixed_version_id,
        category_id: parent_issue.category_id
      }
    end

    def create_subtask_from_subject(raw_subject, parent_issue, inherited_attrs)
      subject = raw_subject.to_s.strip
      if subject.blank?
        return {
          status: 'error',
          subject: subject,
          errors: [I18n.t(:"canvas_gantt.error_canvas_gantt_subject_blank")]
        }
      end

      issue = @issue_class.new
      issue.author = @current_user
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
