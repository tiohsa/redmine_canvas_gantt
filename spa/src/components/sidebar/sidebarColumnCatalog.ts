import type { SidebarColumnDefinition } from './sidebarColumnSettings';

export type ColumnMeta = SidebarColumnDefinition & {
    defaultVisible: boolean;
    movable: boolean;
    redmineColumn?: string;
};

export const COLUMN_CATALOG: ColumnMeta[] = [
    { key: 'id', label: 'ID', defaultVisible: true, movable: true, redmineColumn: 'id' },
    { key: 'timer', label: 'Work Timer', defaultVisible: false, movable: true },
    { key: 'subject', label: 'Task Name', defaultVisible: true, movable: true, redmineColumn: 'subject' },
    { key: 'notification', label: 'Notifications', defaultVisible: true, movable: true },
    { key: 'project', label: 'Project', defaultVisible: false, movable: true, redmineColumn: 'project' },
    { key: 'tracker', label: 'Tracker', defaultVisible: false, movable: true, redmineColumn: 'tracker' },
    { key: 'status', label: 'Status', defaultVisible: true, movable: true, redmineColumn: 'status' },
    { key: 'priority', label: 'Priority', defaultVisible: false, movable: true, redmineColumn: 'priority' },
    { key: 'assignee', label: 'Assignee', defaultVisible: true, movable: true, redmineColumn: 'assigned_to' },
    { key: 'author', label: 'Author', defaultVisible: false, movable: true, redmineColumn: 'author' },
    { key: 'startDate', label: 'Start Date', defaultVisible: true, movable: true, redmineColumn: 'start_date' },
    { key: 'dueDate', label: 'Due Date', defaultVisible: true, movable: true, redmineColumn: 'due_date' },
    { key: 'estimatedHours', label: 'Estimated Time', defaultVisible: false, movable: true, redmineColumn: 'estimated_hours' },
    { key: 'ratioDone', label: 'Progress', defaultVisible: true, movable: true, redmineColumn: 'done_ratio' },
    { key: 'spentHours', label: 'Spent Time', defaultVisible: false, movable: true, redmineColumn: 'spent_hours' },
    { key: 'version', label: 'Target Version', defaultVisible: false, movable: true, redmineColumn: 'fixed_version' },
    { key: 'category', label: 'Category', defaultVisible: false, movable: true, redmineColumn: 'category' },
    { key: 'createdOn', label: 'Created', defaultVisible: false, movable: true, redmineColumn: 'created_on' },
    { key: 'updatedOn', label: 'Updated', defaultVisible: false, movable: true, redmineColumn: 'updated_on' }
];

export const CANVAS_COLUMN_TO_REDMINE = Object.fromEntries(
    COLUMN_CATALOG.flatMap((column) => column.redmineColumn ? [[column.key, column.redmineColumn]] : [])
) as Record<string, string>;

export const REDMINE_COLUMN_TO_CANVAS = Object.fromEntries(
    Object.entries(CANVAS_COLUMN_TO_REDMINE).map(([key, redmineColumn]) => [redmineColumn, key])
) as Record<string, string>;

export const toRedmineColumnName = (key: string): string | null => {
    const customFieldMatch = key.match(/^cf:(\d+)$/);
    if (customFieldMatch) return `cf_${customFieldMatch[1]}`;
    return CANVAS_COLUMN_TO_REDMINE[key] ?? null;
};

export const toCanvasColumnKey = (redmineColumn: string): string | null => {
    const customFieldMatch = redmineColumn.match(/^cf_(\d+)$/);
    if (customFieldMatch) return `cf:${customFieldMatch[1]}`;
    return REDMINE_COLUMN_TO_CANVAS[redmineColumn] ?? (CANVAS_COLUMN_TO_REDMINE[redmineColumn] ? redmineColumn : null);
};

export const getColumnDefinitions = (): SidebarColumnDefinition[] =>
    COLUMN_CATALOG.map(({ key, label }) => ({ key, label }));

export const getDefaultVisibleColumnKeys = (): string[] =>
    COLUMN_CATALOG.filter((column) => column.defaultVisible).map((column) => column.key);
