require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/issue_schedule_calendar_patch'

RSpec.describe RedmineCanvasGantt::IssueScheduleCalendarPatch do
  let(:issue_class) do
    Class.new do
      attr_accessor :start_date, :due_date

      def initialize(start_date:, due_date:)
        @start_date = start_date
        @due_date = due_date
      end

      def reschedule_on(date)
        duration = working_duration
        self.start_date = next_working_date(date)
        self.due_date = add_working_days(start_date, duration)
      end

      def working_duration
        (start_date && due_date) ? (due_date - start_date).to_i : 0
      end

      def next_working_date(date)
        date + 1
      end

      def add_working_days(date, days)
        date + days
      end
    end
  end

  before do
    issue_class.prepend(described_class)
  end

  it 'delegates to Redmine behavior that fills the due date when a start-only issue is rescheduled' do
    issue = issue_class.new(start_date: Date.new(2027, 1, 4), due_date: nil)

    issue.reschedule_on(Date.new(2027, 1, 11))

    expect(issue.start_date).to eq(Date.new(2027, 1, 12))
    expect(issue.due_date).to eq(Date.new(2027, 1, 12))
  end

  it 'keeps Redmine duration behavior for complete date ranges' do
    issue = issue_class.new(start_date: Date.new(2027, 1, 4), due_date: Date.new(2027, 1, 6))

    issue.reschedule_on(Date.new(2027, 1, 11))

    expect(issue.start_date).to eq(Date.new(2027, 1, 12))
    expect(issue.due_date).to eq(Date.new(2027, 1, 14))
  end
end

RSpec.describe 'Redmine Issue#reschedule_on contract' do
  it 'materializes due_date for a start-only issue using the real Issue class' do
    issue = Issue.new(
      start_date: Date.new(2027, 1, 4),
      due_date: nil
    )

    expect(issue.working_duration).to eq(0)

    issue.reschedule_on(Date.new(2027, 1, 11))

    expect(issue.start_date).to be_present
    expect(issue.due_date).to eq(issue.start_date)
  end
end
