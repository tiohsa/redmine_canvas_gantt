import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { Task } from '../../types';
import { parseDateOnly } from '../../utils/dateOnly';
import { useTaskStore } from '../../stores/TaskStore';
import { useWorkloadStore } from '../../stores/WorkloadStore';
import { ActionNeededControl } from './ActionNeededControl';

const task = (id: string, values: Partial<Task> = {}): Task => ({
    id, subject: `Issue ${id}`, statusId: 1, ratioDone: 0, lockVersion: 1,
    editable: true, rowIndex: Number(id), hasChildren: false, hasPhysicalChildren: false,
    assignedToId: 10, startDate: parseDateOnly('2026-09-20')!,
    dueDate: parseDateOnly('2099-09-30')!, estimatedHours: 2, ...values
});

describe('ActionNeededControl triage dialog', () => {
    beforeEach(() => {
        Object.assign(window.RedmineCanvasGantt!.i18n!, {
            label_action_needed: 'Action needed', label_action_constraint: 'Dependency or date constraint',
            label_action_overdue: 'Overdue', label_action_missing_dates: 'Missing start or due date',
            label_action_unassigned: 'No assignee', label_action_missing_estimate: 'No estimated hours',
            label_action_other_reasons: 'and %{count} more', label_action_filter: 'Filter reasons',
            label_action_planned_overload: 'Planned overload', label_action_overload_days: 'assignee-days',
            label_action_open_workload: 'Open workload to calculate', label_not_set: 'Not set', button_close: 'Close',
            label_action_search: 'Search issue ID or subject', label_action_no_matches: 'No matching issues',
            label_action_details: 'Issue details', label_action_back: 'Back to list',
            label_action_reason_count: '%{count} reasons', label_action_open_issue: 'Open this issue',
            label_action_focus_gantt: 'Show in Gantt'
        });
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useWorkloadStore.setState(useWorkloadStore.getInitialState(), true);
        useTaskStore.setState({
            allTasks: [
                task('1', { dueDate: parseDateOnly('2020-09-22')!, assignedToId: null, estimatedHours: undefined }),
                task('2', { startDate: undefined }),
                task('3', { dueDate: undefined }),
                task('4', { startDate: undefined, dueDate: undefined }),
                task('5', { assignedToId: null }),
                task('6', { estimatedHours: undefined }),
                task('7')
            ],
            taskStatuses: [{ id: 1, name: 'Open', isClosed: false }],
            filterOptions: { projects: [], assignees: [{ id: 10, name: 'Jane', projectIds: [] }] },
            schedulingStates: { '7': { state: 'cyclic', message: 'Dependency conflict with #6' } },
            dataReadStatus: 'ready', initialDataLoaded: true,
            currentProjectId: '1', focusTask: vi.fn(() => ({ status: 'ok' as const }))
        });
    });

    it('shows compact rows and all reasons in the detail pane without double counting issues', () => {
        render(<ActionNeededControl />);
        const trigger = screen.getByTestId('action-needed-button');
        expect(trigger).toHaveAttribute('aria-label', 'Action needed: 7');
        expect(within(trigger).getByTestId('action-needed-indicator')).toHaveClass('action-needed-trigger-indicator-ready');
        expect(trigger).not.toHaveTextContent('7');
        fireEvent.click(screen.getByTestId('action-needed-button'));
        const dialog = screen.getByRole('dialog', { name: 'Action needed' });
        expect(dialog.querySelector('.action-needed-total')).toBeNull();
        expect(dialog.querySelector('.action-needed-header-icon')).toBeNull();
        const list = within(dialog).getByTestId('action-needed-list');
        expect(dialog.querySelector('.action-needed-metrics')).toBeNull();
        expect(within(dialog).getByRole('navigation', { name: 'Filter reasons' })).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: /All\s*7/ })).toHaveAttribute('aria-pressed', 'true');
        const overdueFilter = within(dialog).getByRole('button', { name: /Overdue\s*1/ });
        fireEvent.click(overdueFilter);
        expect(overdueFilter).toHaveAttribute('aria-pressed', 'true');
        expect(list.querySelectorAll('.action-needed-row')).toHaveLength(1);
        fireEvent.click(within(dialog).getByRole('button', { name: /All\s*7/ }));
        const rows = list.querySelectorAll('.action-needed-row');
        expect(rows).toHaveLength(7);
        const row = (id: string) => within(list).getByText(`#${id}`).closest('button')!;
        expect(row('1')).toHaveTextContent('Issue 1');
        expect(row('1')).not.toHaveTextContent('Overdue');
        expect(row('1').querySelector('.action-needed-badge')).toBeNull();
        fireEvent.click(row('1'));
        const detail = within(dialog).getByLabelText('Issue details');
        expect(detail).toHaveTextContent('3 reasons');
        expect(detail).toHaveTextContent('Due Date');
        expect(detail).toHaveTextContent('No assignee');
        expect(detail).toHaveTextContent('No estimated hours');
        expect(within(detail).getByRole('link', { name: 'Open this issue' })).toHaveAttribute('href', '/issues/1');
        fireEvent.click(row('7'));
        expect(detail).toHaveTextContent('Dependency conflict with #6');
        expect(within(detail).getByRole('link', { name: '#6' })).toHaveAttribute('href', '/issues/6');
    });

    it('shows a workload entry with count only for calculated data and opens the workload pane', () => {
        render(<ActionNeededControl />);
        fireEvent.click(screen.getByTestId('action-needed-button'));
        let dialog = screen.getByRole('dialog', { name: 'Action needed' });
        const entry = within(dialog).getByRole('button', { name: /Planned overload/ });
        expect(entry).toHaveTextContent('Open workload to calculate');
        expect(dialog.querySelector('.action-needed-overload-row')).toBeNull();
        fireEvent.click(entry);
        expect(useWorkloadStore.getState().workloadPaneVisible).toBe(true);
        expect(screen.queryByRole('dialog', { name: 'Action needed' })).toBeNull();

        useWorkloadStore.setState({ workloadData: { assignees: new Map(), plannedOverloadedAssigneeCount: 1,
            plannedOverloadedDayCount: 2, actualOverloadedAssigneeCount: 0, actualOverloadedDayCount: 0 } });
        fireEvent.click(screen.getByTestId('action-needed-button'));
        dialog = screen.getByRole('dialog', { name: 'Action needed' });
        expect(within(dialog).getByRole('button', { name: /Planned overload 2 assignee-days/ })).toBeInTheDocument();
        expect(dialog.querySelector('.action-needed-overload-row')).toBeNull();
    });

    it('keeps all warnings in details when the list omits them and a category is selected', () => {
        useTaskStore.setState({ schedulingStates: {
            '1': { state: 'conflicted', message: 'Dependency conflict with #2' },
            '7': { state: 'cyclic', message: 'Dependency conflict with #6' }
        } });
        render(<ActionNeededControl />);
        fireEvent.click(screen.getByTestId('action-needed-button'));
        const dialog = screen.getByRole('dialog', { name: 'Action needed' });
        const list = within(dialog).getByTestId('action-needed-list');
        const row = within(list).getByText('#1').closest('button')!;
        expect(row.querySelectorAll('.action-needed-badge')).toHaveLength(0);
        expect(row).not.toHaveTextContent('Dependency or date constraint');
        const detail = within(dialog).getByLabelText('Issue details');
        expect(detail).toHaveTextContent('4 reasons');
        expect(detail.querySelectorAll('.action-needed-badge')).toHaveLength(4);
        fireEvent.click(within(dialog).getByRole('button', { name: /No assignee\s*2/ }));
        expect(within(list).getByText('#1').closest('button')!.querySelector('.action-needed-badge')).toBeNull();
        expect(detail.querySelectorAll('.action-needed-badge')).toHaveLength(4);
        expect(within(dialog).getByRole('button', { name: /All\s*7/ })).toBeInTheDocument();
    });

    it('combines search, filter, and selection while store data changes', () => {
        render(<ActionNeededControl />);
        fireEvent.click(screen.getByTestId('action-needed-button'));
        const dialog = screen.getByRole('dialog', { name: 'Action needed' });
        const search = within(dialog).getByRole('searchbox', { name: 'Search issue ID or subject' });
        fireEvent.change(search, { target: { value: 'Issue 1' } });
        expect(within(dialog).getByRole('button', { name: /All\s*1/ })).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: /No assignee\s*1/ }));
        expect(within(dialog).getByLabelText('Issue details')).toHaveTextContent('Issue 1');
        fireEvent.change(search, { target: { value: 'Issue 5' } });
        expect(within(dialog).getByLabelText('Issue details')).toHaveTextContent('Issue 5');
        fireEvent.change(search, { target: { value: 'Issue 99' } });
        expect(within(dialog).getByText('No matching issues')).toBeInTheDocument();
        expect(within(dialog).getByLabelText('Issue details')).toBeEmptyDOMElement();
        act(() => useTaskStore.setState({ dataReadStatus: 'loading' }));
        expect(within(dialog).getByRole('status')).toHaveTextContent('Loading current issues');
        fireEvent.change(search, { target: { value: 'Issue 1' } });
        act(() => useTaskStore.setState({ dataReadStatus: 'ready' }));
        expect(within(dialog).getByLabelText('Issue details')).toHaveTextContent('Issue 1');
        expect(search).toHaveValue('Issue 1');
    });

    it('switches to a separate detail view on narrow screens and preserves long subjects', () => {
        vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
        const longSubject = 'Long issue name '.repeat(30);
        const current = useTaskStore.getState().allTasks;
        useTaskStore.setState({ allTasks: current.map(value => value.id === '1' ? { ...value, subject: longSubject } : value) });
        render(<ActionNeededControl />);
        fireEvent.click(screen.getByTestId('action-needed-button'));
        const dialog = screen.getByRole('dialog', { name: 'Action needed' });
        fireEvent.click(within(dialog).getByText('#1').closest('button')!);
        expect(dialog.querySelector('.action-needed-main')).toHaveClass('action-needed-main-details-open');
        expect(within(dialog).getByLabelText('Issue details')).toHaveTextContent(longSubject);
        const back = within(dialog).getByRole('button', { name: 'Back to list' });
        expect(back).toHaveFocus();
        fireEvent.click(back);
        expect(dialog.querySelector('.action-needed-main')).not.toHaveClass('action-needed-main-details-open');
        expect(within(dialog).getByRole('searchbox')).toHaveFocus();
        vi.unstubAllGlobals();
    });
});
