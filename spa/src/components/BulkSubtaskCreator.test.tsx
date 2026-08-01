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
            completeness: 'partial',
            invalidatedEntityIds: ['100', '101', '102'],
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
        }, expect.stringMatching(/^mutation:/));
        expect(notify).toHaveBeenCalledWith('2 tasks created.', 'success');
        expect(onTasksCreated).toHaveBeenCalledWith(expect.objectContaining({
            completeness: 'partial',
            invalidatedEntityIds: ['100', '101', '102']
        }));
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
        }, expect.stringMatching(/^mutation:/));
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
            }, expect.stringMatching(/^mutation:/));
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

    it('preserves row trackers when creating from text mode', async () => {
        vi.mocked(apiClient.bulkCreateSubtasks).mockResolvedValue({ status: 'ok', successCount: 2, failCount: 0, results: [] });
        render(<BulkSubtaskCreator parentId="100" trackerOptions={[{ id: 1, name: 'Bug' }, { id: 2, name: 'Feature' }]} defaultTrackerId={1} />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));
        fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Task A' } });
        fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Task B' } });
        fireEvent.change(screen.getByRole('combobox', { name: 'Tracker 2' }), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Text input' }));
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() => expect(apiClient.bulkCreateSubtasks).toHaveBeenCalledWith(
            {
                parentId: '100',
                subtasks: [{ subject: 'Task A', tracker_id: 1 }, { subject: 'Task B', tracker_id: 2 }],
                operationIssueIds: []
            },
            expect.stringMatching(/^mutation:/)
        ));
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

    it('keeps a trailing newline while the user adds the next text row', () => {
        render(<BulkSubtaskCreator parentId="100" />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: 'Task A\n' }
        });

        expect(screen.getByTestId('bulk-subtask-subjects')).toHaveValue('Task A\n');
    });

    it('does not move row trackers when text rows are deleted or inserted', () => {
        render(
            <BulkSubtaskCreator
                parentId="100"
                trackerOptions={[{ id: 1, name: 'Bug' }, { id: 2, name: 'Feature' }]}
                defaultTrackerId={1}
            />
        );

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: 'Task A\nTask B\nTask C' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));
        fireEvent.change(screen.getByRole('combobox', { name: 'Tracker 2' }), {
            target: { value: '2' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Text input' }));

        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: 'Task B\nTask C' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));
        expect(screen.getByRole('combobox', { name: 'Tracker 1' })).toHaveValue('2');
        expect(screen.getByRole('combobox', { name: 'Tracker 2' })).toHaveValue('1');

        fireEvent.click(screen.getByRole('button', { name: 'Text input' }));
        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: 'New task\nTask B\nTask C' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));
        expect(screen.getByRole('combobox', { name: 'Tracker 1' })).toHaveValue('1');
        expect(screen.getByRole('combobox', { name: 'Tracker 2' })).toHaveValue('2');
        expect(screen.getByRole('combobox', { name: 'Tracker 3' })).toHaveValue('1');
    });

    it('preserves tracker identity through middle edits and blank-line insertion', () => {
        render(
            <BulkSubtaskCreator
                parentId="100"
                trackerOptions={[{ id: 1, name: 'Bug' }, { id: 2, name: 'Feature' }]}
                defaultTrackerId={1}
            />
        );

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: 'Task A\nTask B\nTask C' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));
        fireEvent.change(screen.getByRole('combobox', { name: 'Tracker 2' }), {
            target: { value: '2' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Text input' }));

        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: 'Task A\nRenamed B\nTask C' }
        });
        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: 'Task A\n\nRenamed B\nTask C' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));
        expect(screen.getByRole('combobox', { name: 'Tracker 1' })).toHaveValue('1');
        expect(screen.getByRole('combobox', { name: 'Tracker 2' })).toHaveValue('1');
        expect(screen.getByRole('combobox', { name: 'Tracker 3' })).toHaveValue('2');
        expect(screen.getByRole('combobox', { name: 'Tracker 4' })).toHaveValue('1');

        fireEvent.click(screen.getByRole('button', { name: 'Text input' }));
        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: 'Task A\nRenamed B\nTask C' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));
        expect(screen.getByRole('combobox', { name: 'Tracker 2' })).toHaveValue('2');
    });

    it('shows at least three table rows when the text input is empty', () => {
        render(<BulkSubtaskCreator parentId="100" />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.click(screen.getByRole('button', { name: 'Table input' }));

        expect(screen.getAllByRole('textbox')).toHaveLength(3);
    });
});
