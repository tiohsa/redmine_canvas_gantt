require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/canvas_gantts_controller_patch'

RSpec.describe RedmineCanvasGantt::CanvasGanttsControllerPatch do
  let(:base_controller_class) do
    Class.new do
      attr_accessor :relation_type, :validation_calls

      private

      def relation_params
        { relation_type: relation_type }
      end

      def ensure_business_calendar_available!
        self.validation_calls = validation_calls.to_i + 1
        :validated
      end
    end
  end

  let(:controller_class) do
    base_controller_class.const_set(:DELAY_RELATION_TYPES, %w[precedes follows].freeze)
    Class.new(base_controller_class).tap do |klass|
      klass.prepend(described_class)
    end
  end

  it 'validates the business calendar for working-day delay relations' do
    controller = controller_class.new
    controller.relation_type = 'precedes'

    expect(controller.send(:ensure_business_calendar_available!)).to eq(:validated)
    expect(controller.validation_calls).to eq(1)
  end

  it 'does not block relation types that do not use working-day delays' do
    controller = controller_class.new
    controller.relation_type = 'relates'

    expect(controller.send(:ensure_business_calendar_available!)).to be(true)
    expect(controller.validation_calls).to be_nil
  end

  it 'loads calendar assignments only for visible projects' do
    controller = controller_class.new
    visible_scope = double('visible projects')
    selected_scope = double('selected visible projects')
    projects = [double('project')]

    allow(Project).to receive(:visible).and_return(visible_scope)
    expect(visible_scope).to receive(:where).with(id: [1, 2]).and_return(selected_scope)
    expect(selected_scope).to receive(:to_a).and_return(projects)

    expect(controller.send(:business_calendar_projects, [1, 2])).to eq(projects)
  end
end
