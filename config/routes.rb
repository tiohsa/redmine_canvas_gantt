# plugins/redmine_canvas_gantt/config/routes.rb
RedmineApp::Application.routes.draw do
  get '/plugin_assets/redmine_canvas_gantt/build/*asset_path', to: 'canvas_gantts#asset', format: false

  resources :projects do
    get 'canvas_gantt', to: 'canvas_gantts#index'
    get 'canvas_gantt/data', to: 'canvas_gantts#data'
    get 'canvas_gantt/tasks/:id/edit_meta', to: 'canvas_gantts#edit_meta'
    patch 'canvas_gantt/tasks/:id', to: 'canvas_gantts#update'
    delete 'canvas_gantt/relations/:id', to: 'canvas_gantts#destroy_relation'
  end
end
