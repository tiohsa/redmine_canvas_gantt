import type { Relation, Task } from '../types';

export type DependencySummary = {
    incoming: number;
    outgoing: number;
};

export type SelectedRelations = {
    relations: Relation[];
    overflowCount: number;
};

export const MAX_SELECTED_RELATIONS = 5;

export const buildDependencySummary = (tasks: Task[], relations: Relation[]): Map<string, DependencySummary> => {
    const summary = new Map<string, DependencySummary>();
    const taskIds = new Set(tasks.map(task => task.id));

    tasks.forEach(task => {
        summary.set(task.id, { incoming: 0, outgoing: 0 });
    });

    relations.forEach(rel => {
        if (!taskIds.has(rel.from) || !taskIds.has(rel.to)) return;
        const fromEntry = summary.get(rel.from);
        const toEntry = summary.get(rel.to);
        if (fromEntry) fromEntry.outgoing += 1;
        if (toEntry) toEntry.incoming += 1;
    });

    return summary;
};

export const filterRelationsForSelected = (
    relations: Relation[],
    selectedTaskId: string,
    limit: number = MAX_SELECTED_RELATIONS
): SelectedRelations => {
    const related = relations.filter(rel => rel.from === selectedTaskId || rel.to === selectedTaskId);
    if (related.length <= limit) {
        return { relations: related, overflowCount: 0 };
    }
    return {
        relations: related.slice(0, limit),
        overflowCount: related.length - limit
    };
};

export const getOverflowBadgeLabel = (overflowCount: number): string => {
    if (overflowCount <= 0) return '';
    return `+${overflowCount}`;
};
