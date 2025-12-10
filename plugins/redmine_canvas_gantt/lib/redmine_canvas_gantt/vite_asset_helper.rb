module RedmineCanvasGantt
  module ViteAssetHelper
    def vite_asset_path(path)
      if Rails.env.development?
        "http://localhost:5173/#{path}"
      else
        manifest = vite_manifest
        return "" unless manifest
        # Normalize path to match manifest keys (usually starting with src/)
        # If input is 'main.tsx', we look for 'src/main.tsx' if that's the entry
        # But let's assume the user passes 'src/main.tsx'
        entry = manifest[path]
        return "" unless entry
        
        "/plugin_assets/redmine_canvas_gantt/build/#{entry['file']}"
      end
    end

    def vite_client_tag
      if Rails.env.development?
        javascript_include_tag("http://localhost:5173/@vite/client", type: "module")
      else
        ""
      end
    end

    def vite_react_refresh_tag
      if Rails.env.development?
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

    def vite_manifest
      manifest_path = Rails.root.join('plugins', 'redmine_canvas_gantt', 'assets', 'build', '.vite', 'manifest.json')
      return nil unless File.exist?(manifest_path)
      JSON.parse(File.read(manifest_path))
    end
  end
end
