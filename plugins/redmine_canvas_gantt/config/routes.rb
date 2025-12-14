# plugins/redmine_canvas_gantt/config/routes.rb
RedmineApp::Application.routes.draw do
  resources :projects do
    get 'canvas_gantt', to: 'canvas_gantts#index'
    get 'canvas_gantt/data', to: 'canvas_gantts#data'
    patch 'canvas_gantt/tasks/:id', to: 'canvas_gantts#update'
    delete 'canvas_gantt/relations/:id', to: 'canvas_gantts#destroy_relation'
  end
end
