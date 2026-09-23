import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTaskStore, type TaskConflictRecord } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import type { Task, PersistedTaskState } from '../types';
import type { LocalPatch, ReadContext, ServerSnapshot } from '../stores/taskStore/stateContract';
import { selectConflictRemote } from '../stores/taskStore/conflictRemote';
import { formatDate } from '../utils/dateUtils';
import { parseDateOnly, toLocalDisplayDate } from '../utils/dateOnly';
import { i18n } from '../utils/i18n';
import './ConflictResolutionPanel.css';

const hasField = (value: object, field: string) => Object.prototype.hasOwnProperty.call(value, field);
const fieldLabels: Record<string, string> = {
    subject: 'field_subject', startDate: 'field_start_date', dueDate: 'field_due_date',
    assignedToId: 'field_assigned_to', statusId: 'label_status_short', estimatedHours: 'field_estimated_hours',
    ratioDone: 'field_done_ratio', parentId: 'label_conflict_parent_id', projectId: 'field_project',
    trackerId: 'field_tracker', priorityId: 'field_priority', categoryId: 'field_category',
    fixedVersionId: 'field_version'
};

const formatValue = (field: string, value: unknown, available: boolean, task: Partial<Task> | PersistedTaskState | undefined,
    statuses: Array<{ id: number; name: string }>, assignees: Array<{ id: number | null; name: string | null }>) => {
    if (!available) return i18n.t('label_conflict_unavailable') || 'Not available';
    if (value == null || value === '') return i18n.t('label_conflict_empty') || 'Empty';
    if ((field === 'startDate' || field === 'dueDate') && typeof value === 'number') return formatDate(toLocalDisplayDate(value));
    if (field === 'assignedToId') {
        const knownName = assignees.find(assignee => assignee.id === value)?.name;
        if (knownName) return knownName;
        if (task?.assignedToId === value && task.assignedToName) return task.assignedToName;
        return `ID ${String(value)}`;
    }
    if (field === 'statusId') return statuses.find(status => status.id === value)?.name ?? `ID ${String(value)}`;
    return String(value);
};

const formatCustomValue = (value: unknown, available: boolean, format: string | undefined, statuses: Array<{ id: number; name: string }>,
    assignees: Array<{ id: number | null; name: string | null }>) => {
    if (!available || value == null || value === '') return formatValue('customFieldValues', value, available, undefined, statuses, assignees);
    if (format === 'bool') return value === '1' ? (i18n.t('label_yes') || 'Yes') : (i18n.t('label_no') || 'No');
    if (format === 'date' && typeof value === 'string') {
        const date = parseDateOnly(value);
        return date == null ? value : toLocalDisplayDate(date).toLocaleDateString();
    }
    return String(value);
};

const conflictComparison = (
    conflict: TaskConflictRecord,
    patches: Array<LocalPatch<Task>>,
    statuses: Array<{ id: number; name: string }>,
    customFields: Array<{ id: number; name: string; fieldFormat?: string }>,
    assignees: Array<{ id: number | null; name: string | null }>,
    snapshot: ServerSnapshot<Task>,
    activeReadContext: ReadContext | null,
    readStatus: 'idle' | 'loading' | 'ready' | 'error'
) => {
    const retryGeneration = patches.reduce((latest, patch) => Math.max(latest, patch.generation), conflict.generation ?? 0);
    const intent = patches.filter(patch => patch.generation <= retryGeneration)
        .reduce<Partial<Task>>((fields, patch) => ({ ...fields, ...patch.mutationIntent }), {});
    const remote = selectConflictRemote(conflict, snapshot, activeReadContext, readStatus)?.entity;
    const rows: Array<{ label: string; local: string; remote: string }> = [];
    Object.entries(intent).forEach(([field, value]) => {
        if (field === 'customFieldValues') {
            Object.entries(value ?? {}).forEach(([id, customValue]) => {
                const remoteValues = remote?.customFieldValues;
                const known = remoteValues && hasField(remoteValues, id);
                const fieldMeta = customFields.find(meta => String(meta.id) === id);
                rows.push({
                    label: fieldMeta?.name ?? `${i18n.t('label_custom_field_plural') || 'Custom field'} ID ${id}`,
                    local: formatCustomValue(customValue, true, fieldMeta?.fieldFormat, statuses, assignees),
                    remote: formatCustomValue(known ? remoteValues[id] : undefined, Boolean(known), fieldMeta?.fieldFormat, statuses, assignees)
                });
            });
            return;
        }
        rows.push({
            label: fieldLabels[field] ? (i18n.t(fieldLabels[field]) || field) : field,
            local: formatValue(field, value, true, undefined, statuses, assignees),
            remote: formatValue(field, remote && hasField(remote, field) ? remote[field as keyof PersistedTaskState] : undefined,
                Boolean(remote && hasField(remote, field)), remote, statuses, assignees)
        });
    });
    return rows;
};

/** Keeps the current draft in TaskStore until one of the two explicit choices. */
export const ConflictResolutionPanel: React.FC = () => {
    const conflicts = useTaskStore(state => state.taskConflicts);
    const allTasks = useTaskStore(state => state.allTasks);
    const patches = useTaskStore(state => state.localTaskPatches);
    const statuses = useTaskStore(state => state.taskStatuses);
    const customFields = useTaskStore(state => state.customFields);
    const assignees = useTaskStore(state => state.filterOptions.assignees);
    const snapshot = useTaskStore(state => state.serverTaskSnapshot);
    const activeReadContext = useTaskStore(state => state.activeReadContext);
    const readStatus = useTaskStore(state => state.dataReadStatus);
    const resolveTaskConflict = useTaskStore(state => state.resolveTaskConflict);
    const entries = Object.values(conflicts);
    const taskById = useMemo(() => new Map(allTasks.map(task => [task.id, task])), [allTasks]);
    const panelRef = useRef<HTMLElement>(null);
    const focusAfterResolve = useRef<number | null>(null);
    const [closedSignature, setClosedSignature] = useState<string | null>(null);
    const conflictSignature = entries.map(conflict => `${conflict.taskId}:${conflict.detectedAt}`).join('|');
    const open = closedSignature !== conflictSignature;

    useLayoutEffect(() => {
        if (focusAfterResolve.current === null) return;
        const index = focusAfterResolve.current;
        focusAfterResolve.current = null;
        const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-conflict-choice]');
        buttons?.[Math.min(index * 2, buttons.length - 1)]?.focus();
        if (!buttons?.length) panelRef.current?.querySelector<HTMLElement>('[data-conflict-heading]')?.focus();
    }, [conflicts]);

    if (entries.length === 0) return null;
    const choose = (id: string, resolution: 'local' | 'remote', index: number) => {
        focusAfterResolve.current = index;
        setClosedSignature(null);
        void resolveTaskConflict(id, resolution).catch((error: unknown) => {
            focusAfterResolve.current = null;
            useUIStore.getState().addNotification(error instanceof Error ? error.message : String(error), 'error');
        });
    };

    if (!open) return <button type="button" className="conflict-reopen" data-testid="conflict-reopen"
        onClick={() => setClosedSignature(null)}>
        <span aria-hidden="true">!</span> {i18n.t('label_conflict_resolution') || 'Resolve conflicting changes'}
        <span className="conflict-reopen-count">{entries.length}</span>
    </button>;

    return (<>
        <div className="conflict-backdrop" aria-hidden="true" onMouseDown={() => setClosedSignature(conflictSignature)} />
        <section ref={panelRef} aria-label={i18n.t('label_conflict_resolution') || 'Conflict resolution'}
            data-testid="conflict-resolution-panel" className="conflict-panel">
            <header className="conflict-panel-header">
                <div className="conflict-panel-title-row">
                    <span className="conflict-panel-icon" aria-hidden="true">!</span>
                    <h2 tabIndex={-1} data-conflict-heading>{i18n.t('label_conflict_resolution') || 'Resolve conflicting changes'}</h2>
                    <span className="conflict-panel-count">{entries.length}</span>
                    <button type="button" className="conflict-panel-close" aria-label={i18n.t('button_close') || 'Close'}
                        onClick={() => setClosedSignature(conflictSignature)}>×</button>
                </div>
                <p>{i18n.t('label_conflict_intro') || 'Other users have updated these issues. Review the values and choose which changes to keep.'}</p>
                {entries.length > 1 && <nav className="conflict-panel-jump-list rcg-scroll"
                    aria-label={i18n.t('label_conflict_resolution') || 'Conflict resolution'}>
                    {entries.map(conflict => <button key={conflict.taskId} type="button"
                        data-testid={`conflict-jump-${conflict.taskId}`}
                        aria-label={`#${conflict.taskId} ${taskById.get(conflict.taskId)?.subject || conflict.remoteEntity?.subject || ''}`.trim()}
                        onClick={() => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[data-conflict-card]') ?? [])
                            .find(card => card.dataset.conflictCard === conflict.taskId)
                            ?.scrollIntoView({ block: 'start' })}>#{conflict.taskId}</button>)}
                </nav>}
            </header>
            <div data-testid="conflict-scroll-list" className="conflict-panel-list rcg-scroll">
                {entries.map((conflict, index) => {
                    const localTask = taskById.get(conflict.taskId);
                    const comparison = conflictComparison(conflict, patches[conflict.taskId] ?? [], statuses, customFields, assignees,
                        snapshot, activeReadContext, readStatus);
                    return (
                        <article key={conflict.taskId} data-testid={`task-conflict-${conflict.taskId}`}
                            data-conflict-card={conflict.taskId} className="conflict-card">
                            <div className="conflict-card-heading">
                                <span className="conflict-card-title"><span className="conflict-card-id">#{conflict.taskId}</span>
                                    <strong>{localTask?.subject || conflict.remoteEntity?.subject || ''}</strong></span>
                                <span className="conflict-card-badge">{i18n.t('label_conflict_badge') || 'Conflict'}</span>
                            </div>
                            <p className="conflict-card-message">{conflict.message}</p>
                            {comparison.length > 0 && <div className="conflict-comparison-wrap">
                                <table className="conflict-comparison" aria-label={`${i18n.t('label_conflict_changed_fields') || 'Changed fields'} #${conflict.taskId}`}>
                                    <thead><tr>
                                        <th scope="col">{i18n.t('label_conflict_field_column') || 'Field'}</th>
                                        <th scope="col">{i18n.t('label_conflict_local_column') || 'Local (retry)'}</th>
                                        <th scope="col">{i18n.t('label_conflict_server_column') || 'Server (confirmed)'}</th>
                                    </tr></thead>
                                    <tbody>{comparison.map((row, rowIndex) => <tr key={`${row.label}-${rowIndex}`}>
                                        <th scope="row">{row.label}</th>
                                        <td className="conflict-local-value">{row.local}</td>
                                        <td className={row.local === row.remote ? undefined : 'conflict-remote-value'}>{row.remote}</td>
                                    </tr>)}</tbody>
                                </table>
                            </div>}
                            <div className="conflict-card-actions">
                                <div><button type="button" data-conflict-choice data-testid={`conflict-use-remote-${conflict.taskId}`}
                                    onClick={() => choose(conflict.taskId, 'remote', index)}>
                                    {i18n.t('button_use_remote') || 'Use remote'}
                                </button><span>{i18n.t('label_conflict_use_remote_help') || 'Apply the latest server values'}</span></div>
                                <div><button type="button" data-conflict-choice data-testid={`conflict-keep-local-${conflict.taskId}`}
                                    onClick={() => choose(conflict.taskId, 'local', index)}>
                                    {i18n.t('button_keep_local_retry') || 'Keep local & retry'}
                                </button><span>{i18n.t('label_conflict_retry_help') || 'Try saving your changes again'}</span></div>
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    </>);
};
