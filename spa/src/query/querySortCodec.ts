import type { BusinessQueryState } from '../types';

const SORT_FIELD_TO_REDMINE: Record<string, string> = {
    id: 'id',
    subject: 'subject',
    projectName: 'project',
    trackerName: 'tracker',
    statusId: 'status',
    priorityId: 'priority',
    assignedToName: 'assigned_to',
    authorName: 'author',
    startDate: 'start_date',
    dueDate: 'due_date',
    estimatedHours: 'estimated_hours',
    ratioDone: 'done_ratio',
    fixedVersionName: 'fixed_version',
    categoryName: 'category',
    createdOn: 'created_on',
    updatedOn: 'updated_on',
    spentHours: 'spent_hours'
};

const REDMINE_SORT_TO_FIELD = Object.fromEntries(
    Object.entries(SORT_FIELD_TO_REDMINE).map(([field, redmine]) => [redmine, field])
) as Record<string, string>;

export const DEFAULT_SORT_KEY = 'startDate';
export const DEFAULT_SORT_DIRECTION = 'asc';

export const parseSortConfig = (rawSort: string | null): BusinessQueryState['sortConfig'] | undefined => {
    const [rawField, rawDirection] = (rawSort || '').split(':', 2);
    if (!rawField) return undefined;

    return {
        key: REDMINE_SORT_TO_FIELD[rawField] ?? rawField,
        direction: rawDirection === 'desc' ? 'desc' : 'asc'
    };
};

export const toRedmineSortField = (key: string): string | null => SORT_FIELD_TO_REDMINE[key] ?? null;

export const isDefaultSort = (sortConfig: BusinessQueryState['sortConfig']): boolean =>
    sortConfig?.key === DEFAULT_SORT_KEY && sortConfig.direction === DEFAULT_SORT_DIRECTION;
