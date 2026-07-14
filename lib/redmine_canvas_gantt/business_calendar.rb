require 'date'

module RedmineCanvasGantt
  class BusinessCalendar
    attr_reader :id, :name, :non_working_week_days, :days

    def initialize(id:, name:, non_working_week_days:, days:)
      @id = id.to_s.freeze
      @name = name.to_s.freeze
      @non_working_week_days = Array(non_working_week_days).map(&:to_i).uniq.sort.freeze
      @days = days.each_with_object({}) do |(date, info), result|
        result[date.to_date] = {
          name: info.fetch(:name).to_s.freeze,
          type: info.fetch(:type).to_s.freeze
        }.freeze
      end.freeze
      freeze
    end

    def day_info(date)
      normalized_date = date.to_date
      explicit = @days[normalized_date]
      return explicit.merge(source: 'override').freeze if explicit

      type = @non_working_week_days.include?(normalized_date.wday) ? 'non_working' : 'working'
      { name: nil, type: type, source: 'weekly' }.freeze
    end

    def working_day?(date)
      day_info(date).fetch(:type) == 'working'
    end

    def to_payload
      {
        id: @id,
        name: @name,
        nonWorkingWeekDays: @non_working_week_days,
        days: @days.each_with_object({}) do |(date, info), result|
          result[date.iso8601] = info
        end
      }
    end
  end

  class BusinessCalendarSnapshot
    attr_reader :status, :revision, :default_calendar_id, :project_calendars,
                :calendars, :warnings, :error

    def initialize(status:, revision:, default_calendar_id:, project_calendars:, calendars:, warnings: [], error: nil)
      @status = status.to_s.freeze
      @revision = revision.to_s.freeze
      @default_calendar_id = default_calendar_id&.to_s&.freeze
      @project_calendars = project_calendars.transform_keys(&:to_s).transform_values { |value| value.to_s.freeze }.freeze
      @calendars = calendars.transform_keys(&:to_s).freeze
      @warnings = Array(warnings).map { |warning| warning.to_s.freeze }.freeze
      @error = error&.to_s&.freeze
      freeze
    end

    def self.error(error, revision: '')
      new(
        status: 'error',
        revision: revision,
        default_calendar_id: nil,
        project_calendars: {},
        calendars: {},
        warnings: [],
        error: error
      )
    end
  end
end
