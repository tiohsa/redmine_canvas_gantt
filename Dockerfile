FROM redmine:6.0

RUN printf '%s\n' \
    'require_relative "config/environment"' \
    '' \
    'map ENV["RAILS_RELATIVE_URL_ROOT"] || "/" do' \
    '  run Rails.application' \
    'end' \
    > /usr/src/redmine/config.ru

RUN ruby -e 'p="/usr/src/redmine/config/environment.rb"; t=File.read(p); add=%Q{\nActionController::Base.relative_url_root = ENV["RAILS_RELATIVE_URL_ROOT"]\nRedmine::Utils::relative_url_root = ENV["RAILS_RELATIVE_URL_ROOT"]\n}; File.write(p, t.include?(%q{Redmine::Utils::relative_url_root = ENV["RAILS_RELATIVE_URL_ROOT"]}) ? t : t + add)'
