# plugins/redmine_canvas_gantt/config/routes.rb
RedmineApp::Application.routes.draw do
  get '/plugin_assets/redmine_canvas_gantt/build/*asset_path', to: 'canvas_gantts#asset', format: false

  resources :projects do
    get 'canvas_gantt', to: 'canvas_gantts#index'
    get 'canvas_gantt/data', to: 'canvas_gantts#data'
    get 'canvas_gantt/queries', to: 'canvas_gantts#queries'
    post 'canvas_gantt/baseline', to: 'canvas_gantts#save_baseline'
    get 'canvas_gantt/tasks/:id/edit_meta', to: 'canvas_gantts#edit_meta'
    patch 'canvas_gantt/tasks/:id', to: 'canvas_gantts#update'
    post 'canvas_gantt/subtasks/bulk', to: 'canvas_gantts#bulk_create_subtasks'
    post 'canvas_gantt/relations', to: 'canvas_gantts#create_relation'
    patch 'canvas_gantt/relations/:id', to: 'canvas_gantts#update_relation'
    delete 'canvas_gantt/relations/:id', to: 'canvas_gantts#destroy_relation'
  end
end
