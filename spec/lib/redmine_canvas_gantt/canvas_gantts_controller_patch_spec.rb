require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/canvas_gantts_controller_patch'

RSpec.describe RedmineCanvasGantt::CanvasGanttsControllerPatch do
  it 'is applied to the controller during plugin initialization' do
    expect(CanvasGanttsController).to be < described_class
    expect(CanvasGanttsController.instance_method(:business_calendar_projects).owner).to eq(described_class)
  end

  let(:controller_class) do
    Class.new do
      prepend RedmineCanvasGantt::CanvasGanttsControllerPatch
    end
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
