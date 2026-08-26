module RedmineCanvasGantt
  class DataPayloadBudget
    HARD_MAX_ISSUES = 10_000
    HARD_MAX_RELATIONS = 50_000
    HARD_MAX_COLLECTION_ITEMS = 10_000
    HARD_MAX_BYTES = 25 * 1024 * 1024

    class Exceeded < StandardError
      attr_reader :resource, :limit, :actual

      def initialize(resource:, limit:, actual:)
        @resource = resource
        @limit = limit
        @actual = actual
        super("#{resource} exceeds the Canvas Gantt data limit (#{actual} > #{limit})")
      end
    end

    attr_reader :issue_limit, :relation_limit, :collection_limit, :byte_limit

    def initialize(environment: ENV)
      @environment = environment
      @issue_limit = configured_limit('REDMINE_CANVAS_GANTT_MAX_DATA_ISSUES', HARD_MAX_ISSUES)
      @relation_limit = configured_limit('REDMINE_CANVAS_GANTT_MAX_DATA_RELATIONS', HARD_MAX_RELATIONS)
      @collection_limit = configured_limit(
        'REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS',
        HARD_MAX_COLLECTION_ITEMS
      )
      @byte_limit = configured_limit('REDMINE_CANVAS_GANTT_MAX_DATA_BYTES', HARD_MAX_BYTES)
    end

    def load_records(scope, resource:, limit:)
      records = scope.limit(limit + 1).to_a
      ensure_count!(records, resource: resource, limit: limit)
      records
    end

    def ensure_count!(records, resource:, limit: collection_limit)
      actual = records.size
      raise Exceeded.new(resource: resource, limit: limit, actual: actual) if actual > limit

      records
    end

    def encode_json(payload)
      json = ActiveSupport::JSON.encode(payload)
      bytes = json.bytesize
      raise Exceeded.new(resource: 'json_bytes', limit: byte_limit, actual: bytes) if bytes > byte_limit

      json
    end

    private

    def configured_limit(name, hard_maximum)
      value = Integer(@environment[name], exception: false)
      return hard_maximum unless value&.positive?

      [value, hard_maximum].min
    end
  end
end
