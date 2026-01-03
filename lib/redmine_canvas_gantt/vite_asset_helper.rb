module RedmineCanvasGantt
  module ViteAssetHelper
    def vite_javascript_path(entry)
      if use_vite_dev_server?
        "http://localhost:5173/#{entry}"
      else
        manifest = vite_manifest
        return "" unless manifest && manifest[entry]
        "/plugin_assets/redmine_canvas_gantt/build/#{manifest[entry]['file']}"
      end
    end

    def vite_stylesheet_path(entry)
      if use_vite_dev_server?
        nil # Vite injects CSS via JS in dev mode
      else
        manifest = vite_manifest
        return nil unless manifest && manifest[entry] && manifest[entry]['css']
        css_files = manifest[entry]['css']
        css_files.map { |f| "/plugin_assets/redmine_canvas_gantt/build/#{f}" }
      end
    end

    def vite_client_tag
      if use_vite_dev_server?
        javascript_include_tag("http://localhost:5173/@vite/client", type: "module")
      else
        ""
      end
    end

    def vite_react_refresh_tag
      if use_vite_dev_server?
        content_tag(:script, type: "module") do
          <<-JS.html_safe
            import RefreshRuntime from 'http://localhost:5173/@react-refresh'
            RefreshRuntime.injectIntoGlobalHook(window)
            window.$RefreshReg$ = () => {}
            window.$RefreshSig$ = () => (type) => type
            window.__vite_plugin_react_preamble_installed__ = true
          JS
        end
      else
        ""
      end
    end

    private

    def use_vite_dev_server?
      settings = Setting.plugin_redmine_canvas_gantt || {}
      settings['use_vite_dev_server'].to_s == '1'
    end

    def vite_manifest
      manifest_path = Rails.root.join('plugins', 'redmine_canvas_gantt', 'assets', 'build', '.vite', 'manifest.json')
      return nil unless File.exist?(manifest_path)
      JSON.parse(File.read(manifest_path))
    end
  end
end
