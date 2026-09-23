import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useTaskStore, type TaskConflictRecord } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import type { Task, PersistedTaskState } from '../types';
import type { LocalPatch, ReadContext, ServerSnapshot } from '../stores/taskStore/stateContract';
import { formatDate } from '../utils/dateUtils';
import { parseDateOnly, toLocalDisplayDate } from '../utils/dateOnly';
import { designTokens } from '../styles/designTokens';
import { i18n } from '../utils/i18n';

const hasField = (value: object, field: string) => Object.prototype.hasOwnProperty.call(value, field);
const fieldLabels: Record<string, string> = {
    subject: 'field_subject', startDate: 'field_start_date', dueDate: 'field_due_date',
    assignedToId: 'field_assigned_to', statusId: 'label_status_short', estimatedHours: 'field_estimated_hours',
    ratioDone: 'field_done_ratio', parentId: 'label_conflict_parent_id', projectId: 'field_project',
    trackerId: 'field_tracker', priorityId: 'field_priority', categoryId: 'field_category',
    fixedVersionId: 'field_version'
};

const formatValue = (field: string, value: unknown, task: Partial<Task> | PersistedTaskState | undefined,
    statuses: Array<{ id: number; name: string }>, assignees: Array<{ id: number | null; name: string | null }>) => {
    if (value === undefined) return i18n.t('label_conflict_unavailable') || 'Not available';
    if (value === null || value === '') return i18n.t('label_conflict_empty') || 'Empty';
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

const formatCustomValue = (value: unknown, format: string | undefined, statuses: Array<{ id: number; name: string }>,
    assignees: Array<{ id: number | null; name: string | null }>) => {
    if (value == null || value === '') return formatValue('customFieldValues', value, undefined, statuses, assignees);
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
    const responseRemote = conflict.remoteEntity && (
        conflict.remoteRevision === undefined || conflict.remoteEntity.lockVersion === undefined ||
        conflict.remoteEntity.lockVersion === conflict.remoteRevision
    ) ? conflict.remoteEntity : undefined;
    const snapshotIsCurrent = readStatus === 'ready' && activeReadContext && snapshot.context &&
        snapshot.context.projectId === activeReadContext.projectId &&
        snapshot.context.queryIdentity === activeReadContext.queryIdentity &&
        snapshot.context.scopeIdentity === activeReadContext.scopeIdentity;
    const snapshotRemote = snapshotIsCurrent && conflict.remoteRevision !== undefined &&
        (snapshot.revisions[conflict.taskId] ?? -1) >= conflict.remoteRevision
        ? snapshot.entitiesById[conflict.taskId] : undefined;
    const remote = snapshotRemote ?? responseRemote;
    const rows: Array<{ label: string; local: string; remote: string }> = [];
    Object.entries(intent).forEach(([field, value]) => {
        if (field === 'customFieldValues') {
            Object.entries(value ?? {}).forEach(([id, customValue]) => {
                const remoteValues = remote?.customFieldValues;
                const known = remoteValues && hasField(remoteValues, id);
                const fieldMeta = customFields.find(meta => String(meta.id) === id);
                rows.push({
                    label: fieldMeta?.name ?? `${i18n.t('label_custom_field_plural') || 'Custom field'} ID ${id}`,
                    local: formatCustomValue(customValue, fieldMeta?.fieldFormat, statuses, assignees),
                    remote: formatCustomValue(known ? remoteValues[id] : undefined, fieldMeta?.fieldFormat, statuses, assignees)
                });
            });
            return;
        }
        rows.push({
            label: fieldLabels[field] ? (i18n.t(fieldLabels[field]) || field) : field,
            local: formatValue(field, value, undefined, statuses, assignees),
            remote: formatValue(field, remote && hasField(remote, field) ? remote[field as keyof PersistedTaskState] : undefined, remote, statuses, assignees)
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
        void resolveTaskConflict(id, resolution).catch((error: unknown) => {
            focusAfterResolve.current = null;
            useUIStore.getState().addNotification(error instanceof Error ? error.message : String(error), 'error');
        });
    };

    return (
        <section ref={panelRef} aria-label={i18n.t('label_conflict_resolution') || 'Conflict resolution'}
            data-testid="conflict-resolution-panel" style={{
                position: 'fixed', top: '76px', right: '20px', zIndex: 10000,
                width: 'min(380px, calc(100vw - 40px))', maxHeight: 'calc(100dvh - 96px)',
                boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0,
                padding: '14px', border: `1px solid ${designTokens.borderSubtle}`,
                borderRadius: '10px', backgroundColor: designTokens.controlBg,
                color: designTokens.textPrimary, boxShadow: designTokens.controlActiveShadow,
                fontFamily: 'inherit'
            }}>
            <div tabIndex={-1} data-conflict-heading style={{ fontWeight: 600, marginBottom: '8px', flexShrink: 0 }}>
                {i18n.t('label_conflict_resolution') || 'Resolve conflicting changes'} ({entries.length})
            </div>
            <div data-testid="conflict-scroll-list" style={{ minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                {entries.map((conflict, index) => {
                    const localTask = taskById.get(conflict.taskId);
                    const comparison = conflictComparison(conflict, patches[conflict.taskId] ?? [], statuses, customFields, assignees,
                        snapshot, activeReadContext, readStatus);
                    return (
                        <div key={conflict.taskId} data-testid={`task-conflict-${conflict.taskId}`}
                            style={{ padding: '10px 0', borderTop: `1px solid ${designTokens.borderSubtle}`, minWidth: 0, overflowWrap: 'anywhere' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600 }}>
                                #{conflict.taskId} {localTask?.subject || conflict.remoteEntity?.subject || ''}
                            </div>
                            <div style={{ color: designTokens.textMuted, fontSize: '12px', margin: '4px 0 8px', whiteSpace: 'pre-wrap' }}>
                                {conflict.message}
                            </div>
                            {comparison.length > 0 && <div style={{ fontSize: '12px' }}>
                                <div>{i18n.t('label_conflict_changed_fields') || 'Changed fields'}</div>
                                {comparison.map((row, rowIndex) => <div key={`${row.label}-${rowIndex}`} style={{ margin: '6px 0', minWidth: 0 }}>
                                    <strong>{row.label}</strong>
                                    <div>{i18n.t('label_conflict_retry_value') || 'Retry value'}: {row.local}</div>
                                    <div>{i18n.t('label_conflict_server_value') || 'Server value'}: {row.remote}</div>
                                </div>)}
                            </div>}
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button type="button" data-conflict-choice data-testid={`conflict-use-remote-${conflict.taskId}`}
                                    onClick={() => choose(conflict.taskId, 'remote', index)}>
                                    {i18n.t('button_use_remote') || 'Use remote'}
                                </button>
                                <button type="button" data-conflict-choice data-testid={`conflict-keep-local-${conflict.taskId}`}
                                    onClick={() => choose(conflict.taskId, 'local', index)}>
                                    {i18n.t('button_keep_local_retry') || 'Keep local & retry'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};
