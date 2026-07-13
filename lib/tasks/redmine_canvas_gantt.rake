# frozen_string_literal: true

require_relative '../redmine_canvas_gantt/settings_cleanup'

namespace :redmine_canvas_gantt do
  desc 'Remove Redmine Canvas Gantt plugin settings, including stored baselines'
  task uninstall: :environment do
    deleted_count = RedmineCanvasGantt::SettingsCleanup.new.call

    if deleted_count.positive?
      puts 'Removed Redmine Canvas Gantt plugin settings and stored baselines.'
    else
      puts 'No Redmine Canvas Gantt plugin settings were found.'
    end
  end
end
