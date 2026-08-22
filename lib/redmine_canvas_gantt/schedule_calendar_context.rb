module RedmineCanvasGantt
  # Keeps the Canvas scheduling calendar scoped to the current callback chain.
  # The previous value is restored so nested operations and reused application
  # threads cannot retain a project calendar after the operation completes.
  module ScheduleCalendarContext
    KEY = :redmine_canvas_gantt_schedule_calendar_resolver

    module_function

    def current
      Thread.current[KEY]
    end

    def with(resolver:)
      previous = Thread.current[KEY]
      Thread.current[KEY] = resolver
      yield
    ensure
      Thread.current[KEY] = previous
    end
  end
end
