module RedmineCanvasGantt
  class CustomFieldSerializer
    def initialize(current_user:)
      @current_user = current_user
    end

    def serialize(custom_field)
      {
        id: custom_field.id,
        name: custom_field.name,
        field_format: custom_field.field_format,
        is_required: custom_field.is_required,
        regexp: custom_field.regexp,
        min_length: custom_field.min_length,
        max_length: custom_field.max_length,
        possible_values: custom_field.field_format.to_s == 'list' ? custom_field.possible_values : nil,
        text_formatting: custom_field.field_format.to_s == 'text' ? safe_text_formatting(custom_field) : nil
      }
    end

    def visible_for_project?(custom_field, project)
      return true unless custom_field.respond_to?(:visible_by?)

      custom_field.visible_by?(project, @current_user)
    rescue ArgumentError
      begin
        custom_field.visible_by?(project)
      rescue ArgumentError
        custom_field.visible_by?(@current_user)
      rescue ArgumentError
        custom_field.visible_by?
      end
    rescue StandardError
      true
    end

    private

    def safe_text_formatting(custom_field)
      custom_field.text_formatting
    rescue StandardError
      nil
    end
  end
end
