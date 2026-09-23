import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTaskStore } from '../../stores/TaskStore';
import { useWorkloadStore } from '../../stores/WorkloadStore';
import { useUIStore } from '../../stores/UIStore';
import { todayCalendarDate, toLocalDisplayDate } from '../../utils/dateOnly';
import { formatDate } from '../../utils/dateUtils';
import { i18n } from '../../utils/i18n';
import { ACTION_REASON_ORDER, summarizeActionNeeded, type ActionReason } from './analysis';
import './ActionNeededControl.css';

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
    const overloadPageCount = Math.max(1, Math.ceil((overloads?.length ?? 0) / PAGE_SIZE));
    const currentOverloadPage = Math.min(overloadPage, overloadPageCount - 1);
    const goToTask = (taskId: string) => {
        const result = focusTask(taskId);
        if (result.status !== 'ok') {
            useUIStore.getState().addNotification(i18n.t('label_action_focus_unavailable') || 'Task cannot be focused in this view', 'warning');
        } else setOpen(false);
    };

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open]);

    return <>
        <button type="button" data-testid="action-needed-button" className="action-needed-trigger"
            aria-label={i18n.t('label_action_needed') || 'Action needed'}
            title={i18n.t('label_action_needed') || 'Action needed'}
            aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6" />
                <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
            </svg>
        </button>
        {open && createPortal(<div className="action-needed-backdrop" role="presentation"
            onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
            <section className={`action-needed-dialog${ready ? ' action-needed-dialog-ready' : ''}`} role="dialog" aria-modal="true"
                aria-label={i18n.t('label_action_needed') || 'Action needed'}>
                <header className="action-needed-header">
                    <span className="action-needed-header-icon" aria-hidden="true">!</span>
                    <div className="action-needed-heading">
                        <div className="action-needed-title-line">
                            <h2>{i18n.t('label_action_needed') || 'Action needed'}</h2>
                            {ready && <span className="action-needed-total">{summary.items.length}</span>}
                        </div>
                        <p>{i18n.t('label_action_loaded_scope') || 'Loaded, visible open issues matching the current query and filters'}</p>
                        {modifiedTaskIds.size > 0 && <span className="action-needed-draft-note">{i18n.t('label_action_includes_drafts') || 'Includes unsaved changes'}</span>}
                    </div>
                    <button className="action-needed-close-icon" type="button" onClick={() => setOpen(false)}
                        aria-label={i18n.t('button_close') || 'Close'}>×</button>
                </header>
                {ready ? <>
                    <div className="action-needed-metrics">
                        <div className="action-needed-metric">
                            <span className="action-needed-metric-icon" aria-hidden="true">☷</span>
                            <div><span className="action-needed-metric-label">{i18n.t('label_action_needed') || 'Action needed'}</span>
                                <strong>{summary.items.length}</strong></div>
                        </div>
                        <div className="action-needed-metric" title={i18n.t('label_action_unplanned_help') || ''}>
                            <span className="action-needed-metric-icon" aria-hidden="true">◷</span>
                            <div><span className="action-needed-metric-label">{i18n.t('label_action_unplanned_hours') || 'Unplanned estimated hours'}: </span>
                                <strong>{summary.unplannedEstimatedHours}<small>h</small></strong></div>
                        </div>
                        <div className="action-needed-metric">
                            <span className="action-needed-metric-icon" aria-hidden="true">✳</span>
                            <div><span className="action-needed-metric-label">{i18n.t('label_action_missing_estimate') || 'Missing estimate'}</span>
                                <strong>{summary.missingEstimateCount}</strong></div>
                        </div>
                    </div>
                    <p className="action-needed-metric-help">{i18n.t('label_action_unplanned_help') || ''}</p>
                    <nav className="action-needed-filters" aria-label={i18n.t('label_action_filter') || 'Filter reasons'}>
                        {(['all', ...ACTION_REASON_ORDER] as const).map(value => <button key={value} type="button"
                            aria-pressed={reason === value} onClick={() => { setReason(value); setPage(0); }}>
                            <span>{value === 'all' ? (i18n.t('label_all') || 'All') : reasonLabel(value)}</span>
                            <span className="action-needed-filter-count">{value === 'all' ? summary.items.length : summary.counts[value]}</span>
                        </button>)}
                    </nav>
                    <div data-testid="action-needed-list" className="action-needed-list">
                        {shown.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(({ task, reasons, schedulingMessage }) =>
                            <button className="action-needed-row" key={task.id} type="button" onClick={() => goToTask(task.id)}>
                                <span className="action-needed-row-top">
                                    <span className="action-needed-issue-id">#{task.id}</span>
                                    <strong className="action-needed-subject">{task.subject}</strong>
                                    <span className="action-needed-reasons">{reasons.map(value => <span key={value} className={`action-needed-reason action-needed-reason-${value}`}>{reasonLabel(value)}</span>)}</span>
                                    <span className="action-needed-chevron" aria-hidden="true">›</span>
                                </span>
                                <span className="action-needed-row-details">
                                    <span>{i18n.t('field_start_date') || 'Start'}: {displayDate(task.startDate)}</span>
                                    <span>{i18n.t('field_due_date') || 'Due'}: {displayDate(task.dueDate)}</span>
                                    <span>{i18n.t('field_assigned_to') || 'Assignee'}: {task.assignedToId == null ? '-' : (assigneeNames.get(task.assignedToId) || `ID ${task.assignedToId}`)}</span>
                                    <span>{i18n.t('field_estimated_hours') || 'Estimate'}: {task.estimatedHours == null ? '-' : `${task.estimatedHours}h`}</span>
                                </span>
                                {schedulingMessage && <span className="action-needed-scheduling-message">{schedulingMessage}</span>}
                            </button>)}
                        {shown.length === 0 && <p className="action-needed-empty">0 {i18n.t('label_action_needed') || 'Action needed'}</p>}
                    </div>
                    <div className="action-needed-pagination">
                        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>‹</button>
                        <span>{currentPage + 1} / {pageCount}</span>
                        <button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>›</button>
                    </div>
                </> : <p className="action-needed-loading">{readStatus === 'error' ? (i18n.t('label_action_load_failed') || 'Data could not be loaded') :
                    (i18n.t('label_action_loading') || 'Loading current issues')}</p>}
                <section className="action-needed-overload" aria-label={i18n.t('label_action_planned_overload') || 'Planned overload'}>
                    <div className="action-needed-overload-header">
                        <div className="action-needed-overload-heading">
                            <span className="action-needed-overload-icon" aria-hidden="true">!</span>
                            <div><h3>{i18n.t('label_action_planned_overload') || 'Planned overload'}</h3>
                                <span>{i18n.t('label_action_overload_scope') || 'Current workload range and settings'}</span></div>
                        </div>
                        <div className="action-needed-overload-scope">
                            {range && <span>{displayDate(range.from)} – {displayDate(range.to)}</span>}
                            <span>{i18n.t('label_action_threshold') || 'Threshold'}: {capacityThreshold}h</span>
                        </div>
                    </div>
                    <div className="action-needed-overload-settings">
                        {i18n.t('label_action_leaf_only') || 'Leaf only'}: {leafIssuesOnly ? (i18n.t('label_yes') || 'Yes') : (i18n.t('label_no') || 'No')}
                        {' · '}{i18n.t('label_action_include_closed') || 'Include closed'}: {includeClosedIssues ? (i18n.t('label_yes') || 'Yes') : (i18n.t('label_no') || 'No')}
                        {' · '}{i18n.t('label_action_today_onward') || 'Today onward'}: {todayOnwardOnly ? (i18n.t('label_yes') || 'Yes') : (i18n.t('label_no') || 'No')}
                    </div>
                    {overloads === null ? <button className="action-needed-open-workload" type="button" onClick={() => { setWorkloadPaneVisible(true); setOpen(false); }}>
                        {i18n.t('label_action_open_workload') || 'Open workload to calculate'}</button> :
                        <div className="action-needed-overload-list">
                            {overloads.length === 0 ? <p className="action-needed-empty">0 {i18n.t('label_action_overload_days') || 'assignee-days'}</p> :
                                overloads.slice(currentOverloadPage * PAGE_SIZE, (currentOverloadPage + 1) * PAGE_SIZE).map(({ assigneeId, assigneeName, daily }) =>
                                    <button className="action-needed-overload-row" key={`${assigneeId}-${daily.dateStr}`} type="button"
                                        aria-label={`${assigneeName} · ${daily.dateStr} · ${daily.plannedLoad}h / ${capacityThreshold}h · ${daily.plannedContributions.map(contribution => `#${contribution.task.id}`).join(', ')}`}
                                        onClick={() => {
                                            setFocusedHistogramBar({ assigneeId, dateStr: daily.dateStr }); setOpen(false);
                                        }}>
                                        <span className="action-needed-overload-data"><strong>{assigneeName}</strong><span>{daily.dateStr}</span>
                                            <span>{i18n.t('label_action_planned_overload') || 'Planned overload'} <b>{daily.plannedLoad}h</b> / {capacityThreshold}h</span>
                                            <em>+{(daily.plannedLoad - capacityThreshold).toFixed(1)}h</em></span>
                                        <span className="action-needed-overload-tasks">#{daily.plannedContributions.map(contribution => contribution.task.id).join(', #')}</span>
                                        <span className="action-needed-chevron" aria-hidden="true">›</span>
                                    </button>)}
                            {overloads.length > PAGE_SIZE && <div className="action-needed-overload-pagination">
                                <span>{overloads.length} {i18n.t('label_action_overload_days') || 'assignee-days'}</span>
                                <button type="button" disabled={currentOverloadPage === 0} onClick={() => setOverloadPage(currentOverloadPage - 1)}>‹</button>
                                <span>{currentOverloadPage + 1} / {overloadPageCount}</span>
                                <button type="button" disabled={currentOverloadPage + 1 >= overloadPageCount} onClick={() => setOverloadPage(currentOverloadPage + 1)}>›</button>
                            </div>}
                        </div>}
                </section>
                <footer className="action-needed-footer"><button type="button" onClick={() => setOpen(false)}>{i18n.t('button_close') || 'Close'}</button></footer>
            </section>
        </div>, document.body)}
    </>;
};
