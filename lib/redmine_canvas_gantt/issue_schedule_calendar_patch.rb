require_relative 'schedule_calendar_context'

module RedmineCanvasGantt
  module IssueScheduleCalendarPatch
    def working_days(from, to)
      resolver = RedmineCanvasGantt::ScheduleCalendarContext.current
      project = respond_to?(:project) ? project_for_schedule_calendar : nil
      return resolver.working_days(from, to, project: project) if resolver && project

      super
    end

    def add_working_days(date, working_days)
      resolver = RedmineCanvasGantt::ScheduleCalendarContext.current
      project = respond_to?(:project) ? project_for_schedule_calendar : nil
      return resolver.add_working_days(date, working_days, project: project) if resolver && project

      super
    end

    def next_working_date(date)
      resolver = RedmineCanvasGantt::ScheduleCalendarContext.current
      project = respond_to?(:project) ? project_for_schedule_calendar : nil
      return resolver.next_working_day(date, project: project) if resolver && project

      super
    end

    private

    def project_for_schedule_calendar
      project
    end
  end

  module IssueRelationScheduleCalendarPatch
    def add_working_days(date, working_days)
      resolver = RedmineCanvasGantt::ScheduleCalendarContext.current
      project = respond_to?(:issue_to) ? issue_to&.project : nil
      return resolver.add_working_days(date, working_days, project: project) if resolver && project

      super
    end
  end
end
