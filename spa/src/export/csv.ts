import type { CustomFieldMeta } from '../types/editMeta';
import type { Relation, Task } from '../types';
import { buildExportFilename, downloadBlob } from './download';
import { formatDateOnly } from '../utils/dateOnly';

const CSV_HEADERS = [
    ['id', 'ID'],
    ['subject', 'Subject'],
    ['parentId', 'Parent ID'],
    ['parentSubject', 'Parent Subject'],
    ['indentLevel', 'Indent Level'],
    ['hasChildren', 'Has Children'],
    ['projectName', 'Project'],
    ['trackerName', 'Tracker'],
    ['statusName', 'Status'],
    ['assignedToName', 'Assignee'],
    ['startDate', 'Start Date'],
    ['dueDate', 'Due Date'],
    ['ratioDone', 'Progress'],
    ['priorityName', 'Priority'],
    ['authorName', 'Author'],
    ['categoryName', 'Category'],
    ['estimatedHours', 'Estimated Hours'],
    ['spentHours', 'Spent Hours'],
    ['fixedVersionName', 'Target Version'],
    ['predecessors', 'Predecessors'],
    ['successors', 'Successors']
] as const;

const formatDate = (value?: number) => {
    if (value === undefined || !Number.isFinite(value)) return '';
    return formatDateOnly(value) ?? '';
};

const escapeCsv = (value: unknown) => {
    const normalized = String(value ?? '');
    if (normalized.includes('"') || normalized.includes(',') || normalized.includes('\n')) {
        return `"${normalized.replaceAll('"', '""')}"`;
    }
    return normalized;
};

export const buildTasksCsv = (
    tasks: Task[],
    customFields: CustomFieldMeta[],
    relationSummaryByTask: Map<string, { predecessors: string[]; successors: string[] }> = new Map()
) => {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const emptyRelationSummary = { predecessors: [] as string[], successors: [] as string[] };

    const headers = [
        ...CSV_HEADERS.map(([, label]) => label),
        ...customFields.map((field) => field.name)
    ];

    const rows = tasks.map((task) => [
        task.id,
        task.subject,
        task.parentId ?? '',
        task.parentId ? (taskById.get(task.parentId)?.subject ?? '') : '',
        task.indentLevel ?? 0,
        task.hasChildren ? 'Yes' : 'No',
        task.projectName ?? '',
        task.trackerName ?? '',
        task.statusName ?? '',
        task.assignedToName ?? '',
        formatDate(task.startDate),
        formatDate(task.dueDate),
        task.ratioDone,
        task.priorityName ?? '',
        task.authorName ?? '',
        task.categoryName ?? '',
        task.estimatedHours ?? '',
        task.spentHours ?? '',
        task.fixedVersionName ?? '',
        (relationSummaryByTask.get(task.id) ?? emptyRelationSummary).predecessors.join(' | '),
        (relationSummaryByTask.get(task.id) ?? emptyRelationSummary).successors.join(' | '),
        ...customFields.map((field) => task.customFieldValues?.[String(field.id)] ?? '')
    ]);

    return [headers, ...rows]
        .map((row) => row.map(escapeCsv).join(','))
        .join('\n');
};

const describeRelation = (relation: Relation, relatedTask: Task | undefined) => {
    const relatedLabel = relatedTask ? `${relatedTask.id}:${relatedTask.subject}` : relation.type;
    return relation.delay !== undefined ? `${relatedLabel} (${relation.type}, delay=${relation.delay})` : `${relatedLabel} (${relation.type})`;
};

export const exportTasksAsCsv = (tasks: Task[], relations: Relation[], customFields: CustomFieldMeta[]) => {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const relationSummaryByTask = new Map<string, { predecessors: string[]; successors: string[] }>();

    const ensureRelationSummary = (taskId: string) => {
        const current = relationSummaryByTask.get(taskId);
        if (current) return current;
        const created = { predecessors: [] as string[], successors: [] as string[] };
        relationSummaryByTask.set(taskId, created);
        return created;
    };

    relations.forEach((relation) => {
        ensureRelationSummary(relation.to).predecessors.push(describeRelation(relation, taskById.get(relation.from)));
        ensureRelationSummary(relation.from).successors.push(describeRelation(relation, taskById.get(relation.to)));
    });

    const csv = buildTasksCsv(tasks, customFields, relationSummaryByTask);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, buildExportFilename('csv'));
};
