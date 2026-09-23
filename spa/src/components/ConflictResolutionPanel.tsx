import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTaskStore, type TaskConflictRecord } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import type { Task, PersistedTaskState } from '../types';
import type { LocalPatch, ReadContext, ServerSnapshot } from '../stores/taskStore/stateContract';
import { selectConflictRemote } from '../stores/taskStore/conflictRemote';
import { scheduleConflictIds, scheduleConflictPlan } from '../stores/taskStore/scheduleConflictResolution';
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
    const retryGeneration = conflict.scheduleReview?.generations[conflict.taskId] ??
        patches.reduce((latest, patch) => Math.max(latest, patch.generation), conflict.generation ?? 0);
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
    const store = useTaskStore();
    const [pending, setPending] = useState(false);
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
        const grouped = scheduleConflictIds(store, id).length > 0;
        if (grouped) setPending(true);
        focusAfterResolve.current = index;
        setClosedSignature(null);
        void resolveTaskConflict(id, resolution).catch((error: unknown) => {
            focusAfterResolve.current = null;
            useUIStore.getState().addNotification(error instanceof Error ? error.message : String(error), 'error');
        }).finally(() => { if (grouped) setPending(false); });
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
                    const groupIds = scheduleConflictIds(store, conflict.taskId);
                    const grouped = groupIds.length > 0;
                    const review = conflict.scheduleReview;
                    const plan = review ? scheduleConflictPlan(store, review) : undefined;
                    const busy = pending || review?.busy;
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
                            {grouped && groupIds[0] === conflict.taskId && <div className="conflict-group" data-testid={`conflict-group-${conflict.taskId}`}>
                                <strong>{i18n.t('label_conflict_schedule_group') || 'Schedule group'}: {(review?.taskIds ?? groupIds).map(id => `#${id}`).join(', ')}</strong>
                                <p>{i18n.t('label_conflict_schedule_help') || 'Choose each version, then apply the group. Other drafts stay unsaved.'}</p>
                                {plan && <ul className="conflict-group-plan">{plan.tasks.map(task => {
                                    const member = conflicts[task.id];
                                    const choice = member?.scheduleChoice;
                                    const status = member && !choice ? (i18n.t('label_conflict_unselected') || 'Not selected')
                                        : choice === 'local' || plan.changes.some(change => change.taskId === task.id)
                                            ? (i18n.t('button_select_local') || 'Local dates')
                                            : (i18n.t('label_conflict_server_column') || 'Server (confirmed)');
                                    return <li key={task.id}>#{task.id}: {status} — {formatValue('startDate', task.startDate, true, task, statuses, assignees)}
                                        {' – '}{formatValue('dueDate', task.dueDate, true, task, statuses, assignees)}</li>;
                                })}</ul>}
                                {(plan?.error || review?.error) && <p role="alert">{plan?.error || review?.error}</p>}
                                {review?.adjustments?.values.length && <div className="conflict-adjustments" data-testid="conflict-adjustments">
                                    <strong>{i18n.t('label_conflict_adjustments_title') || 'Redmine would change these dates'}</strong>
                                    <p>{i18n.t('label_conflict_adjustments_help') || 'Review every change before applying. The current plan has not been saved.'}</p>
                                    <ul>{review.adjustments.values.map(adjustment => <li key={adjustment.taskId}>
                                        #{adjustment.taskId}: {formatValue('startDate', adjustment.beforeStartDate, true, undefined, statuses, assignees)}
                                        {' – '}{formatValue('dueDate', adjustment.beforeDueDate, true, undefined, statuses, assignees)}
                                        {' → '}{formatValue('startDate', adjustment.startDate, true, undefined, statuses, assignees)}
                                        {' – '}{formatValue('dueDate', adjustment.dueDate, true, undefined, statuses, assignees)}
                                    </li>)}</ul>
                                    <button type="button" disabled={busy || plan?.incomplete || Boolean(plan?.error) ||
                                        review.adjustments.planKey !== plan?.planKey}
                                        data-testid={`conflict-accept-adjustments-${conflict.taskId}`}
                                        onClick={() => void store.applyScheduleConflict(conflict.taskId, true)}>
                                        {i18n.t('button_apply_conflict_adjustments') || 'Accept adjusted dates and apply'}
                                    </button>
                                </div>}
                                <button type="button" disabled={busy || !review || plan?.incomplete || Boolean(plan?.error) || Boolean(review.adjustments?.values.length)}
                                    data-testid={`conflict-apply-${conflict.taskId}`}
                                    onClick={() => void store.applyScheduleConflict(conflict.taskId)}>
                                    {i18n.t('button_apply_conflict_group') || 'Apply this group'}
                                </button>
                                <button type="button" disabled={busy} onClick={() => {
                                    setPending(true);
                                    void store.prepareScheduleConflict(conflict.taskId).catch(error =>
                                        useUIStore.getState().addNotification(String(error), 'error')).finally(() => setPending(false));
                                }}>{i18n.t('button_review_conflict_group') || 'Refresh comparison and reselect'}</button>
                            </div>}
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
                                    disabled={busy} aria-pressed={grouped ? conflict.scheduleChoice === 'remote' : undefined}
                                    onClick={() => choose(conflict.taskId, 'remote', index)}>
                                    {grouped ? (i18n.t('button_select_remote') || 'Select server') : (i18n.t('button_use_remote') || 'Use remote')}
                                </button><span>{grouped ? (i18n.t('label_conflict_selection_only') || 'Selection only; apply the group to confirm') : (i18n.t('label_conflict_use_remote_help') || 'Apply the latest server values')}</span></div>
                                <div><button type="button" data-conflict-choice data-testid={`conflict-keep-local-${conflict.taskId}`}
                                    disabled={busy} aria-pressed={grouped ? conflict.scheduleChoice === 'local' : undefined}
                                    onClick={() => choose(conflict.taskId, 'local', index)}>
                                    {grouped ? (i18n.t('button_select_local') || 'Select local dates') : (i18n.t('button_keep_local_retry') || 'Keep local & retry')}
                                </button><span>{grouped ? (i18n.t('label_conflict_selection_only') || 'Selection only; apply the group to confirm') : (i18n.t('label_conflict_retry_help') || 'Try saving your changes again')}</span></div>
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    </>);
};
