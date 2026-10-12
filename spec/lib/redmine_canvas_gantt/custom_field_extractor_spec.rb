require_relative '../../spec_helper'

RSpec.describe RedmineCanvasGantt::CustomFieldExtractor do
  let(:serializer) { instance_double(RedmineCanvasGantt::CustomFieldSerializer) }
  let(:extractor) do
    described_class.new(serializer: serializer, supported_formats: %w[string date list])
  end

  def custom_field(id:, format: 'string', multiple: false)
    instance_double(
      IssueCustomField,
      id: id,
      field_format: format,
      multiple?: multiple
    )
  end

  def custom_value(field, value)
    double('CustomFieldValue', custom_field: field, value: value)
  end

  def redmine_field(id:, format:, default_value: nil, possible_values: nil)
    field = IssueCustomField.new(
      name: "Canvas field #{id}",
      field_format: format,
      default_value: default_value,
      possible_values: possible_values
    )
    field.id = id
    field
  end

  def build_redmine_issue
    issue = Issue.new
    stored_values = []
    custom_values = double('custom_values')
    allow(custom_values).to receive(:detect) { |&block| stored_values.detect(&block) }
    allow(custom_values).to receive(:build) do |attributes|
      value = CustomValue.new(attributes)
      allow(value).to receive(:save).and_return(true)
      stored_values << value
      value
    end
    allow(custom_values).to receive(:each) { |&block| stored_values.each(&block) }
    allow(issue).to receive(:custom_values).and_return(custom_values)
    allow(issue).to receive(:custom_values=)
    issue
  end

  describe '#build_task_custom_field_values' do
    it 'keeps only applicable, supported, single-value fields and preserves their values' do
      applicable = custom_field(id: 1, format: 'date')
      unsupported = custom_field(id: 2, format: 'attachment')
      multiple = custom_field(id: 3, multiple: true)
      not_applicable = custom_field(id: 4)
      issue = instance_double(
        Issue,
        available_custom_fields: [applicable, unsupported, multiple],
        custom_field_values: [
          custom_value(applicable, '2026-10-12'),
          custom_value(unsupported, 'file'),
          custom_value(multiple, ['one', 'two']),
          custom_value(not_applicable, 'excluded')
        ]
      )

      expect(extractor.build_task_custom_field_values(issue)).to eq('1' => '2026-10-12')
    end

    it 'uses values as the applicability fallback when no available fields are returned' do
      field = custom_field(id: 5)
      issue = instance_double(
        Issue,
        available_custom_fields: [],
        custom_field_values: [custom_value(field, nil)]
      )

      expect(extractor.build_task_custom_field_values(issue)).to eq('5' => nil)
    end

    it 'returns an empty map when applicability lookup fails' do
      issue = instance_double(Issue, custom_field_values: [])
      allow(issue).to receive(:available_custom_fields).and_raise(StandardError)

      expect(extractor.build_task_custom_field_values(issue)).to eq({})
    end

    it 'reuses the base custom values implementation as the applicability source' do
      issue_class = Class.new do
        include Redmine::Acts::Customizable::InstanceMethods
      end
      issue = issue_class.new
      allow(issue).to receive(:available_custom_fields).and_return([])

      expect(extractor.build_task_custom_field_values(issue)).to eq({})
      expect(issue).to have_received(:available_custom_fields).once
    end

    it 'preserves date, list, default, and nil values from Redmine custom values' do
      issue = build_redmine_issue
      date_field = redmine_field(id: 10_001, format: 'date', default_value: '2026-10-12')
      list_field = redmine_field(
        id: 10_002,
        format: 'list',
        default_value: 'Ready',
        possible_values: "Ready\nBlocked"
      )
      nil_field = redmine_field(id: 10_003, format: 'string')
      allow(issue).to receive(:available_custom_fields).and_return([date_field, list_field, nil_field])

      expect(extractor.build_task_custom_field_values(issue)).to eq(
        '10001' => '2026-10-12',
        '10002' => 'Ready',
        '10003' => nil
      )
    end

    it 'rebuilds Redmine custom values after tracker and project changes' do
      issue = build_redmine_issue
      project_a = Project.new(name: 'Canvas field project A', identifier: 'canvas-cf-project-a')
      project_a.id = 20_001
      project_b = Project.new(name: 'Canvas field project B', identifier: 'canvas-cf-project-b')
      project_b.id = 20_002
      tracker_a = Tracker.new(name: 'Canvas field tracker A')
      tracker_a.id = 20_011
      tracker_b = Tracker.new(name: 'Canvas field tracker B')
      tracker_b.id = 20_012
      [tracker_a, tracker_b].each do |tracker|
        allow(tracker).to receive(:default_status).and_return(nil)
        allow(tracker).to receive(:issue_status_ids).and_return([])
      end
      allow(project_a).to receive(:default_version_id?).and_return(false)
      allow(project_b).to receive(:default_version_id?).and_return(false)
      issue.project = project_a
      issue.tracker = tracker_a

      project_tracker_field = redmine_field(id: 20_101, format: 'string', default_value: 'project A')
      tracker_field = redmine_field(id: 20_102, format: 'string', default_value: 'tracker B')
      changed_project_field = redmine_field(id: 20_103, format: 'string', default_value: 'project B')
      fields_by_context = {
        [project_a.id, tracker_a.id] => [project_tracker_field],
        [project_a.id, tracker_b.id] => [tracker_field],
        [project_b.id, tracker_b.id] => [changed_project_field]
      }
      allow(issue).to receive(:available_custom_fields) do
        fields_by_context.fetch([issue.project_id, issue.tracker_id], [])
      end

      expect(extractor.build_task_custom_field_values(issue)).to eq('20101' => 'project A')

      issue.tracker = tracker_b
      expect(extractor.build_task_custom_field_values(issue)).to eq('20102' => 'tracker B')

      issue.send(:project=, project_b, true)
      expect(extractor.build_task_custom_field_values(issue)).to eq('20103' => 'project B')
    end

    it 'keeps override applicability filtering and fallback order, including multiple fields' do
      allowed = custom_field(id: 21, format: 'date')
      multiple = custom_field(id: 22, multiple: true)
      not_applicable = custom_field(id: 23)
      values = [
        custom_value(allowed, '2026-10-12'),
        custom_value(multiple, ['one', 'two']),
        custom_value(not_applicable, 'excluded')
      ]
      issue = instance_double(Issue)
      expect(issue).to receive(:available_custom_fields).ordered.and_return([allowed, multiple])
      expect(issue).to receive(:custom_field_values).ordered.and_return(values)

      expect(extractor.build_task_custom_field_values(issue)).to eq('21' => '2026-10-12')
    end

    it 'uses the old values fallback when an override returns no available fields' do
      field = custom_field(id: 24)
      values = [custom_value(field, 'fallback')]
      issue = instance_double(Issue)
      expect(issue).to receive(:available_custom_fields).ordered.and_return([])
      expect(issue).to receive(:custom_field_values).ordered.and_return(values)
      expect(issue).to receive(:custom_field_values).ordered.and_return(values)

      expect(extractor.build_task_custom_field_values(issue)).to eq('24' => 'fallback')
    end
  end
end
