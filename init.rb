require 'redmine'

Redmine::Plugin.register :redmine_canvas_gantt do
  name 'Redmine Canvas Gantt plugin'
  author 'tiohsa'
  description 'A high-performance Canvas-based Gantt chart plugin'
  version '0.11.0'
  url 'https://github.com/tiohsa/redmine_canvas_gantt'
  author_url 'https://github.com/tiohsa/redmine_canvas_gantt'

  project_module :canvas_gantt do
    permission :view_canvas_gantt, { canvas_gantts: [:index, :data, :queries] }
    permission :edit_canvas_gantt, { canvas_gantts: [:update, :bulk_create_subtasks, :destroy_relation, :save_baseline] }
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

# Keep compatibility fixes isolated from the main controller and apply them on
# every Rails code reload. Asset delivery is handled by CanvasGanttsController#asset,
# so plugin initialization no longer mutates public/plugin_assets at runtime.
Rails.application.config.to_prepare do
  require_dependency 'canvas_gantts_controller'
  require_dependency Rails.root.join(
    'plugins', 'redmine_canvas_gantt', 'lib', 'redmine_canvas_gantt',
    'canvas_gantts_controller_patch'
  ).to_s

  unless CanvasGanttsController < RedmineCanvasGantt::CanvasGanttsControllerPatch
    CanvasGanttsController.prepend(RedmineCanvasGantt::CanvasGanttsControllerPatch)
  end
end
