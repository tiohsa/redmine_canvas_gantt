module RedmineCanvasGantt
  class ConstraintGraph
    SchedulingEdge = Struct.new(:relation_id, :predecessor_id, :successor_id, :gap_days, :relation_type, keyword_init: true)

    def initialize(relations:)
      @relations = relations
    end

    def edges
      @edges ||= @relations.filter_map { |relation| self.class.to_scheduling_edge(relation) }
    end

    def cyclic_task_ids
      adjacency = Hash.new { |hash, key| hash[key] = [] }
      task_ids = []

      edges.each do |edge|
        adjacency[edge.predecessor_id] << edge.successor_id
        task_ids << edge.predecessor_id
        task_ids << edge.successor_id
      end

      state = {}
      stack = []
      cyclic = {}

      visit = lambda do |task_id|
        case state[task_id]
        when :visiting
          cycle_start = stack.rindex(task_id) || 0
          stack[cycle_start..].each { |value| cyclic[value] = true }
          cyclic[task_id] = true
          return
        when :done
          return
        end

        state[task_id] = :visiting
        stack << task_id
        adjacency[task_id].each { |successor_id| visit.call(successor_id) }
        stack.pop
        state[task_id] = :done
      end

      task_ids.uniq.each { |task_id| visit.call(task_id) }
      cyclic.keys
    end

    def cyclic?
      cyclic_task_ids.any?
    end

    def self.to_scheduling_edge(relation)
      relation_type = extract_value(relation, :type, :relation_type).to_s
      relation_id = extract_value(relation, :id)
      delay = extract_value(relation, :delay).to_i

      case relation_type
      when 'precedes'
        SchedulingEdge.new(
          relation_id: relation_id,
          predecessor_id: extract_value(relation, :from, :issue_from_id).to_s,
          successor_id: extract_value(relation, :to, :issue_to_id).to_s,
          gap_days: 1 + delay,
          relation_type: relation_type
        )
      when 'follows'
        SchedulingEdge.new(
          relation_id: relation_id,
          predecessor_id: extract_value(relation, :to, :issue_to_id).to_s,
          successor_id: extract_value(relation, :from, :issue_from_id).to_s,
          gap_days: 1 + delay,
          relation_type: relation_type
        )
      end
    end

    def self.extract_value(relation, *keys)
      keys.each do |key|
        return relation.public_send(key) if relation.respond_to?(key)
        return relation[key] if relation.respond_to?(:[]) && relation[key]
        string_key = key.to_s
        return relation[string_key] if relation.respond_to?(:[]) && relation[string_key]
      end

      nil
    end
  end
end
