ENV['RAILS_ENV'] ||= 'test'

# Load Redmine environment
require File.expand_path('../../../config/environment', __dir__)

require 'rspec/rails'

# The Docker image supplies only a production database configuration, so the
# CI suite intentionally boots Rails in production. Keep that test process
# from starting ActiveJob's async executor or attempting SMTP delivery.
unless Rails.env.test?
  ActiveJob::Base.queue_adapter = :inline
  ActionMailer::Base.delivery_method = :test
  ActionMailer::Base.perform_deliveries = false
end

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
