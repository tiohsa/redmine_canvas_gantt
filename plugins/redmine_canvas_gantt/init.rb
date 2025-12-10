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

# Ensure built frontend assets are available under public/plugin_assets/.
# In production Redmine serves /plugin_assets from public/, so we symlink the
# Vite build output there if it is missing.
begin
  require 'fileutils'
  plugin_build_dir = Rails.root.join('plugins', 'redmine_canvas_gantt', 'assets', 'build')
  public_build_dir = Rails.root.join('public', 'plugin_assets', 'redmine_canvas_gantt', 'build')

  if File.directory?(plugin_build_dir)
    FileUtils.mkdir_p(public_build_dir.parent)
    FileUtils.ln_sf(plugin_build_dir, public_build_dir)
  end
rescue => e
  Rails.logger.warn("redmine_canvas_gantt: failed to link plugin assets: #{e.message}") if defined?(Rails)
end
