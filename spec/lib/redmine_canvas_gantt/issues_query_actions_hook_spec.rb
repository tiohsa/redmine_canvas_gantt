require_relative '../../spec_helper'

RSpec.describe 'issues query actions hook' do
  it 'is not loaded from init.rb' do
    init_rb = File.read(Rails.root.join('plugins', 'redmine_canvas_gantt', 'init.rb'))

    expect(init_rb).not_to include('issues_query_actions_hook')
  end

  it 'does not keep the deprecated hook listener file' do
    hook_path = Rails.root.join('plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt', 'issues_query_actions_hook.rb')

    expect(File.exist?(hook_path)).to be(false)
  end
end
