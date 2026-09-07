module RedmineCanvasGantt
  # SQL aggregation after both Issue and TimeEntry visibility checks.
  class ActualWorkloadBuilder
    def self.build(issue_scope:, current_user:, from:, to:, budget:)
      rows = TimeEntry.visible(current_user)
        .where(issue_id: issue_scope.select(:id), spent_on: from..to)
        .group(:user_id, :spent_on, :issue_id)
        .limit(budget.collection_limit + 1)
        .pluck(:user_id, :spent_on, :issue_id, Arel.sql('SUM(hours)'))
      budget.ensure_count!(rows, resource: 'actual_workload')
      users = User.where(id: rows.map(&:first).uniq).index_by(&:id)
      rows.map do |user_id, spent_on, issue_id, hours|
        {
          id: "#{user_id}:#{spent_on.iso8601}:#{issue_id}",
          issueId: issue_id.to_s,
          userId: user_id,
          userName: users.fetch(user_id).name,
          spentOn: spent_on.iso8601,
          hours: hours.to_f
        }
      end
    end
  end
end
