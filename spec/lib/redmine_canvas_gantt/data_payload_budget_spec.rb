require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/data_payload_budget'

RSpec.describe RedmineCanvasGantt::DataPayloadBudget do
  it 'allows operators to lower limits but never raise the finite hard maxima' do
    budget = described_class.new(
      environment: {
        'REDMINE_CANVAS_GANTT_MAX_DATA_ISSUES' => '250',
        'REDMINE_CANVAS_GANTT_MAX_DATA_RELATIONS' => '999999',
        'REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS' => '125',
        'REDMINE_CANVAS_GANTT_MAX_DATA_BYTES' => '1024'
      }
    )

    expect(budget.issue_limit).to eq(250)
    expect(budget.relation_limit).to eq(described_class::HARD_MAX_RELATIONS)
    expect(budget.collection_limit).to eq(125)
    expect(budget.byte_limit).to eq(1024)
  end

  it 'probes one record beyond the limit and raises instead of truncating' do
    scope = double('bounded scope')
    limited_scope = double('limited scope')
    allow(scope).to receive(:limit).with(4).and_return(limited_scope)
    allow(limited_scope).to receive(:to_a).and_return(%i[a b c d])
    budget = described_class.new(environment: {})

    expect do
      budget.load_records(scope, resource: 'issues', limit: 3)
    end.to raise_error(described_class::Exceeded) { |error|
      expect(error.resource).to eq('issues')
      expect(error.limit).to eq(3)
      expect(error.actual).to eq(4)
    }
  end

  it 'allows exactly the hard issue maximum' do
    records = Array.new(described_class::HARD_MAX_ISSUES, :issue)
    scope = double('issue scope')
    limited_scope = double('limited issue scope')
    allow(scope).to receive(:limit)
      .with(described_class::HARD_MAX_ISSUES + 1)
      .and_return(limited_scope)
    allow(limited_scope).to receive(:to_a).and_return(records)
    budget = described_class.new(environment: {})

    expect(
      budget.load_records(
        scope,
        resource: 'issues',
        limit: described_class::HARD_MAX_ISSUES
      )
    ).to equal(records)
  end

  it 'returns encoded JSON within the byte budget and rejects larger payloads' do
    budget = described_class.new(
      environment: { 'REDMINE_CANVAS_GANTT_MAX_DATA_BYTES' => '12' }
    )

    expect(budget.encode_json(ok: true)).to eq('{"ok":true}')
    expect { budget.encode_json(message: 'too large') }
      .to raise_error(described_class::Exceeded) { |error|
        expect(error.resource).to eq('json_bytes')
        expect(error.limit).to eq(12)
      }
  end
end
