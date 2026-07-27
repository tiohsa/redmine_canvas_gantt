require 'redmine'

Redmine::Plugin.register :redmine_canvas_gantt do
  name 'Redmine Canvas Gantt plugin'
  author 'tiohsa'
  description 'A high-performance Canvas-based Gantt chart plugin'
  version '0.11.0'
  url 'https://github.com/tiohsa/redmine_canvas_gantt'
  author_url 'https://github.com/tiohsa/redmine_canvas_gantt'

  project_module :canvas_gantt do
    permission :view_canvas_gantt, {
      canvas_gantts: [
        :index, :data, :queries, :edit_meta, :update, :destroy_task,
        :bulk_create_subtasks, :subtask_trackers, :create_relation,
        :update_relation, :destroy_relation, :save_baseline
      ]
    }
    permission :manage_canvas_gantt_baseline, { canvas_gantts: [:save_baseline] }
  end

  menu :project_menu, :canvas_gantt, { controller: 'canvas_gantts', action: 'index' }, caption: 'Canvas Gantt', after: :gantt, param: :project_id

  settings default: {
    'inline_edit_subject' => '1',
    'inline_edit_assigned_to' => '1',
    'inline_edit_status' => '1',
    'inline_edit_done_ratio' => '1',
    'inline_edit_due_date' => '1',
    'inline_edit_custom_fields' => '1',
    'row_height' => '36'
  }
end

# Redmine::PluginLoader already executes init.rb inside a to_prepare callback,
# so apply the patch directly here on boot and on every code reload. Asset
# delivery is handled by CanvasGanttsController#asset, and initialization does
# not mutate public/plugin_assets at runtime.
require_dependency Rails.root.join(
  'plugins', 'redmine_canvas_gantt', 'app', 'controllers',
  'canvas_gantts_controller'
).to_s
require_dependency Rails.root.join(
  'plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt',
  'canvas_gantts_controller_patch'
).to_s

unless CanvasGanttsController < RedmineCanvasGantt::CanvasGanttsControllerPatch
  CanvasGanttsController.prepend(RedmineCanvasGantt::CanvasGanttsControllerPatch)
end
