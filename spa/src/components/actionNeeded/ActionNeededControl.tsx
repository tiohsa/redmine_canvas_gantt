import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTaskStore } from '../../stores/TaskStore';
import { useWorkloadStore } from '../../stores/WorkloadStore';
import { useUIStore } from '../../stores/UIStore';
import { todayCalendarDate, toLocalDisplayDate } from '../../utils/dateOnly';
import { formatDate } from '../../utils/dateUtils';
import { i18n } from '../../utils/i18n';
import { designTokens } from '../../styles/designTokens';
import { ACTION_REASON_ORDER, summarizeActionNeeded, type ActionReason } from './analysis';

const PAGE_SIZE = 25;
const reasonKey: Record<ActionReason, string> = {
    constraint: 'label_action_constraint', overdue: 'label_action_overdue',
    missingDates: 'label_action_missing_dates', unassigned: 'label_action_unassigned',
    missingEstimate: 'label_action_missing_estimate'
};
const reasonLabel = (reason: ActionReason) => i18n.t(reasonKey[reason]) || reason;
const displayDate = (value?: number | null) => value == null ? '-' : formatDate(toLocalDisplayDate(value));

const useCalendarToday = () => {
    const [today, setToday] = useState(todayCalendarDate);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        const arm = () => {
            const next = new Date();
            next.setHours(24, 0, 0, 50);
            timer = setTimeout(() => { setToday(todayCalendarDate()); arm(); }, next.getTime() - Date.now());
        };
        arm();
        return () => clearTimeout(timer);
    }, []);
    return today;
};

export const ActionNeededControl: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState<ActionReason | 'all'>('all');
    const [page, setPage] = useState(0);
    const [overloadPage, setOverloadPage] = useState(0);
    const today = useCalendarToday();
    const allTasks = useTaskStore(state => state.allTasks);
    const statuses = useTaskStore(state => state.taskStatuses);
    const assignees = useTaskStore(state => state.filterOptions.assignees);
    const scheduling = useTaskStore(state => state.schedulingStates);
    const filterText = useTaskStore(state => state.filterText);
    const selectedAssigneeIds = useTaskStore(state => state.selectedAssigneeIds);
    const selectedProjectIds = useTaskStore(state => state.selectedProjectIds);
    const selectedVersionIds = useTaskStore(state => state.selectedVersionIds);
    const selectedTrackerIds = useTaskStore(state => state.selectedTrackerIds);
    const showSubprojects = useTaskStore(state => state.showSubprojects);
    const currentProjectId = useTaskStore(state => state.currentProjectId);
    const readStatus = useTaskStore(state => state.dataReadStatus);
    const initialDataLoaded = useTaskStore(state => state.initialDataLoaded);
    const modifiedTaskIds = useTaskStore(state => state.modifiedTaskIds);
    const focusTask = useTaskStore(state => state.focusTask);
    const workloadData = useWorkloadStore(state => state.workloadData);
    const workloadPaneVisible = useWorkloadStore(state => state.workloadPaneVisible);
    const capacityThreshold = useWorkloadStore(state => state.capacityThreshold);
    const leafIssuesOnly = useWorkloadStore(state => state.leafIssuesOnly);
    const includeClosedIssues = useWorkloadStore(state => state.includeClosedIssues);
    const todayOnwardOnly = useWorkloadStore(state => state.todayOnwardOnly);
    const range = useWorkloadStore(state => state.range);
    const setWorkloadPaneVisible = useWorkloadStore(state => state.setWorkloadPaneVisible);
    const setFocusedHistogramBar = useWorkloadStore(state => state.setFocusedHistogramBar);

    const summary = useMemo(() => summarizeActionNeeded(allTasks, statuses, scheduling, {
        filterText, selectedAssigneeIds, selectedProjectIds, selectedVersionIds,
        selectedTrackerIds, showSubprojects, currentProjectId
    }, today), [allTasks, statuses, scheduling, filterText, selectedAssigneeIds, selectedProjectIds,
        selectedVersionIds, selectedTrackerIds, showSubprojects, currentProjectId, today]);
    const assigneeNames = useMemo(() => new Map(assignees.filter(option => option.id != null && option.name)
        .map(option => [option.id, option.name])), [assignees]);
    const ready = initialDataLoaded && readStatus === 'ready';
    const shown = useMemo(() => reason === 'all' ? summary.items : summary.items.filter(item => item.reasons.includes(reason)), [summary, reason]);
    const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const overloads = useMemo(() => ready && workloadPaneVisible && workloadData ? [...workloadData.assignees.values()]
        .flatMap(assignee => [...assignee.dailyWorkloads.values()].filter(daily => daily.isPlannedOverload)
            .map(daily => ({ assigneeId: assignee.assigneeId, assigneeName: assignee.assigneeName, daily })))
        .sort((a, b) => a.daily.timestamp - b.daily.timestamp || a.assigneeName.localeCompare(b.assigneeName)) : null,
    [ready, workloadData, workloadPaneVisible]);
    const goToTask = (taskId: string) => {
        const result = focusTask(taskId);
        if (result.status !== 'ok') {
            useUIStore.getState().addNotification(i18n.t('label_action_focus_unavailable') || 'Task cannot be focused in this view', 'warning');
        } else setOpen(false);
    };

    return <>
        <button type="button" data-testid="action-needed-button" className="gantt-toolbar-labeled-button"
            aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}
            style={{ border: `1px solid ${designTokens.controlBorder}`, borderRadius: 6, background: designTokens.controlBg,
                color: designTokens.controlFg, minHeight: 32, padding: '0 8px', cursor: 'pointer' }}>
            {i18n.t('label_action_needed') || 'Action needed'} {ready && <span data-testid="action-needed-count">{summary.items.length}</span>}
        </button>
        {open && createPortal(<div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
            <section role="dialog" aria-modal="true" aria-label={i18n.t('label_action_needed') || 'Action needed'}
                style={{ width: 'min(760px, 100%)', maxHeight: 'calc(100dvh - 24px)', minHeight: 0, display: 'flex', flexDirection: 'column',
                    background: designTokens.controlBg, color: designTokens.textPrimary, borderRadius: 12, padding: 16, boxSizing: 'border-box', overflowWrap: 'anywhere' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <strong>{i18n.t('label_action_needed') || 'Action needed'}</strong>
                    <button type="button" onClick={() => setOpen(false)} aria-label={i18n.t('button_close') || 'Close'}>×</button>
                </header>
                {ready ? <>
                    <div style={{ margin: '8px 0' }}>
                        {i18n.t('label_action_loaded_scope') || 'Loaded, visible open issues matching the current query and filters'}: {summary.items.length}
                        {modifiedTaskIds.size > 0 && ` · ${i18n.t('label_action_includes_drafts') || 'Includes unsaved changes'}`}
                    </div>
                    <div title={i18n.t('label_action_unplanned_help') || ''}>
                        {i18n.t('label_action_unplanned_hours') || 'Unplanned estimated hours'}: {summary.unplannedEstimatedHours}
                        {' · '}{i18n.t('label_action_missing_estimate') || 'Missing estimate'}: {summary.missingEstimateCount}
                        <div style={{ fontSize: 12, color: designTokens.textMuted }}>{i18n.t('label_action_unplanned_help') || ''}</div>
                    </div>
                    <nav aria-label={i18n.t('label_action_filter') || 'Filter reasons'} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
                        {(['all', ...ACTION_REASON_ORDER] as const).map(value => <button key={value} type="button"
                            aria-pressed={reason === value} onClick={() => { setReason(value); setPage(0); }}>
                            {value === 'all' ? (i18n.t('label_all') || 'All') : reasonLabel(value)} ({value === 'all' ? summary.items.length : summary.counts[value]})
                        </button>)}
                    </nav>
                    <div data-testid="action-needed-list" style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
                        {shown.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(({ task, reasons, schedulingMessage }) =>
                            <div key={task.id} style={{ padding: '8px 0', borderTop: `1px solid ${designTokens.borderSubtle}` }}>
                                <button type="button" onClick={() => goToTask(task.id)} style={{ textAlign: 'left', overflowWrap: 'anywhere' }}>
                                    #{task.id} {task.subject}
                                </button>
                                <div style={{ fontSize: 12, color: designTokens.textMuted }}>
                                    {reasons.map(reasonLabel).join(' · ')} · {i18n.t('field_start_date') || 'Start'}: {displayDate(task.startDate)}
                                    {' · '}{i18n.t('field_due_date') || 'Due'}: {displayDate(task.dueDate)}
                                    {' · '}{i18n.t('field_assigned_to') || 'Assignee'}: {task.assignedToId == null ? '-' : (assigneeNames.get(task.assignedToId) || `ID ${task.assignedToId}`)}
                                    {' · '}{i18n.t('field_estimated_hours') || 'Estimate'}: {task.estimatedHours ?? '-'}
                                    {schedulingMessage && ` · ${schedulingMessage}`}
                                </div>
                            </div>)}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
                        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>‹</button>
                        <span>{currentPage + 1} / {pageCount}</span>
                        <button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>›</button>
                    </div>
                </> : <p>{readStatus === 'error' ? (i18n.t('label_action_load_failed') || 'Data could not be loaded') :
                    (i18n.t('label_action_loading') || 'Loading current issues')}</p>}
                <div style={{ borderTop: `1px solid ${designTokens.borderSubtle}`, paddingTop: 8 }}>
                    <strong>{i18n.t('label_action_planned_overload') || 'Planned overload'}</strong>
                    <div style={{ fontSize: 12, color: designTokens.textMuted }}>
                        {i18n.t('label_action_overload_scope') || 'Current workload range and settings'}
                        {range && ` · ${displayDate(range.from)} – ${displayDate(range.to)}`} · {i18n.t('label_action_threshold') || 'Threshold'}: {capacityThreshold}h
                        {' · '}{i18n.t('label_action_leaf_only') || 'Leaf only'}: {leafIssuesOnly ? (i18n.t('label_yes') || 'Yes') : (i18n.t('label_no') || 'No')}
                        {' · '}{i18n.t('label_action_include_closed') || 'Include closed'}: {includeClosedIssues ? (i18n.t('label_yes') || 'Yes') : (i18n.t('label_no') || 'No')}
                        {' · '}{i18n.t('label_action_today_onward') || 'Today onward'}: {todayOnwardOnly ? (i18n.t('label_yes') || 'Yes') : (i18n.t('label_no') || 'No')}
                    </div>
                    {overloads === null ? <button type="button" onClick={() => { setWorkloadPaneVisible(true); setOpen(false); }}>
                        {i18n.t('label_action_open_workload') || 'Open workload to calculate'}</button> :
                        <div style={{ maxHeight: 110, overflowY: 'auto' }}>
                            {overloads.length === 0 ? '0' : overloads.slice(overloadPage * PAGE_SIZE, (overloadPage + 1) * PAGE_SIZE).map(({ assigneeId, assigneeName, daily }) =>
                                <button key={`${assigneeId}-${daily.dateStr}`} type="button" onClick={() => {
                                    setFocusedHistogramBar({ assigneeId, dateStr: daily.dateStr }); setOpen(false);
                                }} style={{ display: 'block', width: '100%', textAlign: 'left' }}>
                                    {assigneeName} · {daily.dateStr} · {daily.plannedLoad}h / {capacityThreshold}h
                                    {' · '}{daily.plannedContributions.map(contribution => `#${contribution.task.id}`).join(', ')}
                                </button>)}
                            {overloads.length > PAGE_SIZE && <div>
                                {overloads.length} {i18n.t('label_action_overload_days') || 'assignee-days'}
                                <button type="button" disabled={overloadPage === 0} onClick={() => setOverloadPage(overloadPage - 1)}>‹</button>
                                {overloadPage + 1} / {Math.ceil(overloads.length / PAGE_SIZE)}
                                <button type="button" disabled={(overloadPage + 1) * PAGE_SIZE >= overloads.length} onClick={() => setOverloadPage(overloadPage + 1)}>›</button>
                            </div>}
                        </div>}
                </div>
            </section>
        </div>, document.body)}
    </>;
};
