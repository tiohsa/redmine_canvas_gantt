require 'redmine'

Redmine::Plugin.register :redmine_canvas_gantt do
  name 'Redmine Canvas Gantt plugin'
  author 'Antigravity'
  description 'A high-performance Canvas-based Gantt chart plugin'
  version '0.1.0'
  url 'https://github.com/example/redmine_canvas_gantt'
  author_url 'https://github.com/example'

  project_module :canvas_gantt do
    permission :view_canvas_gantt, { canvas_gantts: [:index, :data] }
    permission :edit_canvas_gantt, { canvas_gantts: [:update] }
  end

  menu :project_menu, :canvas_gantt, { controller: 'canvas_gantts', action: 'index' }, caption: 'Canvas Gantt', after: :gantt, param: :project_id
end
