require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/settings_cleanup'

RSpec.describe RedmineCanvasGantt::SettingsCleanup do
  subject(:cleanup) { described_class.new }

  before do
    Setting.plugin_redmine_canvas_gantt = {
      'row_height' => '36',
      'baseline_snapshots' => {
        '1' => {
          'snapshot_id' => 'baseline-1',
          'project_id' => 1
        }
      }
    }
    Setting.clear_cache
  end

  after do
    Setting.where(name: described_class::SETTING_NAME).delete_all
    Setting.clear_cache
  end

  it 'deletes the complete plugin settings row including stored baselines' do
    expect(cleanup.call).to eq(1)
    expect(Setting.where(name: described_class::SETTING_NAME)).not_to exist
  end

  it 'is idempotent when the settings row does not exist' do
    cleanup.call

    expect(cleanup.call).to eq(0)
  end
end
