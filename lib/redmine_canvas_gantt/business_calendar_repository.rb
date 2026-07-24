require 'singleton'
require_relative 'business_calendar_loader'

module RedmineCanvasGantt
  class BusinessCalendarRepository
    include Singleton

    DEFAULT_RELOAD_INTERVAL = 60.0

    def initialize(loader: nil, reload_interval: nil, clock: nil, logger: nil)
      @logger = logger || (Rails.logger if defined?(Rails))
      @loader = loader || BusinessCalendarLoader.new(
        directory: calendar_directory,
        fallback_non_working_week_days: Setting.non_working_week_days,
        logger: @logger
      )
      @reload_interval = normalize_reload_interval(reload_interval || ENV['REDMINE_CANVAS_GANTT_CALENDAR_RELOAD_INTERVAL'])
      @clock = clock || -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) }
      @reload_mutex = Mutex.new
      @snapshot = nil
      @fingerprint = nil
      @last_checked_at = nil
    end

    def snapshot
      current = @snapshot
      now = @clock.call
      return current if current && !reload_check_due?(now)

      reload_if_needed(now)
      @snapshot
    end

    private

    def reload_if_needed(now)
      @reload_mutex.synchronize do
        return @snapshot if @snapshot && !reload_check_due?(now)

        @last_checked_at = now
        fingerprint = @loader.fingerprint
        return @snapshot if @snapshot && fingerprint == @fingerprint

        begin
          loaded = @loader.load(revision: fingerprint)
          @snapshot = loaded
          @fingerprint = fingerprint
        rescue BusinessCalendarLoader::ConfigurationError => e
          log_reload_error(e, initial: @snapshot.nil?)
          @snapshot ||= BusinessCalendarSnapshot.error(e.message, revision: fingerprint)
        end
        @snapshot
      end
    end

    def reload_check_due?(now)
      @last_checked_at.nil? || now - @last_checked_at >= @reload_interval
    end

    def calendar_directory
      configured = ENV['REDMINE_CANVAS_GANTT_CALENDAR_DIR'].to_s
      return configured unless configured.empty?

      Rails.root.join('config', 'redmine_canvas_gantt', 'business_calendars').to_s
    end

    def normalize_reload_interval(value)
      return DEFAULT_RELOAD_INTERVAL if value.nil? || value.to_s.empty?

      parsed = Float(value)
      parsed.negative? ? DEFAULT_RELOAD_INTERVAL : parsed
    rescue ArgumentError, TypeError
      DEFAULT_RELOAD_INTERVAL
    end

    def log_reload_error(error, initial:)
      return unless @logger

      message = "redmine_canvas_gantt business calendar #{initial ? 'load' : 'reload'} failed: #{error.message}"
      initial ? @logger.error(message) : @logger.warn(message)
    end
  end
end
