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
    permission :edit_canvas_gantt