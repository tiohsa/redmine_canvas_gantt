require_relative 'business_calendar_repository'

module RedmineCanvasGantt
  class ProjectCalendarResolver
    def initialize(repository: BusinessCalendarRepository.instance, fallback_non_working_week_days: nil, snapshot: nil)
      @repository = repository
      @snapshot = snapshot
      @fallback_non_working_week_days = normalize_fallback_week_days(
        fallback_non_working_week_days || Setting.non_working_week_days
      )
    end

    def status
      current_snapshot.status
    end

    def configuration_error?
      status == 'error'
    end

    def calendar_id_for(project, snapshot: current_snapshot)
      project_and_ancestors(project).each do |candidate|
        identifier = candidate.respond_to?(:identifier) ? candidate.identifier.to_s : ''
        assigned = snapshot.project_calendars[identifier]
        return assigned if assigned
      end
      snapshot.default_calendar_id
    end

    def calendar_for(project, snapshot: current_snapshot)
      return nil if snapshot.default_calendar_id.nil? && snapshot.project_calendars.empty?

      id = calendar_id_for(project, snapshot: snapshot)
      id ? snapshot.calendars[id] : nil
    end

    def day_info(date, project:)
      calendar = calendar_for(project)
      return calendar.day_info(date) if calendar

      normalized = date.to_date
      type = @fallback_non_working_week_days.include?(normalized.wday) ? 'non_working' : 'working'
      { name: nil, type: type, source: 'weekly' }.freeze
    end

    def working_day?(date, project:)
      day_info(date, project: project).fetch(:type) == 'working'
    end

    # Matches Redmine::Utils::DateCalculation#working_days: count working
    # dates in [from, to), using the project-specific calendar for every date.
    def working_days(from, to, project:)
      start_date = from.to_date
      end_date = to.to_date
      days = (end_date - start_date).to_i
      return 0 unless days.positive?

      (0...days).count { |offset| working_day?(start_date + offset, project: project) }
    end

    def normalize_working_date(date, direction:, project:)
      current = date.to_date
      step = direction.to_sym == :backward ? -1 : 1
      current += step until working_day?(current, project: project)
      current
    end

    def next_working_day(date, project:)
      normalize_working_date(date, direction: :forward, project: project)
    end

    def previous_working_day(date, project:)
      normalize_working_date(date, direction: :backward, project: project)
    end

    def normalize_date_interval(start_date:, due_date:, changed_fields:, project:, mode: :legacy_unspecified)
      normalized_start = normalize_interval_endpoint(start_date, direction: :forward, project: project)
      normalized_due = normalize_interval_endpoint(due_date, direction: :backward, project: project)
      result = { start_date: normalized_start, due_date: normalized_due }

      if normalized_start.is_a?(Date) && normalized_due.is_a?(Date) && normalized_start > normalized_due
        if mode.to_sym == :resize_start && !changed_fields.include?(:due_date)
          return result.merge(start_date: normalized_due, valid: true)
        end
        if mode.to_sym == :resize_due && !changed_fields.include?(:start_date)
          return result.merge(due_date: normalized_start, valid: true)
        end

        return result.merge(valid: false, error: :invalid_interval)
      end

      result.merge(valid: true)
    end

    def add_working_days(date, days, project:)
      current = date.to_date
      remaining = [days.to_i, 0].max
      while remaining.positive?
        current += 1
        remaining -= 1 if working_day?(current, project: project)
      end
      current
    end

    def payload(projects:)
      snapshot = current_snapshot
      project_calendar_ids = Array(projects).each_with_object({}) do |project, result|
        calendar_id = calendar_id_for(project, snapshot: snapshot)
        result[project.id.to_s] = calendar_id if calendar_id
      end
      calendar_ids = project_calendar_ids.values.push(snapshot.default_calendar_id).compact.uniq

      {
        status: snapshot.status,
        revision: snapshot.revision,
        defaultCalendarId: snapshot.default_calendar_id,
        projectCalendarIds: project_calendar_ids,
        calendars: snapshot.calendars.slice(*calendar_ids).transform_values(&:to_payload),
        warnings: snapshot.warnings
      }.tap do |result|
        result[:error] = snapshot.error if snapshot.error
      end
    end

    private

    def current_snapshot
      @snapshot || @repository.snapshot
    end

    def project_and_ancestors(project)
      ancestors = project.respond_to?(:ancestors) ? project.ancestors.to_a.reverse : []
      [project, *ancestors]
    end

    def normalize_fallback_week_days(value)
      normalized = Array(value).filter_map do |day|
        parsed = Integer(day, exception: false)
        parsed % 7 if parsed&.between?(1, 7)
      end.uniq.sort
      (normalized.size >= 7 ? [] : normalized).freeze
    end

    def normalize_interval_endpoint(value, direction:, project:)
      return value if value.blank?

      date = value.respond_to?(:to_date) ? value.to_date : Date.iso8601(value.to_s)
      normalize_working_date(date, direction: direction, project: project)
    rescue ArgumentError, Date::Error
      value
    end
  end
end
