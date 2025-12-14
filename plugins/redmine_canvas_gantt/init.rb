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
    permission :edit_canvas_gantt, { canvas_gantts: [:update, :destroy_relation] }
  end

  menu :project_menu, :canvas_gantt, { controller: 'canvas_gantts', action: 'index' }, caption: 'Canvas Gantt', after: :gantt, param: :project_id

  settings default: {
    'inline_edit_subject' => '1',
    'inline_edit_assigned_to' => '1',
    'inline_edit_status' => '1',
    'inline_edit_done_ratio' => '1',
    'inline_edit_due_date' => '1',
    'inline_edit_custom_fields' => '0'
  }, partial: 'settings/redmine_canvas_gantt'
end

# Ensure built frontend assets are available under public/plugin_assets/.
# In production Redmine serves /plugin_assets from public/, so we symlink the
# Vite build output there if it is missing.
# Falls back to copying files if symlink fails (e.g., in Docker with volume mounts).
begin
  require 'fileutils'
  plugin_build_dir = Rails.root.join('plugins', 'redmine_canvas_gantt', 'assets', 'build')
  public_build_dir = Rails.root.join('public', 'plugin_assets', 'redmine_canvas_gantt', 'build')

  if File.directory?(plugin_build_dir)
    # Skip if already linked or copied
    unless File.exist?(public_build_dir) || File.symlink?(public_build_dir)
      FileUtils.mkdir_p(public_build_dir.parent)
      begin
        FileUtils.ln_sf(plugin_build_dir, public_build_dir)
      rescue Errno::EPERM, Errno::EACCES
        # Symlink failed (e.g., Docker volume), fall back to copying
        FileUtils.cp_r(plugin_build_dir, public_build_dir)
      end
    end
  end
rescue => e
  Rails.logger.warn("redmine_canvas_gantt: failed to link plugin assets: #{e.message}") if defined?(Rails)
end
