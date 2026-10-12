# frozen_string_literal: true

# Run from a Redmine Rails root, for example:
#   REDMINE_CANVAS_GANTT_PROFILE=1 bundle exec rails runner plugins/redmine_canvas_gantt/scripts/profile-data-request.rb \
#     --user-id 1 --project-id 1 --warmups 2 --samples 5 [--detail]
#
# This uses the selected Redmine user and project, never API credentials. Each GET
# runs inside a transaction that is rolled back. Output contains timings and
# response shape only; it never prints SQL, binds, request params, or response data.
# The rollback transaction changes normal request conditions and adds overhead.
# Stage timings cover the named methods; values built as arguments to
# DataPayloadBuilder#build (including filter options) are outside that stage.
# The nested_issue_sort timing is inside query_state_resolve. Budget-load timings
# overlap query_state_resolve, business_calendar_payload, and relations_load.
# --detail adds higher-overhead method, preloader, and Active Record instantiation
# instrumentation. Do not compare request totals across coarse and detailed runs.
# GC deltas are process-wide counters sampled around each request, not request-local
# measurements; unsupported GC counters are reported as null.
require 'json'
require 'logger'
require 'optparse'

module CanvasGanttDataRequestProfiler
  class DiagnosticError < StandardError
    attr_reader :status, :write_sql_count, :phase

    def initialize(phase:, status: nil, write_sql_count: 0)
      @phase = phase
      @status = status
      @write_sql_count = write_sql_count
      super('Canvas Gantt data request diagnostic failed')
    end
  end

  THREAD_KEY = :canvas_gantt_profile_context
  SQL_WRITE_PATTERN = /\A\s*(?:INSERT|UPDATE|DELETE|REPLACE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i
  SQL_TRANSACTION_PATTERN = /\A\s*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i
  GC_STAT_KEYS = %i[time total_allocated_objects total_allocated_pages minor_gc_count major_gc_count].freeze

  DETAIL_METHODS = [
    ['RedmineCanvasGantt::DataPayloadBuilder', :build_tasks, :public, 'build_tasks'],
    ['RedmineCanvasGantt::DataPayloadBuilder', :build_task_state, :public, 'build_task_state'],
    ['RedmineCanvasGantt::DataPayloadBuilder', :build_relations, :public, 'build_relations'],
    ['RedmineCanvasGantt::CustomFieldExtractor', :build_project_custom_fields, :public, 'custom_fields.project'],
    ['RedmineCanvasGantt::CustomFieldExtractor', :extract_custom_fields, :public, 'custom_fields.extract'],
    ['RedmineCanvasGantt::CustomFieldExtractor', :build_task_custom_field_values, :public, 'custom_fields.task_values'],
    ['RedmineCanvasGantt::CustomFieldExtractor', :issue_applicable_custom_field_ids, :private, 'custom_fields.applicable_ids'],
    ['RedmineCanvasGantt::CustomFieldExtractor', :applicable_custom_field_ids_from_values, :private, 'custom_fields.ids_from_values'],
    # Do not prepend custom_field_values: CustomFieldExtractor inspects its owner
    # to preserve overrides. Instrumenting it would disable the optimized path.
    ['Issue', :available_custom_fields, :public, 'issue.available_custom_fields'],
    ['RedmineCanvasGantt::CustomFieldSerializer', :serialize, :public, 'custom_fields.serialize'],
    ['RedmineCanvasGantt::MutationAuthorizationPolicy', :can_edit_issue?, :public, 'permission.can_edit_issue'],
    ['RedmineCanvasGantt::MutationAuthorizationPolicy', :can_log_time?, :public, 'permission.can_log_time']
  ].freeze

  STAGES = {
    'query_state_resolve' => ['RedmineCanvasGantt::QueryStateResolver', :resolve, :public],
    'nested_budget_load_records' => ['RedmineCanvasGantt::DataPayloadBudget', :load_records, :public],
    'nested_issue_sort' => ['RedmineCanvasGantt::IssueSelector', :sort_issues!, :private],
    'baseline_load' => ['RedmineCanvasGantt::BaselineRepository', :load, :public],
    'business_calendar_payload' => ['CanvasGanttsController', :business_calendar_payload, :private],
    'relations_load' => ['CanvasGanttsController', :data_relations, :private],
    'payload_build' => ['RedmineCanvasGantt::DataPayloadBuilder', :build, :public],
    'json_encode' => ['RedmineCanvasGantt::DataPayloadBudget', :encode_json, :public]
  }.freeze

  module_function

  def summarize_payload(payload)
    return {} unless payload.is_a?(Hash)

    payload.each_with_object({}) do |(key, value), summary|
      summary[key.to_s] = {
        'type' => payload_type(value),
        'count' => (value.length if value.is_a?(Array) || value.is_a?(Hash)),
        'encode_bytes' => JSON.generate(value).bytesize
      }
    end
  end

  def payload_type(value)
    case value
    when Array then 'array'
    when Hash then 'object'
    when String then 'string'
    when Numeric then 'number'
    when true, false then 'boolean'
    when nil then 'null'
    else 'other'
    end
  end

  def parse_options(arguments)
    options = { warmups: 2, samples: 5, detail: false }
    parser = OptionParser.new do |opts|
      opts.banner = 'Usage: rails runner profile-data-request.rb --user-id ID --project-id ID [options]'
      opts.on('--user-id ID', Integer, 'Existing active Redmine user id') { |value| options[:user_id] = value }
      opts.on('--project-id ID', Integer, 'Existing Redmine project id') { |value| options[:project_id] = value }
      opts.on('--warmups N', Integer, 'Warmup GET requests (0..20, default 2)') { |value| options[:warmups] = value }
      opts.on('--samples N', Integer, 'Measured GET requests (1..50, default 5)') { |value| options[:samples] = value }
      opts.on('--detail', 'Enable higher-overhead method, preloader, and instantiation instrumentation') do
        options[:detail] = true
      end
      opts.on('-h', '--help', 'Show this help') do
        puts opts
        exit 0
      end
    end
    parser.parse!(arguments)

    raise OptionParser::MissingArgument, '--user-id' unless options[:user_id]
    raise OptionParser::MissingArgument, '--project-id' unless options[:project_id]
    raise OptionParser::InvalidArgument, 'warmups must be between 0 and 20' unless (0..20).cover?(options[:warmups])
    raise OptionParser::InvalidArgument, 'samples must be between 1 and 50' unless (1..50).cover?(options[:samples])
    raise OptionParser::InvalidArgument, 'unexpected arguments' unless arguments.empty?

    options
  end

  def install_stage_timers!
    STAGES.each do |label, (class_name, method_name, visibility)|
      klass = class_name.split('::').reject(&:empty?).inject(Object) { |scope, name| scope.const_get(name) }
      timer = Module.new do
        define_method(method_name) do |*args, **kwargs, &block|
          context = Thread.current[THREAD_KEY]
          unless context
            next super(*args, **kwargs, &block)
          end

          started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
          if label == 'nested_budget_load_records' && context[:detail_enabled] && kwargs[:resource] == 'issues'
            context[:issue_load_strategy] = { 'eager_loading' => args.first.eager_loading? }
          end
          begin
            super(*args, **kwargs, &block)
          ensure
            elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at
            context[:stages][label] = context[:stages].fetch(label, 0.0) + elapsed
          end
        end
      end
      timer.send(visibility, method_name)
      klass.prepend(timer)
    end
  end

  def install_detail_timers!
    DETAIL_METHODS.each do |class_name, method_name, visibility, label|
      klass = class_name.split('::').reject(&:empty?).inject(Object) { |scope, name| scope.const_get(name) }
      next unless klass.method_defined?(method_name) || klass.private_method_defined?(method_name)

      timer = Module.new do
        define_method(method_name) do |*args, **kwargs, &block|
          context = Thread.current[THREAD_KEY]
          next super(*args, **kwargs, &block) unless context

          started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
          begin
            super(*args, **kwargs, &block)
          ensure
            elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at
            metric = context[:detail_methods][label]
            metric['calls'] += 1
            metric['total_ms'] += elapsed * 1000.0
          end
        end
      end
      timer.send(visibility, method_name)
      klass.prepend(timer)
    end

    preloader = ActiveRecord::Associations::Preloader
    return unless preloader.method_defined?(:call) || preloader.private_method_defined?(:call)

    timer = Module.new do
      define_method(:call) do |*args, **kwargs, &block|
        context = Thread.current[CanvasGanttDataRequestProfiler::THREAD_KEY]
        next super(*args, **kwargs, &block) unless context

        started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        begin
          super(*args, **kwargs, &block)
        ensure
          elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at
          metric = context[:detail_methods]['active_record.preloader.call']
          metric['calls'] += 1
          metric['total_ms'] += elapsed * 1000.0
        end
      end
    end
    visibility = preloader.private_method_defined?(:call) ? :private : :public
    timer.send(visibility, :call)
    preloader.prepend(timer)
  end

  def gc_snapshot
    stats = GC.stat
    stats[:time] = nil if GC.respond_to?(:measure_total_time) && !GC.measure_total_time
    GC_STAT_KEYS.each_with_object({}) { |key, result| result[key] = stats[key] }
  rescue StandardError
    GC_STAT_KEYS.each_with_object({}) { |key, result| result[key] = nil }
  end

  def gc_delta(before, after)
    GC_STAT_KEYS.each_with_object({}) do |key, result|
      left = before[key]
      right = after[key]
      result[key.to_s] = left.nil? || right.nil? ? nil : right - left
    end
  end

  def install_request_safety_overrides!
    diagnostic_user_module = Module.new do
      define_method(:find_current_user) do
        diagnostic_user = Thread.current[CanvasGanttDataRequestProfiler::THREAD_KEY]&.fetch(:user, nil)
        User.current = diagnostic_user
      end

      # Redmine records recently used projects from an after-action callback.
      # Keep that preference write out of this diagnostic process.
      define_method(:record_project_usage) {}
    end
    diagnostic_user_module.send(:private, :find_current_user, :record_project_usage)
    ApplicationController.prepend(diagnostic_user_module)
  end

  def measure_request(integration_session, user:, path:, project_id:, detail: false, params: {})
    context = {
      user: user,
      stages: Hash.new(0.0),
      detail_methods: Hash.new { |hash, key| hash[key] = { 'calls' => 0, 'total_ms' => 0.0 } },
      instantiations: { 'count' => 0, 'by_class' => Hash.new(0), 'total_ms' => 0.0,
                        'ms_by_class' => Hash.new(0.0), 'events' => [] },
      detail_enabled: detail,
      sql_count: 0,
      sql_ms: 0.0,
      write_sql_count: 0
    }
    gc_before = gc_snapshot
    previous_user = User.current
    response = nil
    process_action = nil
    request_started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    request_wall_ms = nil

    process_subscriber = lambda do |_name, started, finished, _id, payload|
      next unless payload[:controller] == 'CanvasGanttsController' && payload[:action] == 'data'

      process_action = {
        'wall_ms' => (finished - started) * 1000.0,
        'db_runtime_ms' => payload[:db_runtime],
        'view_runtime_ms' => payload[:view_runtime],
        'gc_runtime_ms' => payload[:gc_runtime]
      }
    end
    sql_subscriber = lambda do |_name, started, finished, _id, payload|
      next if payload[:cached] || payload[:name] == 'SCHEMA'

      sql = payload[:sql].to_s
      next if sql.match?(SQL_TRANSACTION_PATTERN)

      context[:sql_count] += 1
      context[:sql_ms] += (finished - started) * 1000.0
      context[:write_sql_count] += 1 if sql.match?(SQL_WRITE_PATTERN)
    end
    instantiation_subscriber = lambda do |_name, started, finished, _id, payload|
      class_name = payload[:class_name]
      next unless class_name

      context[:instantiations]['count'] += payload[:record_count].to_i
      context[:instantiations]['by_class'][class_name] += payload[:record_count].to_i
      elapsed_ms = (finished - started) * 1000.0
      context[:instantiations]['total_ms'] += elapsed_ms
      context[:instantiations]['ms_by_class'][class_name] += elapsed_ms
      context[:instantiations]['events'] << {
        'class_name' => class_name, 'record_count' => payload[:record_count].to_i, 'total_ms' => elapsed_ms
      }
    end

    Thread.current[THREAD_KEY] = context
    ActiveRecord::Base.transaction do
      begin
        ActiveSupport::Notifications.subscribed(process_subscriber, 'process_action.action_controller') do
          ActiveSupport::Notifications.subscribed(sql_subscriber, 'sql.active_record') do
            if detail
              ActiveSupport::Notifications.subscribed(instantiation_subscriber, 'instantiation.active_record') do
                integration_session.get(
                  path,
                  params: { project_ids: [project_id.to_s], format: 'json' }.merge(params),
                  headers: { 'Accept' => 'application/json' }
                )
              end
            else
              integration_session.get(
                path,
                params: { project_ids: [project_id.to_s], format: 'json' }.merge(params),
                headers: { 'Accept' => 'application/json' }
              )
            end
            response = integration_session.response
            request_wall_ms = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - request_started_at) * 1000.0
          end
        end
        # Even an unexpected write made during this GET stays inside this outer
        # transaction. Roll back after collecting the response and measurements.
        raise ActiveRecord::Rollback
      ensure
        Thread.current[THREAD_KEY] = nil
      end
    end

    # Exclude diagnostic JSON parsing and size summaries from the GC delta.
    gc_after = gc_snapshot
    payload = JSON.parse(response.body) if response&.body.present? && response.media_type == 'application/json'
    result = {
      'status' => response&.status,
      'request_wall_ms' => request_wall_ms,
      'process_action' => process_action,
      'sql_count' => context[:sql_count],
      'sql_ms' => context[:sql_ms],
      'stages_ms' => context[:stages].transform_values { |seconds| seconds * 1000.0 },
      'body_bytes' => response&.body.to_s.bytesize,
      'top_level_payload' => summarize_payload(payload),
      'write_sql_seen' => context[:write_sql_count].positive?,
      'write_sql_count' => context[:write_sql_count]
    }
    result['detail_methods'] = context[:detail_methods].to_h if detail
    result['active_record_instantiations'] = {
      'count' => context[:instantiations]['count'],
      'by_class' => context[:instantiations]['by_class'],
      'total_ms' => context[:instantiations]['total_ms'],
      'ms_by_class' => context[:instantiations]['ms_by_class'],
      'events' => context[:instantiations]['events']
    } if detail
    result['issue_load_strategy'] = context[:issue_load_strategy] if detail
    result['gc_process_delta'] = gc_delta(gc_before, gc_after)
    result
  ensure
    Thread.current[THREAD_KEY] = nil
    User.current = previous_user if defined?(previous_user)
  end

  def run(arguments)
    options = parse_options(arguments)
    previous_rails_logger = Rails.logger
    previous_active_record_logger = ActiveRecord::Base.logger
    previous_action_controller_logger = ActionController::Base.logger
    previous_application_controller_logger = ApplicationController.logger
    quiet_logger = Logger.new(File::NULL)
    Rails.logger = quiet_logger
    ActiveRecord::Base.logger = quiet_logger
    ActionController::Base.logger = quiet_logger
    ApplicationController.logger = quiet_logger
    previous_subscriber_loggers = ActiveSupport::LogSubscriber.log_subscribers.filter_map do |subscriber|
      next unless subscriber.respond_to?(:logger) && subscriber.respond_to?(:logger=)

      [subscriber, subscriber.logger]
    end
    previous_subscriber_loggers.each { |subscriber, _logger| subscriber.logger = quiet_logger }

    begin
      user = User.find_by(id: options.fetch(:user_id))
      project = Project.find_by(id: options.fetch(:project_id))
      raise DiagnosticError.new(phase: 'user_lookup') unless user&.active?
      raise DiagnosticError.new(phase: 'project_lookup') unless project

      install_stage_timers!
      install_detail_timers! if options[:detail]
      install_request_safety_overrides!

      integration_session = ActionDispatch::Integration::Session.new(Rails.application)
      path = "/projects/#{project.to_param}/canvas_gantt/data.json"
      options[:warmups].times do
        warmup = measure_request(integration_session, user: user, path: path, project_id: project.id,
                                 detail: options[:detail])
        unless warmup['status'] == 200
          raise DiagnosticError.new(phase: 'warmup_http', status: warmup['status'])
        end
        if warmup['write_sql_seen']
          raise DiagnosticError.new(phase: 'warmup_write_sql', status: warmup['status'],
                                   write_sql_count: warmup['write_sql_count'])
        end
      end

      samples = options[:samples].times.map do
        sample = measure_request(integration_session, user: user, path: path, project_id: project.id,
                                 detail: options[:detail])
        unless sample['status'] == 200
          raise DiagnosticError.new(phase: 'sample_http', status: sample['status'])
        end
        if sample['write_sql_seen']
          raise DiagnosticError.new(phase: 'sample_write_sql', status: sample['status'],
                                   write_sql_count: sample['write_sql_count'])
        end

        sample
      end

      puts JSON.pretty_generate(
        'environment' => Rails.env,
        'runtime' => { 'ruby' => RUBY_VERSION, 'rails' => Rails.version, 'redmine' => Redmine::VERSION.to_s },
        'user_id' => user.id,
        'project_id' => project.id,
        'warmups' => options[:warmups],
        'measurement_mode' => options[:detail] ? 'detailed' : 'coarse',
        'gc_delta_scope' => 'Ruby process-wide GC counters sampled around each request; unsupported counters are null',
        'stage_nesting' => {
          'nested_issue_sort' => ['query_state_resolve'],
          'nested_budget_load_records' => %w[query_state_resolve business_calendar_payload relations_load payload_build],
          'build_tasks' => ['payload_build'],
          'build_task_state' => ['build_tasks'],
          'custom_fields.task_values' => ['build_task_state'],
          'custom_fields.applicable_ids' => ['custom_fields.task_values'],
          'custom_fields.ids_from_values' => ['custom_fields.task_values'],
          'issue.available_custom_fields' => %w[custom_fields.applicable_ids custom_fields.task_values],
          'active_record.preloader.call' => ['nested_budget_load_records']
        },
        'samples' => samples
      )
    ensure
      Rails.logger = previous_rails_logger
      ActiveRecord::Base.logger = previous_active_record_logger
      ActionController::Base.logger = previous_action_controller_logger
      ApplicationController.logger = previous_application_controller_logger
      previous_subscriber_loggers.each { |subscriber, logger| subscriber.logger = logger }
    end
  end
end

if ENV['REDMINE_CANVAS_GANTT_PROFILE'] == '1'
  begin
    CanvasGanttDataRequestProfiler.run(ARGV)
  rescue CanvasGanttDataRequestProfiler::DiagnosticError => error
    details = ["phase=#{error.phase}", ("http_status=#{error.status}" if error.status),
               "write_sql_count=#{error.write_sql_count}"].compact.join(' ')
    warn "Canvas Gantt data request profiling failed (#{details})."
    exit 1
  rescue StandardError => error
    # Exception messages can include request or database details; emit only class and source locations.
    locations = Array(error.backtrace).first(5).join("\n  ")
    warn "Canvas Gantt data request profiling failed (#{error.class}).\n  #{locations}"
    exit 1
  end
end
