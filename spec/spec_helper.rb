ENV['RAILS_ENV'] ||= 'test'

# Load Redmine environment
require File.expand_path('../../../config/environment', __dir__)

require 'rspec/rails'

RSpec.configure do |config|
  fixture_path = "#{::Rails.root}/test/fixtures"
  if config.respond_to?(:fixture_paths=)
    config.fixture_paths = [fixture_path]
  else
    config.fixture_path = fixture_path
  end
  config.use_transactional_fixtures = true
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!
end
