require_relative 'project_move_policy'

module RedmineCanvasGantt
  class IssueDraftEvaluator
    Result = Struct.new(
      :issue,
      :base_revision,
      :user_intent,
      :policy_intent,
      :materialized,
      :normalizations,
      :violations,
      keyword_init: true
    ) do
      def valid?
        violations.empty?
      end

      def draft_contract
        {
          base_revision: base_revision,
          materialized: materialized,
          normalizations: normalizations,
          violations: violations
        }
      end
    end

    INTENT_FIELDS = %i[
      subject assigned_to_id status_id done_ratio due_date start_date priority_id
      category_id estimated_hours project_id tracker_id fixed_version_id parent_issue_id
      custom_field_values lock_version
    ].freeze
    MATERIALIZED_FIELDS = %i[
      subject assigned_to_id status_id done_ratio due_date start_date priority_id
      category_id estimated_hours project_id tracker_id fixed_version_id parent_issue_id
    ].freeze

    def initialize(current_user:, project_scope_ids:, project_class: Project)
      @current_user = current_user
      @project_scope_ids = Array(project_scope_ids).map(&:to_i)
      @project_class = project_class
      @project_move_policy = ProjectMovePolicy.new(current_user: current_user)
    end

    def evaluate(issue:, intent:)
      issue.init_journal(@current_user)
      raw_intent = intent.to_h.transform_keys(&:to_sym)
      base_revision = issue.lock_version.to_i
      violations = unsupported_field_violations(raw_intent)
      user_intent = raw_intent.slice(*INTENT_FIELDS)
      before_values = materialized_values(issue)

      if user_intent.key?(:lock_version) && user_intent[:lock_version].to_i != base_revision
        violations << violation('lock_version', 'stale_revision', 'The issue was updated by another request.')
        return build_result(issue, base_revision, user_intent, {}, {}, [], violations)
      end

      safe_user_intent = user_intent.reject do |field, _value|
        field != :lock_version && violations.any? { |entry| entry[:field] == field.to_s }
      end

      target_project = target_project_for(issue, safe_user_intent)
      project_violation = validate_target_project(issue, safe_user_intent, target_project)
      violations << project_violation if project_violation
      safe_user_intent = safe_user_intent.except(:project_id) if project_violation

      policy = @project_move_policy.apply(
        issue: issue,
        user_intent: safe_user_intent,
        before_values: before_values,
        target_project: target_project
      )
      violations.concat(policy.violations)

      effective_attributes = policy.attributes.merge(safe_user_intent)
      issue.safe_attributes = effective_attributes.stringify_keys if effective_attributes.present?

      violations.concat(acceptance_violations(issue, safe_user_intent))
      violations.concat(policy_acceptance_violations(issue, policy))
      issue.valid?
      violations.concat(model_violations(issue))
      violations.uniq! { |entry| [entry[:field], entry[:code], entry[:message]] }

      after_values = materialized_values(issue)
      materialized = materialized_patch(
        before_values: before_values,
        after_values: after_values,
        user_intent: safe_user_intent,
        policy_fields: policy.policy_fields
      )
      normalizations = normalization_entries(
        before_values: before_values,
        after_values: after_values,
        user_intent: safe_user_intent,
        policy_fields: policy.policy_fields
      )

      build_result(
        issue,
        base_revision,
        user_intent,
        policy.attributes,
        materialized,
        normalizations,
        violations
      )
    end

    private

    def build_result(issue, base_revision, user_intent, policy_intent, materialized, normalizations, violations)
      Result.new(
        issue: issue,
        base_revision: base_revision,
        user_intent: user_intent,
        policy_intent: policy_intent,
        materialized: materialized,
        normalizations: normalizations,
        violations: violations
      )
    end

    def unsupported_field_violations(intent)
      (intent.keys - INTENT_FIELDS).map do |field|
        violation(field, 'unsupported_field', 'The requested field cannot be edited.')
      end
    end

    def validate_target_project(issue, intent, target_project = nil)
      return nil unless intent.key?(:project_id)

      target_id = integer_id(intent[:project_id])
      return violation('project_id', 'invalid_target', 'The target project is invalid.') unless target_id
      return nil if target_id == issue.project_id.to_i

      target = target_project || @project_class.visible.find_by(id: target_id)
      return violation('project_id', 'invalid_target', 'The target project is invalid.') unless target
      unless @project_scope_ids.include?(target_id) && @current_user.allowed_to?(:add_issues, target)
        return violation('project_id', 'permission_denied', 'Permission denied.')
      end

      nil
    end

    def target_project_for(issue, intent)
      return issue.project unless intent.key?(:project_id)

      target_id = integer_id(intent[:project_id])
      return issue.project if target_id.nil? || target_id == issue.project_id.to_i

      @project_class.visible.find_by(id: target_id)
    end

    def acceptance_violations(issue, intent)
      intent.each_with_object([]) do |(field, requested), result|
        next if field == :lock_version
        next if accepted_value?(issue, field, requested)

        result << violation(field, 'not_accepted', 'The requested value was not accepted.')
      end
    end

    def policy_acceptance_violations(issue, policy)
      policy.mandatory_fields.each_with_object([]) do |field, result|
        requested = policy.attributes[field]
        next if accepted_value?(issue, field, requested)

        result << violation(field, 'policy_not_accepted', 'The project move policy value was not accepted.')
      end
    end

    def accepted_value?(issue, field, requested)
      if field == :custom_field_values
        return requested.to_h.all? do |custom_field_id, value|
          normalize_scalar(issue.custom_field_value(custom_field_id).to_s) == normalize_scalar(value)
        end
      end

      actual = issue.public_send(issue_attribute(field))
      normalize_scalar(actual) == normalize_scalar(requested)
    end

    def model_violations(issue)
      issue.errors.map do |error|
        violation(error.attribute, 'invalid', error.full_message)
      end
    end

    def materialized_values(issue)
      MATERIALIZED_FIELDS.to_h do |field|
        [field, issue.public_send(issue_attribute(field))]
      end.merge(custom_field_values: custom_field_values_map(issue))
    end

    def materialized_patch(before_values:, after_values:, user_intent:, policy_fields:)
      fields = (user_intent.keys - [:lock_version]) | policy_fields
      fields |= MATERIALIZED_FIELDS.select { |field| before_values[field] != after_values[field] }
      result = fields.each_with_object({}) do |field, patch|
        next if field == :custom_field_values
        next unless after_values.key?(field)

        patch[field] = after_values[field]
      end
      custom_field_patch = sparse_custom_field_patch(
        before_values[:custom_field_values],
        after_values[:custom_field_values],
        user_intent[:custom_field_values]
      )
      result[:custom_field_values] = custom_field_patch if custom_field_patch.present?
      result
    end

    def normalization_entries(before_values:, after_values:, user_intent:, policy_fields:)
      scalar_entries = MATERIALIZED_FIELDS.filter_map do |field|
        next if before_values[field] == after_values[field]
        next if user_intent.key?(field)

        {
          field: field.to_s,
          from: before_values[field],
          to: after_values[field],
          source: policy_fields.include?(field) ? 'policy' : 'redmine'
        }
      end
      explicit_custom_field_ids = custom_field_intent(user_intent[:custom_field_values]).keys
      custom_field_entries = changed_custom_field_ids(
        before_values[:custom_field_values],
        after_values[:custom_field_values]
      ).filter_map do |custom_field_id|
        next if explicit_custom_field_ids.include?(custom_field_id)

        {
          field: "custom_field_values.#{custom_field_id}",
          from: before_values[:custom_field_values][custom_field_id],
          to: after_values[:custom_field_values][custom_field_id],
          source: 'redmine'
        }
      end
      scalar_entries + custom_field_entries
    end

    def custom_field_values_map(issue)
      return {} unless issue.respond_to?(:custom_field_values)

      Array(issue.custom_field_values).each_with_object({}) do |custom_field_value, values|
        custom_field_id = if custom_field_value.respond_to?(:custom_field_id)
                            custom_field_value.custom_field_id
                          elsif custom_field_value.respond_to?(:custom_field)
                            custom_field_value.custom_field&.id
                          end
        next unless custom_field_id

        values[custom_field_id.to_s] = custom_field_value.value
      end
    end

    def custom_field_intent(value)
      return {} unless value.respond_to?(:to_h)

      value.to_h.transform_keys(&:to_s)
    end

    def changed_custom_field_ids(before_values, after_values)
      before_values ||= {}
      after_values ||= {}
      (before_values.keys | after_values.keys).select do |custom_field_id|
        normalize_scalar(before_values[custom_field_id]) != normalize_scalar(after_values[custom_field_id])
      end
    end

    def sparse_custom_field_patch(before_values, after_values, requested_values)
      before_values ||= {}
      after_values ||= {}
      requested_ids = custom_field_intent(requested_values).keys
      (requested_ids | changed_custom_field_ids(before_values, after_values)).each_with_object({}) do |custom_field_id, patch|
        patch[custom_field_id] = after_values[custom_field_id]
      end
    end

    def issue_attribute(field)
      field
    end

    def normalize_scalar(value)
      return nil if value.nil? || (value.respond_to?(:blank?) && value.blank?)
      return value.map { |item| normalize_scalar(item) } if value.is_a?(Array)
      return value.to_s if value.is_a?(Date) || value.is_a?(Time)
      return value.to_d if defined?(BigDecimal) && (value.is_a?(BigDecimal) || value.is_a?(Float))
      return value.to_i if value.is_a?(Integer) || value.to_s.match?(/\A\d+\z/)

      value.to_s
    end

    def integer_id(value)
      parsed = Integer(value, exception: false)
      parsed if parsed&.positive?
    end

    def violation(field, code, message)
      { field: field.to_s, code: code, message: message }
    end
  end
end
