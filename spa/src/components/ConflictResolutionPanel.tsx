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

/** Keeps conflicted drafts in TaskStore until the user makes an explicit choice. */
export const ConflictResolutionPanel: React.FC<{ relationReviewRequest?: number }> = ({ relationReviewRequest = 0 }) => {
    const store = useTaskStore();
    const [pending, setPending] = useState(false);
    const conflicts = useTaskStore(state => state.taskConflicts);
    const pendingRelationChanges = useTaskStore(state => state.pendingRelationChanges);
    const serverRelations = useTaskStore(state => state.relations);
    const activeReadContext = useTaskStore(state => state.activeReadContext);
    const refreshData = useTaskStore(state => state.refreshData);
    const saveChanges = useTaskStore(state => state.saveChanges);
    const resolveUnknownRelationChange = useTaskStore(state => state.resolveUnknownRelationChange);
    const allTasks = useTaskStore(state => state.allTasks);
    const patches = useTaskStore(state => state.localTaskPatches);
    const statuses = useTaskStore(state => state.taskStatuses);
    const customFields = useTaskStore(state => state.customFields);
    const assignees = useTaskStore(state => state.filterOptions.assignees);
    const snapshot = useTaskStore(state => state.serverTaskSnapshot);
    const readStatus = useTaskStore(state => state.dataReadStatus);
    const resolveTaskConflict = useTaskStore(state => state.resolveTaskConflict);
    const entries = Object.values(conflicts);
    const taskById = useMemo(() => new Map(allTasks.map(task => [task.id, task])), [allTasks]);
    const panelRef = useRef<HTMLElement>(null);
    const focusAfterResolve = useRef<number | null>(null);
    const [closedSignature, setClosedSignature] = useState<string | null>(null);
    const conflictSignature = entries.map(conflict => `${conflict.taskId}:${conflict.detectedAt}`).join('|');
    const relationEntries = Object.values(pendingRelationChanges).filter(change => change.status === 'failed' || change.status === 'unknown');
    const relationSignature = relationEntries.map(change => `${change.draftId}:${change.generation}:${change.status}`).join('|');
    const reviewSignature = `${conflictSignature}#${relationSignature}`;
    const relationRequestSeen = useRef(relationReviewRequest);
    const [focusRelationReview, setFocusRelationReview] = useState(false);
    const [relationResolutionDraftId, setRelationResolutionDraftId] = useState<string | null>(null);
    const [relationResolutionAction, setRelationResolutionAction] = useState<'refresh' | 'resolve' | 'save' | null>(null);
    const [relationResolutionErrors, setRelationResolutionErrors] = useState<Record<string, string>>({});
    const [refreshedRelationContexts, setRefreshedRelationContexts] = useState<Record<string, string>>({});
    const open = closedSignature !== reviewSignature;

    React.useEffect(() => {
        if (relationRequestSeen.current === relationReviewRequest) return;
        relationRequestSeen.current = relationReviewRequest;
        setClosedSignature(null);
        setFocusRelationReview(true);
    }, [relationReviewRequest]);

    useLayoutEffect(() => {
        if (!focusRelationReview || !open) return;
        panelRef.current?.querySelector<HTMLElement>('[data-conflict-heading]')?.focus();
        setFocusRelationReview(false);
    }, [focusRelationReview, open]);

    useLayoutEffect(() => {
        if (focusAfterResolve.current === null) return;
        const index = focusAfterResolve.current;
        focusAfterResolve.current = null;
        const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-conflict-choice]');
        buttons?.[Math.min(index * 2, buttons.length - 1)]?.focus();
        if (!buttons?.length) panelRef.current?.querySelector<HTMLElement>('[data-conflict-heading]')?.focus();
    }, [conflicts]);

    if (entries.length === 0 && relationEntries.length === 0) return null;
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

    if (!open) return <button type="button" className="conflict-reopen"
        data-testid={entries.length > 0 ? 'conflict-reopen' : 'relation-review-reopen'}
        onClick={() => setClosedSignature(null)}>
        <span aria-hidden="true">!</span> {entries.length > 0
            ? (i18n.t('label_conflict_resolution') || 'Resolve conflicting changes')
            : (i18n.t('label_relation_review') ?? '')}
        <span className="conflict-reopen-count">{entries.length + relationEntries.length}</span>
    </button>;

    return (<>
        <div className="conflict-backdrop" aria-hidden="true" onMouseDown={() => setClosedSignature(reviewSignature)} />
        <section ref={panelRef} aria-label={entries.length > 0
            ? (i18n.t('label_conflict_resolution') || 'Conflict resolution')
            : (i18n.t('label_relation_review') ?? '')}
            data-testid="conflict-resolution-panel" className="conflict-panel">
            <header className="conflict-panel-header">
                <div className="conflict-panel-title-row">
                    <span className="conflict-panel-icon" aria-hidden="true">!</span>
                    <h2 tabIndex={-1} data-conflict-heading>{entries.length > 0
                        ? (i18n.t('label_conflict_resolution') || 'Resolve conflicting changes')
                        : (i18n.t('label_relation_review') ?? '')}</h2>
                    <span className="conflict-panel-count">{entries.length + relationEntries.length}</span>
                    <button type="button" className="conflict-panel-close" aria-label={i18n.t('button_close') || 'Close'}
                        onClick={() => setClosedSignature(reviewSignature)}>×</button>
                </div>
                <p>{entries.length > 0
                    ? (i18n.t('label_conflict_intro') || 'Other users have updated these issues. Review the values and choose which changes to keep.')
                    : (i18n.t('label_relation_review_intro') ?? '')}</p>
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
                {relationEntries.map(change => {
                    const target = change.desired ?? change.original;
                    const isUnknown = change.status === 'unknown';
                    const busy = relationResolutionDraftId !== null || pending || Object.values(pendingRelationChanges).some(item => item.status === 'saving');
                    const currentServerRelation = change.relationId
                        ? serverRelations.find(relation => relation.id === change.relationId)
                        : change.desired
                            ? serverRelations.find(relation => relation.from === change.desired?.from && relation.to === change.desired?.to && relation.type === change.desired?.type)
                            : undefined;
                    const comparisonIsCurrent = Boolean(refreshedRelationContexts[change.draftId] &&
                        refreshedRelationContexts[change.draftId] === activeReadContext?.contextId);
                    const currentValue = comparisonIsCurrent
                        ? i18n.t('label_relation_review_server') ?? ''
                        : `${i18n.t('label_relation_review_server') ?? ''} (${i18n.t('label_relation_review_last_loaded') ?? ''})`;
                    const formatRelation = (relation: { from: string; to: string; type: string; delay?: number } | undefined) => {
                        if (!relation) return i18n.t('label_relation_review_no_relation') ?? '';
                        const type = i18n.t(`label_relation_type_${relation.type}`) ?? '';
                        const delay = relation.delay === undefined ? '' : ` · ${i18n.t('label_delay') ?? ''}: ${relation.delay}`;
                        return `#${relation.from} → #${relation.to} · ${type}${delay}`;
                    };
                    const resolveUnknown = async (resolution: 'assume_applied' | 'retry') => {
                        setRelationResolutionDraftId(change.draftId);
                        setRelationResolutionAction('resolve');
                        setRelationResolutionErrors(previous => ({ ...previous, [change.draftId]: '' }));
                        try {
                            const resolved = await resolveUnknownRelationChange(change.draftId, resolution);
                            if (!resolved) setRelationResolutionErrors(previous => ({
                                ...previous,
                                [change.draftId]: i18n.t('label_relation_result_unknown') ?? ''
                            }));
                        } catch (error: unknown) {
                            setRelationResolutionErrors(previous => ({
                                ...previous,
                                [change.draftId]: error instanceof Error ? error.message : (i18n.t('label_relation_result_unknown') ?? '')
                            }));
                        } finally {
                            setRelationResolutionDraftId(null);
                            setRelationResolutionAction(null);
                        }
                    };
                    const refreshComparison = async () => {
                        setRelationResolutionDraftId(change.draftId);
                        setRelationResolutionAction('refresh');
                        setRelationResolutionErrors(previous => ({ ...previous, [change.draftId]: '' }));
                        const before = useTaskStore.getState().activeReadContext;
                        try {
                            const outcome = await refreshData();
                            const after = useTaskStore.getState();
                            const sameScope = Boolean(before &&
                                before.projectId === outcome.context.projectId &&
                                before.queryIdentity === outcome.context.queryIdentity &&
                                before.scopeIdentity === outcome.context.scopeIdentity);
                            if (outcome.status !== 'applied' || !sameScope ||
                                after.activeReadContext?.contextId !== outcome.context.contextId || after.dataReadStatus !== 'ready') {
                                setRelationResolutionErrors(previous => ({
                                    ...previous,
                                    [change.draftId]: i18n.t('label_relation_review_refresh_failed') ?? ''
                                }));
                            } else {
                                setRefreshedRelationContexts(previous => ({ ...previous, [change.draftId]: outcome.context.contextId }));
                            }
                        } catch (error: unknown) {
                            setRelationResolutionErrors(previous => ({
                                ...previous,
                                [change.draftId]: error instanceof Error ? error.message : (i18n.t('label_relation_review_refresh_failed') ?? '')
                            }));
                        } finally {
                            setRelationResolutionDraftId(null);
                            setRelationResolutionAction(null);
                        }
                    };
                    const retryFailed = async () => {
                        setRelationResolutionDraftId(change.draftId);
                        setRelationResolutionAction('save');
                        setRelationResolutionErrors(previous => ({ ...previous, [change.draftId]: '' }));
                        try {
                            const failures = await saveChanges();
                            if (failures.size > 0) {
                                setRelationResolutionErrors(previous => ({
                                    ...previous,
                                    [change.draftId]: failures.get(change.draftId) ?? i18n.t('label_relation_save_failed') ?? ''
                                }));
                            }
                        } catch (error: unknown) {
                            setRelationResolutionErrors(previous => ({
                                ...previous,
                                [change.draftId]: error instanceof Error ? error.message : (i18n.t('label_relation_save_failed') ?? '')
                            }));
                        } finally {
                            setRelationResolutionDraftId(null);
                            setRelationResolutionAction(null);
                        }
                    };
                    return (
                        <article key={change.draftId} className="conflict-card relation-review-card"
                            data-testid={`relation-review-card-${change.draftId}`}>
                            <div className="conflict-card-heading">
                                <span className="conflict-card-title">
                                    <span className="conflict-card-id">{`#${target?.from ?? '?'} → #${target?.to ?? '?'}`}</span>
                                    <strong>{i18n.t(`label_relation_change_${change.operation}`) ?? ''}</strong>
                                </span>
                                <span className="conflict-card-badge">{isUnknown
                                    ? (i18n.t('label_relation_result_unknown') ?? '')
                                    : (i18n.t('label_relation_save_failed') ?? '')}</span>
                            </div>
                            <dl className="relation-review-comparison">
                                <div><dt>{i18n.t('label_relation_review_original') ?? ''}</dt><dd>{formatRelation(change.original)}</dd></div>
                                <div><dt>{i18n.t('label_relation_review_desired') ?? ''}</dt><dd>{formatRelation(change.desired)}</dd></div>
                                <div><dt>{currentValue}</dt><dd>{formatRelation(currentServerRelation)}</dd></div>
                            </dl>
                            {isUnknown && !comparisonIsCurrent && (
                                <p className="relation-review-progress" role="note">
                                    {i18n.t('label_relation_unknown_review_required') ?? ''}
                                </p>
                            )}
                            {(change.error || relationResolutionErrors[change.draftId]) && (
                                <p className="relation-review-error" role="alert">
                                    {relationResolutionErrors[change.draftId] || change.error}
                                </p>
                            )}
                            {relationResolutionDraftId === change.draftId && (
                                <p className="relation-review-progress" role="status" aria-live="polite">
                                    {isUnknown
                                        ? (relationResolutionAction === 'refresh' || relationResolutionAction === 'resolve'
                                            ? (i18n.t('label_relation_review_refreshing') ?? '')
                                            : (i18n.t('label_relation_save_in_progress') ?? ''))
                                        : (relationResolutionAction === 'refresh'
                                            ? (i18n.t('label_relation_review_refreshing') ?? '')
                                            : (i18n.t('label_relation_save_in_progress') ?? ''))}
                                </p>
                            )}
                            <div className="conflict-card-actions relation-review-actions">
                                <div><button type="button" disabled={busy}
                                    data-testid={`relation-review-refresh-${change.draftId}`}
                                    onClick={() => void refreshComparison()}>
                                    {i18n.t('label_relation_review_refresh') ?? ''}
                                </button></div>
                                {isUnknown ? (
                                    <>
                                        <div><button type="button"
                                            data-testid={`relation-unknown-assume-applied-${change.draftId}`}
                                            disabled={busy || !comparisonIsCurrent}
                                            onClick={() => void resolveUnknown('assume_applied')}>
                                            {i18n.t('label_relation_unknown_assume_applied') ?? ''}
                                        </button></div>
                                        <div><button type="button"
                                            data-testid={`relation-unknown-retry-${change.draftId}`}
                                            disabled={busy || !comparisonIsCurrent}
                                            onClick={() => void resolveUnknown('retry')}>
                                            {i18n.t('label_relation_unknown_retry') ?? ''}
                                        </button></div>
                                    </>
                                ) : (
                                    <div><button type="button" disabled={busy}
                                        data-testid={`relation-failed-retry-${change.draftId}`}
                                        onClick={() => void retryFailed()}>
                                        {i18n.t('label_relation_failed_retry') ?? ''}
                                    </button></div>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    </>);
};
