# frozen_string_literal: true

module RedmineCanvasGantt
  class SettingsCleanup
    SETTING_NAME = 'plugin_redmine_canvas_gantt'.freeze

    def initialize(setting_model: nil)
      @setting_model = setting_model || Setting
    end

    def call
      deleted_count = @setting_model.where(name: SETTING_NAME).delete_all
      @setting_model.clear_cache if @setting_model.respond_to?(:clear_cache)
      deleted_count
    end
  end
end
