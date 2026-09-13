module RedmineCanvasGantt
  class IssueMutationService
    UpdateResult = Struct.new(
      :status,
      :issue,
      :previous_parent_id,
      :evaluation,
      :errors,
      keyword_init: true
    )
    DestroyResult = Struct.new(:issue, :parent_id, keyword_init: true)

    def initialize(draft_evaluator:)
      @draft_evaluator = draft_evaluator
    end

    def update(issue:, intent:, parent_issue_id_provided:, requested_parent_issue_id:)
      previous_parent_id = issue.parent_id
      evaluation = @draft_evaluator.evaluate(issue: issue, intent: intent)
      unless evaluation.valid?
        return UpdateResult.new(
          status: :invalid,
          issue: issue,
          previous_parent_id: previous_parent_id,
          evaluation: evaluation
        )
      end

      unless issue.save
        return UpdateResult.new(
          status: :save_failed,
          issue: issue,
          previous_parent_id: previous_parent_id,
          errors: issue.errors.full_messages
        )
      end

      if parent_issue_id_provided && issue.parent_id != requested_parent_issue_id
        return UpdateResult.new(
          status: :parent_linkage_failed,
          issue: issue,
          previous_parent_id: previous_parent_id
        )
      end

      UpdateResult.new(
        status: :ok,
        issue: issue,
        previous_parent_id: previous_parent_id
      )
    end

    def destroy(issue:)
      parent_id = issue.parent_id
      issue.destroy
      DestroyResult.new(issue: issue, parent_id: parent_id)
    end
  end
end
