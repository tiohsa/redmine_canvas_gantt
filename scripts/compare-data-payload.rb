# frozen_string_literal: true

# Run in an isolated Rails runner process. Baseline sources must be trusted local
# copies of issue_selector.rb and custom_field_extractor.rb from the pre-change
# revision. Responses are compared in memory; no issue data or credentials are
# written or printed. Authentication/rollback follow profile-data-request.rb.
#
# bundle exec rails runner plugins/redmine_canvas_gantt/scripts/compare-data-payload.rb \
#   --baseline-dir plugins/redmine_canvas_gantt/tmp/performance-reference --project-id 1
require_relative 'profile-data-request'

module CanvasGanttDataPayloadComparison
  module_function

  def with_classes(classes)
    original = classes.keys.to_h { |name| [name, RedmineCanvasGantt.const_get(name)] }
    classes.each do |name, klass|
      RedmineCanvasGantt.send(:remove_const, name)
      RedmineCanvasGantt.const_set(name, klass)
    end
    yield
  ensure
    original&.each do |name, klass|
      RedmineCanvasGantt.send(:remove_const, name)
      RedmineCanvasGantt.const_set(name, klass)
    end
  end

  def baseline_classes(directory)
    namespace = Module.new
    %w[issue_selector custom_field_extractor].each do |file|
      # Retain the original source location so require_relative resolves to the
      # plugin's dependencies rather than the temporary snapshot directory.
      filename = Rails.root.join('plugins/redmine_canvas_gantt/lib/redmine_canvas_gantt', "#{file}.rb").to_s
      namespace.module_eval(File.read(File.join(directory, "#{file}.rb")), filename)
    end
    reference = namespace.const_get(:RedmineCanvasGantt)
    reference.const_set(:SpentHoursBatch, RedmineCanvasGantt::SpentHoursBatch)
    %i[IssueSelector CustomFieldExtractor].to_h { |name| [name, reference.const_get(name)] }
  end

  def compare(user, project, reference, params)
    session = ActionDispatch::Integration::Session.new(Rails.application)
    path = "/projects/#{project.to_param}/canvas_gantt/data.json"
    profiler = CanvasGanttDataRequestProfiler
    before = with_classes(reference) do
      metrics = profiler.measure_request(session, user: user, path: path, project_id: project.id, params: params)
      [metrics, session.response.body.dup]
    end
    after_metrics = profiler.measure_request(session, user: user, path: path, project_id: project.id, params: params)
    after_body = session.response.body
    equal = before[0]['status'] == after_metrics['status'] && JSON.parse(before[1]) == JSON.parse(after_body)
    {
      'user_id' => user.id,
      'before_status' => before[0]['status'],
      'after_status' => after_metrics['status'],
      'payload_equal' => equal,
      'bytes_equal' => before[1] == after_body,
      'task_count' => after_metrics.dig('top_level_payload', 'tasks', 'count'),
      'write_sql_count' => before[0]['write_sql_count'] + after_metrics['write_sql_count']
    }
  end

  def run(arguments)
    options = {}
    OptionParser.new do |parser|
      parser.on('--baseline-dir DIR') { |value| options[:baseline_dir] = value }
      parser.on('--project-id ID', Integer) { |value| options[:project_id] = value }
    end.parse!(arguments)
    raise ArgumentError unless options[:baseline_dir] && options[:project_id] && arguments.empty?

    logger_owners = [Rails, ActiveRecord::Base, ActionController::Base, ApplicationController]
    logger_owners.concat(ActiveSupport::LogSubscriber.log_subscribers.select { |s| s.respond_to?(:logger=) })
    original_loggers = logger_owners.map { |owner| [owner, owner.logger] }
    quiet = Logger.new(File::NULL)
    logger_owners.each { |owner| owner.logger = quiet }

    project = Project.find(options[:project_id])
    reference = baseline_classes(options[:baseline_dir])
    CanvasGanttDataRequestProfiler.install_request_safety_overrides!
    active_users = User.active.order(:id).to_a
    viewers = active_users.select { |u| u.allowed_to?(:view_canvas_gantt, project) }
    admin = viewers.find(&:admin?)
    ordinary = viewers.reject(&:admin?).first(2)
    denied = active_users.find { |u| !u.allowed_to?(:view_canvas_gantt, project) }
    cases = []
    ([admin] + ordinary).compact.each do |user|
      [
        ['default', {}],
        ['subject_desc', { sort: 'subject:desc' }],
        ['due_date_desc', { sort: 'dueDate:desc' }],
        ['spent_hours_desc', { sort: 'spentHours:desc' }],
        ['unassigned', { assigned_to_ids: ['_none'] }],
        ['unset_version', { fixed_version_ids: ['_none'] }],
        ['subprojects', { show_subprojects: '1' }],
        ['missing_project', { project_ids: ['2147483647'] }],
        ['status_subset', { status_ids: [IssueStatus.order(:id).first.id.to_s] }],
        ['tracker_subset', { tracker_ids: [Tracker.order(:id).first.id.to_s] }]
      ].each do |label, params|
        cases << compare(user, project, reference, params).merge('case' => label, 'expected_status' => 200)
      end
      IssueQuery.order(:id).limit(10).select { |query| query.visible?(user) }.first(2).each do |query|
        cases << compare(user, project, reference, { query_id: query.id.to_s })
          .merge('case' => "saved_query_#{query.id}", 'expected_status' => 200)
      end
    end
    cases << compare(denied, project, reference, {}).merge('case' => 'view_denied', 'expected_status' => 403) if denied
    if admin
      old_limit = ENV['REDMINE_CANVAS_GANTT_MAX_DATA_ISSUES']
      begin
        ENV['REDMINE_CANVAS_GANTT_MAX_DATA_ISSUES'] = '5'
        cases << compare(admin, project, reference, {}).merge('case' => 'issue_limit', 'expected_status' => 413)
      ensure
        ENV['REDMINE_CANVAS_GANTT_MAX_DATA_ISSUES'] = old_limit
      end
    end
    raise ArgumentError if cases.empty?

    puts JSON.pretty_generate('project_id' => project.id, 'cases' => cases,
                              'all_equal' => cases.all? { |c| c['payload_equal'] && c['bytes_equal'] &&
                                c['write_sql_count'].zero? && c['after_status'] == c['expected_status'] })
    exit 1 unless cases.all? { |c| c['payload_equal'] && c['bytes_equal'] && c['write_sql_count'].zero? &&
      c['after_status'] == c['expected_status'] }
  ensure
    original_loggers&.each { |owner, logger| owner.logger = logger }
  end
end

begin
  CanvasGanttDataPayloadComparison.run(ARGV)
rescue StandardError => error
  warn "Canvas Gantt payload comparison failed (#{error.class})."
  exit 1
end
