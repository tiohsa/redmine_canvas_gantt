import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
            label_action_open_workload: 'Open workload to calculate', label_not_set: 'Not set', button_close: 'Close'
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

    it('shows compact reason-specific rows, filter counts, and all reasons to assistive technology', () => {
        render(<ActionNeededControl />);
        const trigger = screen.getByTestId('action-needed-button');
        expect(trigger).toHaveAttribute('aria-label', 'Action needed: 7');
        expect(within(trigger).getByTestId('action-needed-indicator')).toHaveClass('action-needed-trigger-indicator-ready');
        expect(trigger).not.toHaveTextContent('7');
        fireEvent.click(screen.getByTestId('action-needed-button'));
        const dialog = screen.getByRole('dialog', { name: 'Action needed' });
        expect(dialog.querySelector('.action-needed-header-icon')).toBeNull();
        const list = within(dialog).getByTestId('action-needed-list');
        expect(dialog.querySelector('.action-needed-metrics')).toBeNull();
        expect(dialog).not.toHaveTextContent('Unplanned estimated hours');
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
        expect(row('1')).toHaveTextContent(/Overdue.*Due Date.*and 2 more/);
        expect(row('1')).toHaveAttribute('aria-label', expect.stringContaining('No assignee, No estimated hours'));
        expect(row('1').querySelectorAll('.action-needed-primary')).toHaveLength(1);
        expect(row('1')).not.toHaveTextContent('Assignee:');
        expect(row('1')).not.toHaveTextContent('Estimated time:');
        expect(row('2')).toHaveTextContent('Start Date: Not set');
        expect(row('2')).not.toHaveTextContent('Due Date');
        expect(row('3')).toHaveTextContent('Due Date: Not set');
        expect(row('4')).toHaveTextContent('Start Date / Due Date: Not set');
        expect(row('5')).toHaveTextContent('No assignee · Due Date');
        expect(row('6')).toHaveTextContent('No estimated hours · Jane');
        expect(row('7')).toHaveTextContent('Dependency conflict with #6');
        expect(dialog.querySelector('.action-needed-reason')).toBeNull();
        expect(dialog.querySelector('.action-needed-footer')).toBeNull();
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
});
