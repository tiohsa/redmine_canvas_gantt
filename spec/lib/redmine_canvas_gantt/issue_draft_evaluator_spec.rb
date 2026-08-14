require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/issue_draft_evaluator'

RSpec.describe RedmineCanvasGantt::IssueDraftEvaluator do
  FakeTracker = Struct.new(:id, :name)
  FakeProject = Struct.new(:id, :trackers, :issue_categories)
  FakeCustomFieldValue = Struct.new(:custom_field_id, :value)

  class FakeDraftIssue
    attr_accessor :project, :tracker, :status_id, :fixed_version_id, :category_id, :lock_version,
                  :subject, :assigned_to_id, :done_ratio, :due_date, :start_date, :priority_id,
                  :estimated_hours, :parent_id, :parent_issue_id
    attr_reader :id, :safe_attribute_assignments, :journal_user

    def initialize(project:, tracker:, allowed_trackers:, status_id: 1, lock_version: 3, destination_safe_fields: [])
      @id = 10
      @project = project
      @tracker = tracker
      @allowed_trackers = allowed_trackers
      @status_id = status_id
      @lock_version = lock_version
      @subject = 'Draft issue'
      @done_ratio = 0
      @changes = {}
      @custom_field_values_by_id = { '5' => 'persisted' }
      @safe_attribute_assignments = []
      @destination_safe_fields = destination_safe_fields
    end

    def new_record?
      false
    end

    def init_journal(user)
      @journal_user = user
    end

    def project_id
      project.id
    end

    def tracker_id
      tracker.id
    end

    def safe_attribute?(field)
      return false if field == 'author_id'
      return @destination_safe_fields.include?(field) if @project.id == 1 && @tracker.id == 4

      true
    end

    def safe_attributes=(attributes)
      @safe_attribute_assignments << attributes.to_h.keys
      attributes = attributes.to_h.transform_keys(&:to_sym)
      if attributes.key?(:project_id)
        target = self.class.projects[attributes[:project_id].to_i]
        if target
          @changes['project_id'] ||= [project_id, target.id]
          self.project = target
        end
      end
      if attributes.key?(:tracker_id)
        target = @allowed_trackers.find { |candidate| candidate.id == attributes[:tracker_id].to_i }
        if target
          @changes['tracker_id'] ||= [tracker_id, target.id]
          self.tracker = target
        end
      end
      self.estimated_hours = attributes[:estimated_hours].to_f if attributes.key?(:estimated_hours)
      self.status_id = attributes[:status_id].to_i if attributes.key?(:status_id) && attributes[:status_id].to_i == 2
      self.lock_version = attributes[:lock_version].to_i if attributes.key?(:lock_version)
      self.parent_issue_id = attributes[:parent_issue_id].to_i if attributes.key?(:parent_issue_id)
      self.fixed_version_id = nil if attributes.key?(:fixed_version_id) && attributes[:fixed_version_id].blank?
      self.category_id = nil if attributes.key?(:category_id) && attributes[:category_id].blank?
      if attributes.key?(:custom_field_values)
        attributes[:custom_field_values].to_h.each do |custom_field_id, value|
          @custom_field_values_by_id[custom_field_id.to_s] = value
        end
      end
    end

    def allowed_target_trackers(_user)
      @allowed_trackers
    end

    def valid?
      true
    end

    def custom_field_values
      @custom_field_values_by_id.map { |custom_field_id, value| FakeCustomFieldValue.new(custom_field_id, value) }
    end

    def custom_field_value(custom_field_id)
      @custom_field_values_by_id[custom_field_id.to_s]
    end

    def errors
      ActiveModel::Errors.new(self)
    end

    def changes
      @changes
    end

    class << self
      attr_accessor :projects
    end
  end

  let(:user) { instance_double(User) }
  let(:source_tracker) { FakeTracker.new(4, 'Source') }
  let(:target_tracker) { FakeTracker.new(7, 'Target') }
  let(:source_project) { FakeProject.new(1, [source_tracker], []) }
  let(:target_project) { FakeProject.new(2, [target_tracker], []) }
  let(:project_scope) do
    Class.new do
      define_method(:initialize) { |projects| @projects = projects }
      define_method(:find_by) { |id:| @projects[id.to_i] }
    end.new(1 => source_project, 2 => target_project)
  end
  let(:project_class) do
    Class.new do
      class << self
        attr_accessor :visible_scope
      end
      define_singleton_method(:visible) { visible_scope }
    end.tap { |klass| klass.visible_scope = project_scope }
  end
  let(:evaluator) do
    described_class.new(
      current_user: user,
      project_scope_ids: [1, 2],
      project_class: project_class
    )
  end

  before do
    FakeDraftIssue.projects = { 1 => source_project, 2 => target_project }
    allow(user).to receive(:allowed_to?).and_return(true)
  end

  it 'rejects an explicitly requested tracker when Redmine ignores it' do
    issue = FakeDraftIssue.new(
      project: source_project,
      tracker: source_tracker,
      allowed_trackers: [source_tracker]
    )

    result = evaluator.evaluate(issue: issue, intent: { tracker_id: 99, lock_version: 3 })

    expect(result.violations).to include(include(field: 'tracker_id', code: 'not_accepted'))
  end

  it 'passes string keys through the Redmine safe-attribute boundary' do
    issue = FakeDraftIssue.new(
      project: source_project,
      tracker: source_tracker,
      allowed_trackers: [source_tracker]
    )

    evaluator.evaluate(issue: issue, intent: { status_id: 2, lock_version: 3 })

    expect(issue.safe_attribute_assignments.flatten).to all(be_a(String))
    expect(issue.journal_user).to be(user)
  end

  it 'rejects Author as an unsupported mutation field' do
    issue = FakeDraftIssue.new(
      project: source_project,
      tracker: source_tracker,
      allowed_trackers: [source_tracker]
    )

    result = evaluator.evaluate(issue: issue, intent: { author_id: 9, lock_version: 3 })

    expect(result.violations).to include(include(field: 'author_id', code: 'unsupported_field'))
  end

  it 'returns an empty materialized patch for a stale revision' do
    issue = FakeDraftIssue.new(
      project: source_project,
      tracker: source_tracker,
      allowed_trackers: [source_tracker]
    )

    result = evaluator.evaluate(issue: issue, intent: { subject: 'Stale', lock_version: 2 })

    expect(result.materialized).to eq({})
    expect(result.violations).to include(include(field: 'lock_version', code: 'stale_revision'))
  end

  it 'accepts a valid project and tracker in one draft even when the old tracker is unavailable' do
    issue = FakeDraftIssue.new(
      project: source_project,
      tracker: source_tracker,
      allowed_trackers: [target_tracker]
    )

    result = evaluator.evaluate(
      issue: issue,
      intent: { project_id: 2, tracker_id: 7, lock_version: 3 }
    )

    expect(result.violations).to be_empty
    expect(issue).to have_attributes(project_id: 2, tracker_id: 7, new_record?: false)
  end

  it 'applies Project and its previous Category in one Redmine safe-attribute evaluation' do
    issue = FakeDraftIssue.new(
      project: source_project,
      tracker: source_tracker,
      allowed_trackers: [target_tracker]
    )
    issue.category_id = 11

    result = evaluator.evaluate(
      issue: issue,
      intent: { project_id: 2, category_id: 11, lock_version: 3 }
    )

    expect(issue.safe_attribute_assignments.size).to eq(1)
    expect(result.violations).not_to include(include(field: 'project_id', code: 'not_accepted'))
  end

  it 'accepts and materializes Redmine parent_issue_id virtual state' do
    issue = FakeDraftIssue.new(
      project: source_project,
      tracker: source_tracker,
      allowed_trackers: [target_tracker]
    )

    result = evaluator.evaluate(
      issue: issue,
      intent: { project_id: 2, tracker_id: 7, parent_issue_id: 11, lock_version: 3 }
    )

    expect(result).to be_valid
    expect(result.materialized).to include(project_id: 2, parent_issue_id: 11)
  end

  it 'evaluates a field using the destination tracker instead of source safe attributes' do
    issue = FakeDraftIssue.new(
      project: source_project,
      tracker: source_tracker,
      allowed_trackers: [target_tracker],
      destination_safe_fields: ['estimated_hours']
    )

    result = evaluator.evaluate(
      issue: issue,
      intent: { project_id: 2, tracker_id: 7, estimated_hours: 4, lock_version: 3 }
    )

    expect(result.violations).not_to include(include(field: 'estimated_hours', code: 'unsafe_field'))
    expect(result).to be_valid
    expect(issue.estimated_hours).to eq(4.0)
  end

  it 'materializes an allowed tracker fallback as policy normalization' do
    issue = FakeDraftIssue.new(
      project: source_project,
      tracker: source_tracker,
      allowed_trackers: [target_tracker]
    )

    result = evaluator.evaluate(issue: issue, intent: { project_id: 2, lock_version: 3 })

    expect(result.materialized).to include(project_id: 2, tracker_id: 7)
    expect(result.normalizations).to include(
      include(field: 'tracker_id', to: 7, source: 'policy')
    )
    expect(result.draft_contract.to_json.bytesize).to be <= 8.kilobytes
  end

  it 'uses the destination Issue domain tracker candidates for policy fallback' do
    domain_issue_class = Class.new(FakeDraftIssue) do
      class << self
        attr_accessor :domain_trackers, :domain_arguments

        def allowed_target_trackers(*arguments)
          self.domain_arguments = arguments
          domain_trackers
        end
      end
    end
    domain_issue_class.projects = FakeDraftIssue.projects
    issue = domain_issue_class.new(
      project: source_project,
      tracker: source_tracker,
      allowed_trackers: [target_tracker]
    )
    domain_issue_class.domain_trackers = [target_tracker]

    result = RedmineCanvasGantt::IssueDraftEvaluator.new(
      current_user: user,
      project_scope_ids: [1, 2],
      project_class: project_class
    ).evaluate(issue: issue, intent: { project_id: 2, lock_version: 3 })

    expect(result).to be_valid
    expect(domain_issue_class.domain_arguments).to eq([target_project, user, source_tracker.id])
    expect(result.materialized).to include(tracker_id: target_tracker.id)
  end

  it 'treats Version and Category clears as Redmine canonical best-effort normalization' do
    issue = FakeDraftIssue.new(
      project: source_project,
      tracker: source_tracker,
      allowed_trackers: [target_tracker]
    )
    issue.fixed_version_id = 8
    issue.category_id = 11

    result = evaluator.evaluate(issue: issue, intent: { project_id: 2, lock_version: 3 })

    expect(result).to be_valid
    expect(result.violations).not_to include(include(code: 'policy_not_accepted'))
    expect(result.materialized).to include(fixed_version_id: nil, category_id: nil)
  end

  it 'materializes only explicitly requested or changed custom field values' do
    issue = FakeDraftIssue.new(
      project: source_project,
      tracker: source_tracker,
      allowed_trackers: [source_tracker]
    )

    result = evaluator.evaluate(
      issue: issue,
      intent: { custom_field_values: { '9' => 'draft' }, lock_version: 3 }
    )

    expect(result).to be_valid
    expect(result.materialized).to include(custom_field_values: { '9' => 'draft' })
    expect(result.materialized[:custom_field_values]).not_to have_key('5')
  end
end
