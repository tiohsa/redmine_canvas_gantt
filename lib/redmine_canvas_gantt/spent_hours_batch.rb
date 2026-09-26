module RedmineCanvasGantt
  module SpentHoursBatch
    def self.for(issues)
      ids = issues.map(&:id).uniq
      return {} if ids.empty?

      TimeEntry.where(issue_id: ids).group(:issue_id).sum(:hours)
    end
  end
end
