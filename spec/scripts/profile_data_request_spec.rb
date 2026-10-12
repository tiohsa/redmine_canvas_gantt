require_relative '../spec_helper'
require_relative '../../scripts/profile-data-request'

RSpec.describe CanvasGanttDataRequestProfiler do
  describe '.summarize_payload' do
    it 'reports only top-level types, collection counts, and encoded byte sizes' do
      payload = { tasks: [{ id: 4 }, { id: 9 }], project: { name: 'secret' }, warnings: [], status: 'ok' }

      expect(described_class.summarize_payload(payload)).to eq(
        'tasks' => { 'type' => 'array', 'count' => 2, 'encode_bytes' => JSON.generate(payload[:tasks]).bytesize },
        'project' => { 'type' => 'object', 'count' => 1, 'encode_bytes' => JSON.generate(payload[:project]).bytesize },
        'warnings' => { 'type' => 'array', 'count' => 0, 'encode_bytes' => 2 },
        'status' => { 'type' => 'string', 'count' => nil, 'encode_bytes' => JSON.generate(payload[:status]).bytesize }
      )
    end

    it 'returns an empty summary for a non-object payload' do
      expect(described_class.summarize_payload(['private'])).to eq({})
    end
  end

  describe '.parse_options' do
    it 'requires numeric user and project ids and bounds request counts' do
      options = described_class.parse_options(%w[--user-id 7 --project-id 1 --warmups 0 --samples 3])

      expect(options).to eq(user_id: 7, project_id: 1, warmups: 0, samples: 3, detail: false)
      expect(described_class.parse_options(%w[--user-id 7 --project-id 1 --detail])[:detail]).to be(true)
      expect do
        described_class.parse_options(%w[--user-id 7 --project-id 1 --samples 51])
      end.to raise_error(OptionParser::InvalidArgument)
    end
  end

  describe '.gc_delta' do
    it 'returns process counter differences and null for unavailable counters' do
      before = { time: 12, total_allocated_objects: 100, total_allocated_pages: nil,
                 minor_gc_count: 3, major_gc_count: 1 }
      after = { time: 20, total_allocated_objects: 150, total_allocated_pages: nil,
                minor_gc_count: 4, major_gc_count: 1 }

      expect(described_class.gc_delta(before, after)).to eq(
        'time' => 8,
        'total_allocated_objects' => 50,
        'total_allocated_pages' => nil,
        'minor_gc_count' => 1,
        'major_gc_count' => 0
      )
    end
  end
end
