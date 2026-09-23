import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTaskStore } from '../../stores/TaskStore';
import { useWorkloadStore } from '../../stores/WorkloadStore';
import { useUIStore } from '../../stores/UIStore';
import { todayCalendarDate, toLocalDisplayDate } from '../../utils/dateOnly';
import { formatDate } from '../../utils/dateUtils';
import { i18n } from '../../utils/i18n';
import { getActiveModalDialog } from '../../utils/modalDialog';
import { ACTION_REASON_ORDER, summarizeActionNeeded, type ActionItem, type ActionReason } from './analysis';
import './ActionNeededControl.css';

const PAGE_SIZE = 25;
const reasonKey: Record<ActionReason, string> = {
    constraint: 'label_action_constraint', overdue: 'label_action_overdue',
    missingDates: 'label_action_missing_dates', unassigned: 'label_action_unassigned',
    missingEstimate: 'label_action_missing_estimate'
};
const reasonLabel = (reason: ActionReason) => i18n.t(reasonKey[reason]) || reason;
const displayDate = (value?: number | null) => value == null ? '-' : formatDate(toLocalDisplayDate(value));
const reasonDetail = ({ task, schedulingMessage }: ActionItem, primary: ActionReason, assigneeNames: Map<number, string>) => {
    switch (primary) {
        case 'constraint': return schedulingMessage || '';
        case 'overdue': return `${i18n.t('field_due_date') || 'Due date'} ${displayDate(task.dueDate)}`;
        case 'missingDates': {
            const missing = [task.startDate == null && (i18n.t('field_start_date') || 'Start date'),
                task.dueDate == null && (i18n.t('field_due_date') || 'Due date')].filter(Boolean);
            return `${missing.join(' / ')}: ${i18n.t('label_not_set') || 'Not set'}`;
        }
        case 'unassigned': return task.dueDate == null ? '' : `${i18n.t('field_due_date') || 'Due date'} ${displayDate(task.dueDate)}`;
        case 'missingEstimate': return task.assignedToId == null ? '' :
            (assigneeNames.get(task.assignedToId) || `ID ${task.assignedToId}`);
    }
};

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
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLElement>(null);
    const [reason, setReason] = useState<ActionReason | 'all'>('all');
    const [page, setPage] = useState(0);
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
    const setWorkloadPaneVisible = useWorkloadStore(state => state.setWorkloadPaneVisible);
    const setFocusedHistogramBar = useWorkloadStore(state => state.setFocusedHistogramBar);

    const summary = useMemo(() => summarizeActionNeeded(allTasks, statuses, scheduling, {
        filterText, selectedAssigneeIds, selectedProjectIds, selectedVersionIds,
        selectedTrackerIds, showSubprojects, currentProjectId
    }, today), [allTasks, statuses, scheduling, filterText, selectedAssigneeIds, selectedProjectIds,
        selectedVersionIds, selectedTrackerIds, showSubprojects, currentProjectId, today]);
    const assigneeNames = useMemo(() => new Map<number, string>(assignees.filter(option => option.id != null && option.name)
        .map(option => [option.id!, option.name!])), [assignees]);
    const ready = initialDataLoaded && readStatus === 'ready';
    const loadState = ready ? 'ready' : readStatus === 'error' ? 'error' : 'loading';
    const actionLabel = i18n.t('label_action_needed') || 'Action needed';
    const loadLabel = loadState === 'error' ? (i18n.t('label_action_load_failed') || 'Data could not be loaded')
        : (i18n.t('label_action_loading') || 'Loading current issues');
    const shown = useMemo(() => reason === 'all' ? summary.items : summary.items.filter(item => item.reasons.includes(reason)), [summary, reason]);
    const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const overloadCount = ready && workloadPaneVisible && workloadData ? workloadData.plannedOverloadedDayCount : null;
    const goToTask = (taskId: string) => {
        const result = focusTask(taskId);
        if (result.status !== 'ok') {
            useUIStore.getState().addNotification(i18n.t('label_action_focus_unavailable') || 'Task cannot be focused in this view', 'warning');
        } else setOpen(false);
    };

    // A refresh, page change, or removed row can detach the focused element.
    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        if (open && dialog && getActiveModalDialog() === dialog &&
            (!dialog.contains(document.activeElement) || document.activeElement?.matches(':disabled'))) {
            dialog.querySelector<HTMLButtonElement>('.action-needed-close-icon')?.focus();
        }
    });

    useEffect(() => {
        if (!open) return;
        const dialog = dialogRef.current;
        const restoreFocus = () => {
            if (dialog && getActiveModalDialog() === dialog && !dialog.contains(document.activeElement)) {
                dialog.querySelector<HTMLButtonElement>('.action-needed-close-icon')?.focus();
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!dialog || getActiveModalDialog() !== dialog) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                return;
            }
            restoreFocus();
            if (event.key !== 'Tab') return;
            const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            if (buttons.length === 0) return;
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('focusin', restoreFocus);
        window.addEventListener('keydown', handleKeyDown, true);
        const trigger = triggerRef.current;
        return () => {
            document.removeEventListener('focusin', restoreFocus);
            window.removeEventListener('keydown', handleKeyDown, true);
            if (trigger?.isConnected) trigger.focus();
        };
    }, [open]);

    return <>
        <button ref={triggerRef} type="button" data-testid="action-needed-button"
            data-load-state={loadState} className={`action-needed-trigger action-needed-trigger-${loadState}`}
            aria-label={`${actionLabel}: ${ready ? summary.items.length : loadLabel}`}
            title={`${actionLabel}: ${ready ? summary.items.length : loadLabel}`}
            aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6" />
                <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
            </svg>
            {(!ready || summary.items.length > 0) && <span data-testid="action-needed-indicator"
                className={`action-needed-trigger-indicator action-needed-trigger-indicator-${loadState}`} aria-hidden="true" />}
        </button>
        {open && createPortal(<div className="action-needed-backdrop" role="presentation"
            onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
            <section ref={dialogRef} className={`action-needed-dialog${ready ? ' action-needed-dialog-ready' : ''}`}
                role="dialog" aria-modal="true" aria-label={actionLabel}>
                <header className="action-needed-header">
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
                <div className="action-needed-body">
                {ready ? <>
                    <nav className="action-needed-filters" aria-label={i18n.t('label_action_filter') || 'Filter reasons'}>
                        {(['all', ...ACTION_REASON_ORDER] as const).map(value => <button key={value} type="button"
                            aria-pressed={reason === value} onClick={() => { setReason(value); setPage(0); }}>
                            <span>{value === 'all' ? (i18n.t('label_all') || 'All') : reasonLabel(value)}</span>
                            {' '}
                            <span className="action-needed-filter-count">{value === 'all' ? summary.items.length : summary.counts[value]}</span>
                        </button>)}
                    </nav>
                    <div data-testid="action-needed-list" className="action-needed-list">
                        {shown.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(item => {
                            const { task, reasons } = item;
                            const primary = ACTION_REASON_ORDER.find(value => reasons.includes(value))!;
                            const detail = reasonDetail(item, primary, assigneeNames);
                            const otherCount = reasons.length - 1;
                            const otherLabel = (i18n.t('label_action_other_reasons') || 'and %{count} more').replace('%{count}', String(otherCount));
                            return <button className="action-needed-row" key={task.id} type="button" onClick={() => goToTask(task.id)}
                                aria-label={`#${task.id} ${task.subject}. ${reasons.map(reasonLabel).join(', ')}${detail ? `. ${detail}` : ''}`}
                                title={reasons.map(reasonLabel).join(', ')}>
                                <span className="action-needed-row-top">
                                    <span className="action-needed-issue-id">#{task.id}</span>
                                    <strong className="action-needed-subject">{task.subject}</strong>
                                    <span className="action-needed-chevron" aria-hidden="true">›</span>
                                </span>
                                <span className="action-needed-row-summary">
                                    <span className={`action-needed-primary action-needed-primary-${primary}`}>{reasonLabel(primary)}</span>
                                    {detail && <span className="action-needed-detail"> · {detail}</span>}
                                    {otherCount > 0 && <span className="action-needed-other"> · {otherLabel}</span>}
                                </span>
                            </button>})}
                        {shown.length === 0 && <p className="action-needed-empty">0 {i18n.t('label_action_needed') || 'Action needed'}</p>}
                    </div>
                    <div className="action-needed-pagination">
                        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>‹</button>
                        <span>{currentPage + 1} / {pageCount}</span>
                        <button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>›</button>
                    </div>
                </> : <p className="action-needed-loading">{readStatus === 'error' ? (i18n.t('label_action_load_failed') || 'Data could not be loaded') :
                    (i18n.t('label_action_loading') || 'Loading current issues')}</p>}
                </div>
                <button className="action-needed-overload" type="button" onClick={() => {
                    setFocusedHistogramBar(null);
                    setWorkloadPaneVisible(true);
                    setOpen(false);
                }}>
                    <span className="action-needed-overload-icon" aria-hidden="true">!</span>
                    <span className="action-needed-overload-text">
                        <strong>{i18n.t('label_action_planned_overload') || 'Planned overload'}
                            {overloadCount !== null && ` ${overloadCount} ${i18n.t('label_action_overload_days') || 'assignee-days'}`}</strong>
                        {' '}
                        {overloadCount === null && <small>{i18n.t('label_action_open_workload') || 'Open workload to calculate'}</small>}
                    </span>
                    <span className="action-needed-chevron" aria-hidden="true">›</span>
                </button>
            </section>
        </div>, document.body)}
    </>;
};
