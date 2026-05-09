require_relative '../../spec_helper'
require_relative '../../../lib/redmine_canvas_gantt/vite_asset_helper'

RSpec.describe RedmineCanvasGantt::ViteAssetHelper do
  let(:helper_class) do
    Class.new do
      include RedmineCanvasGantt::ViteAssetHelper

      def javascript_include_tag(src, **options)
        attrs = options.map { |key, value| %( #{key}="#{value}") }.join
        %(<script src="#{src}"#{attrs}></script>)
      end

      def content_tag(name, **options)
        attrs = options.map { |key, value| %( #{key}="#{value}") }.join
        content = block_given? ? yield : ''
        %(<#{name}#{attrs}>#{content}</#{name}>)
      end

      def vite_manifest
        {
          'src/main.tsx' => {
            'file' => 'assets/main.js',
            'css' => ['assets/main.css']
          }
        }
      end
    end
  end

  subject(:helper) { helper_class.new }

  around do |example|
    original = ENV['CANVAS_GANTT_USE_VITE_DEV_SERVER']
    example.run
  ensure
    if original.nil?
      ENV.delete('CANVAS_GANTT_USE_VITE_DEV_SERVER')
    else
      ENV['CANVAS_GANTT_USE_VITE_DEV_SERVER'] = original
    end
  end

  describe '#use_vite_dev_server?' do
    it 'uses the dev server only in development when the env flag is enabled' do
      allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new('development'))
      ENV['CANVAS_GANTT_USE_VITE_DEV_SERVER'] = '1'

      expect(helper.send(:use_vite_dev_server?)).to be(true)
      expect(helper.vite_javascript_path('src/main.tsx')).to eq('http://localhost:5173/src/main.tsx')
      expect(helper.vite_stylesheet_path('src/main.tsx')).to be_nil
      expect(helper.vite_client_tag).to include('http://localhost:5173/@vite/client')
      expect(helper.vite_react_refresh_tag).to include('http://localhost:5173/@react-refresh')
    end

    it 'falls back to the manifest when the env flag is missing in development' do
      allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new('development'))
      ENV.delete('CANVAS_GANTT_USE_VITE_DEV_SERVER')

      expect(helper.send(:use_vite_dev_server?)).to be(false)
      expect(helper.vite_javascript_path('src/main.tsx')).to eq('/plugin_assets/redmine_canvas_gantt/build/assets/main.js')
      expect(helper.vite_stylesheet_path('src/main.tsx')).to eq(['/plugin_assets/redmine_canvas_gantt/build/assets/main.css'])
      expect(helper.vite_client_tag).to eq('')
      expect(helper.vite_react_refresh_tag).to eq('')
    end

    it 'ignores the env flag outside development' do
      allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new('production'))
      ENV['CANVAS_GANTT_USE_VITE_DEV_SERVER'] = '1'

      expect(helper.send(:use_vite_dev_server?)).to be(false)
      expect(helper.vite_javascript_path('src/main.tsx')).to eq('/plugin_assets/redmine_canvas_gantt/build/assets/main.js')
      expect(helper.vite_stylesheet_path('src/main.tsx')).to eq(['/plugin_assets/redmine_canvas_gantt/build/assets/main.css'])
    end
  end
end
