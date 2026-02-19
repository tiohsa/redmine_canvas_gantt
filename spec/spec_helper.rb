ENV['RAILS_ENV'] ||= 'test'

# Load Redmine environment
require File.expand_path('../../../../config/environment', __FILE__)

require 'rspec/rails'

RSpec.configure do |config|
  config.fixture_path = "#{::Rails.root}/test/fixtures"
  config.use_transactional_fixtures = true
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!
end
