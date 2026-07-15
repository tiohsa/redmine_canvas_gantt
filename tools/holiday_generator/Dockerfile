FROM ruby:3.4-slim

WORKDIR /app

COPY Gemfile Gemfile.lock ./
RUN bundle install

COPY . ./

ENTRYPOINT ["bundle", "exec", "ruby", "generate.rb"]
