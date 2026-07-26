import { createRef } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BulkSubtaskCreator, type BulkSubtaskCreatorHandle } from './BulkSubtaskCreator';
import { apiClient } from '../api/client';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';

vi.mock('../api/client', () => ({
    apiClient: {
        bulkCreateSubtasks: vi.fn()
    }
}));

describe('BulkSubtaskCreator', () => {
    beforeEach(() => {
        useUIStore.setState(useUIStore.getInitialState(), true);
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('creates tasks from non-empty lines and notifies success', async () => {
        const notify = vi.fn();
        const onTasksCreated = vi.fn();
        useUIStore.setState({ addNotification: notify });
        vi.mocked(apiClient.bulkCreateSubtasks).mockResolvedValue({
            status: 'ok',
            successCount: 2,
            failCount: 0,
            results: []
        });
        useTaskStore.setState({
            tasks: [
                { id: '100', subject: 'Parent', ratioDone: 0, statusId: 1, lockVersion: 0, editable: true, rowIndex: 0, hasChildren: false }
            ]
        });

        render(<BulkSubtaskCreator parentId="100" onTasksCreated={onTasksCreated} />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        const textarea = screen.getByPlaceholderText('Enter one ticket subject per line...');
        fireEvent.change(textarea, { target: { value: 'Task A\n\nTask B\n   ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() => {
            expect(apiClient.bulkCreateSubtasks).toHaveBeenCalledTimes(1);
        });

        expect(apiClient.bulkCreateSubtasks).toHaveBeenCalledWith({
            parentId: '100',
            subjects: ['Task A', 'Task B'],
            operationIssueIds: ['100']
        });
        expect(notify).toHaveBeenCalledWith('2 tasks created.', 'success');
        expect(onTasksCreated).toHaveBeenCalledTimes(1);
    });

    it('sends only operation-scope tasks and excludes context-only parents', async () => {
        vi.mocked(apiClient.bulkCreateSubtasks).mockResolvedValue({
            status: 'ok',
            successCount: 1,
            failCount: 0,
            results: []
        });
        useTaskStore.setState({
            tasks: [
                { id: '100', subject: 'Parent', ratioDone: 0, statusId: 1, lockVersion: 0, editable: true, rowIndex: 0, hasChildren: true, isContextOnly: true },
                { id: '101', subject: 'Child', ratioDone: 0, statusId: 1, lockVersion: 0, editable: true, rowIndex: 1, hasChildren: false }
            ]
        });

        render(<BulkSubtaskCreator parentId="100" />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.change(screen.getByPlaceholderText('Enter one ticket subject per line...'), {
            target: { value: 'Task A' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() => {
            expect(apiClient.bulkCreateSubtasks).toHaveBeenCalledTimes(1);
        });

        expect(apiClient.bulkCreateSubtasks).toHaveBeenCalledWith({
            parentId: '100',
            subjects: ['Task A'],
            operationIssueIds: ['101']
        });
    });

    it('exposes hasSubjects and returns success/fail counts via imperative handle', async () => {
        const notify = vi.fn();
        useUIStore.setState({ addNotification: notify });
        vi.mocked(apiClient.bulkCreateSubtasks).mockResolvedValue({
            status: 'ok',
            successCount: 1,
            failCount: 1,
            results: [{ status: 'error', subject: 'bad', errors: ['boom'] }]
        });

        const ref = createRef<BulkSubtaskCreatorHandle>();
        render(<BulkSubtaskCreator ref={ref} parentId="100" />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.change(screen.getByPlaceholderText('Enter one ticket subject per line...'), {
            target: { value: "ok\nbad" }
        });

        expect(ref.current?.hasSubjects()).toBe(true);
        let result: { success: number; fail: number } | undefined;
        await act(async () => {
            result = await ref.current!.createSubtasks();
        });

        expect(result).toEqual({ success: 1, fail: 1 });
        expect(notify).toHaveBeenCalledWith('1 tasks created.', 'success');
        expect(notify).toHaveBeenCalledWith('1 tasks failed. (boom)', 'error');
    });

    it('applies the selected tracker to every task created in text mode', async () => {
        vi.mocked(apiClient.bulkCreateSubtasks).mockResolvedValue({
            status: 'ok',
            successCount: 2,
            failCount: 0,
            results: []
        });

        render(
            <BulkSubtaskCreator
                parentId="100"
                trackerOptions={[{ id: 1, name: 'Bug' }, { id: 2, name: 'Feature' }]}
                defaultTrackerId={1}
            />
        );

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        expect(screen.getByRole('combobox', { name: 'Tracker' })).toHaveValue('1');
        fireEvent.change(screen.getByRole('combobox', { name: 'Tracker' }), {
            target: { value: '2' }
        });
        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: 'Task A\nTask B' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() => {
            expect(apiClient.bulkCreateSubtasks).toHaveBeenCalledWith({
                parentId: '100',
                subtasks: [
                    { subject: 'Task A', tracker_id: 2 },
                    { subject: 'Task B', tracker_id: 2 }
                ],
                operationIssueIds: []
            });
        });
    });

    it('supports table input with adding and removing rows', () => {
        render(<BulkSubtaskCreator parentId="100" />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));

        expect(screen.getByTestId('bulk-subtask-table')).toBeInTheDocument();
        expect(screen.getAllByRole('textbox')).toHaveLength(3);

        fireEvent.click(screen.getByRole('button', { name: '+ Add row' }));
        expect(screen.getAllByRole('textbox')).toHaveLength(4);

        fireEvent.click(screen.getByRole('button', { name: 'Delete row 4' }));
        expect(screen.getAllByRole('textbox')).toHaveLength(3);
    });

    it('copies each text line to the matching table row without trimming', () => {
        render(<BulkSubtaskCreator parentId="100" />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: ' Task A \nTask B' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));

        const tableSubjects = screen.getAllByRole('textbox');
        expect(tableSubjects[0]).toHaveValue(' Task A ');
        expect(tableSubjects[1]).toHaveValue('Task B');
        expect(tableSubjects[2]).toHaveValue('');
    });

    it('copies table subjects to text in row order', () => {
        render(<BulkSubtaskCreator parentId="100" />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));
        const tableSubjects = screen.getAllByRole('textbox');
        fireEvent.change(tableSubjects[0], {
            target: { value: 'Task A' }
        });
        fireEvent.change(tableSubjects[1], {
            target: { value: ' Task B ' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Text input' }));

        expect(screen.getByTestId('bulk-subtask-subjects')).toHaveValue('Task A\n Task B ');
    });

    it('preserves trackers by row across table to text to table switches', () => {
        render(
            <BulkSubtaskCreator
                parentId="100"
                trackerOptions={[{ id: 1, name: 'Bug' }, { id: 2, name: 'Feature' }]}
                defaultTrackerId={1}
            />
        );

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));
        fireEvent.change(screen.getAllByRole('textbox')[0], {
            target: { value: 'Task A' }
        });
        fireEvent.change(screen.getByRole('combobox', { name: 'Tracker 1' }), {
            target: { value: '2' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Text input' }));
        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: 'Renamed task' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));

        expect(screen.getAllByRole('textbox')[0]).toHaveValue('Renamed task');
        expect(screen.getByRole('combobox', { name: 'Tracker 1' })).toHaveValue('2');
    });

    it('uses the default tracker for text lines added beyond existing table rows', () => {
        render(
            <BulkSubtaskCreator
                parentId="100"
                trackerOptions={[{ id: 1, name: 'Bug' }, { id: 2, name: 'Feature' }]}
                defaultTrackerId={1}
            />
        );

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: 'One\nTwo\nThree\nFour' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));

        expect(screen.getByRole('combobox', { name: 'Tracker 4' })).toHaveValue('1');
    });

    it('keeps intermediate blank rows and omits trailing empty table rows from text', () => {
        render(<BulkSubtaskCreator parentId="100" />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));
        const tableSubjects = screen.getAllByRole('textbox');
        fireEvent.change(tableSubjects[0], {
            target: { value: 'Task A' }
        });
        fireEvent.change(tableSubjects[2], {
            target: { value: 'Task C' }
        });
        fireEvent.click(screen.getByRole('button', { name: '+ Add row' }));
        fireEvent.click(screen.getByRole('button', { name: 'Text input' }));

        expect(screen.getByTestId('bulk-subtask-subjects')).toHaveValue('Task A\n\nTask C');
    });

    it('shows at least three table rows when the text input is empty', () => {
        render(<BulkSubtaskCreator parentId="100" />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));

        expect(screen.getAllByRole('textbox')).toHaveLength(3);
    });
});
