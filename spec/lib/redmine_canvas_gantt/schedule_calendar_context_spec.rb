require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/schedule_calendar_context'

RSpec.describe RedmineCanvasGantt::ScheduleCalendarContext do
  it 'restores the previous resolver after the scoped callback chain' do
    outer = Object.new
    inner = Object.new

    described_class.with(resolver: outer) do
      expect(described_class.current).to equal(outer)
      described_class.with(resolver: inner) do
        expect(described_class.current).to equal(inner)
      end
      expect(described_class.current).to equal(outer)
    end

    expect(described_class.current).to be_nil
  end
end
