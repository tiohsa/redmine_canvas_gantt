module RedmineCanvasGantt
  class CustomFieldExtractor
    def initialize(serializer:, supported_formats:)
      @serializer = serializer
      @supported_formats = supported_formats
    end

    def build_project_custom_fields(project_ids, issues = [])
      seen = {}

      project_fields = Project.where(id: project_ids).flat_map do |project|
        load_project_issue_custom_fields(project).select do |custom_field|
          custom_field.is_a?(IssueCustomField) &&
            @serializer.visible_for_project?(custom_field, project) &&
            !custom_field.multiple? &&
            @supported_formats.include?(custom_field.field_format.to_s)
        end
      end

      issue_fields = Array(issues).flat_map do |issue|
        issue.custom_field_values.map(&:custom_field)
      end.compact.select do |custom_field|
        custom_field.is_a?(IssueCustomField) &&
          !custom_field.multiple? &&
          @supported_formats.include?(custom_field.field_format.to_s)
      end

      (project_fields + issue_fields)
        .uniq { |custom_field| custom_field.id }
        .sort_by { |custom_field| [custom_field.position || 0, custom_field.name.to_s.downcase] }
        .each_with_object([]) do |custom_field, result|
          next if seen[custom_field.id]

          seen[custom_field.id] = true
          result << @serializer.serialize(custom_field)
        end
    end

    def extract_custom_fields(issue, editable)
      return [[], {}] unless editable

      issue_custom_field_values, applicable_custom_field_ids = issue_custom_field_data(issue)
      custom_fields = []
      custom_field_values = {}

      issue_custom_field_values.each do |custom_field_value|
        custom_field = custom_field_value.custom_field
        next unless custom_field
        next unless applicable_custom_field_ids.include?(custom_field.id)
        next if custom_field.multiple?
        next unless @supported_formats.include?(custom_field.field_format.to_s)

        custom_fields << @serializer.serialize(custom_field)
        custom_field_values[custom_field.id.to_s] = custom_field_value.value
      end

      [custom_fields, custom_field_values]
    end

    def build_task_custom_field_values(issue)
      issue_custom_field_values, applicable_custom_field_ids = issue_custom_field_data(issue)
      issue_custom_field_values.each_with_object({}) do |custom_field_value, values|
        custom_field = custom_field_value.custom_field
        next unless custom_field
        next unless applicable_custom_field_ids.include?(custom_field.id)
        next if custom_field.multiple?
        next unless @supported_formats.include?(custom_field.field_format.to_s)

        values[custom_field.id.to_s] = custom_field_value.value
      end
    end

    private

    def load_project_issue_custom_fields(project)
      Array(project.all_issue_custom_fields)
    rescue NoMethodError
      begin
        Array(project.issue_custom_fields)
      rescue NoMethodError
        []
      end
    end

    def issue_applicable_custom_field_ids(issue)
      available_fields = if issue.respond_to?(:available_custom_fields)
                           Array(issue.available_custom_fields)
                         else
                           []
                         end

      ids = available_fields
        .select { |field| field.respond_to?(:id) }
        .map(&:id)
        .compact

      return ids.uniq unless ids.empty?

      Array(issue.custom_field_values)
        .filter_map { |value| value.custom_field&.id }
        .uniq
    rescue StandardError
      []
    end

    def issue_custom_field_data(issue)
      # Redmine's base implementation builds values from available fields. An
      # override must retain the independent applicability check and its order.
      if uses_base_custom_field_values?(issue)
        custom_field_values = issue.custom_field_values
        [custom_field_values, applicable_custom_field_ids_from_values(custom_field_values)]
      else
        applicable_custom_field_ids = issue_applicable_custom_field_ids(issue)
        [issue.custom_field_values, applicable_custom_field_ids]
      end
    end

    def applicable_custom_field_ids_from_values(custom_field_values)
      Array(custom_field_values)
        .filter_map { |value| value.custom_field&.id }
        .uniq
    rescue StandardError
      []
    end

    def uses_base_custom_field_values?(issue)
      issue.respond_to?(:custom_field_values) &&
        issue.method(:custom_field_values).owner == Redmine::Acts::Customizable::InstanceMethods
    rescue StandardError
      false
    end
  end
end
