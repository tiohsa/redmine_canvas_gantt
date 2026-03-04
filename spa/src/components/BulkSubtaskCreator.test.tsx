import { createRef } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BulkSubtaskCreator, type BulkSubtaskCreatorHandle } from './BulkSubtaskCreator';
import { apiClient } from '../api/client';
import { useUIStore } from '../stores/UIStore';

vi.mock('../api/client', () => ({
    apiClient: {
        bulkCreateSubtasks: vi.fn()
    }
}));

describe('BulkSubtaskCreator', () => {
    beforeEach(() => {
        useUIStore.setState(useUIStore.getInitialState(), true);
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

        render(<BulkSubtaskCreator parentId="100" onTasksCreated={onTasksCreated} />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        const textarea = screen.getByPlaceholderText('Enter one ticket subject per line...');
        fireEvent.change(textarea, { target: { value: 'Task A\n\nTask B\n   ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() => {
            expect(apiClient.bulkCreateSubtasks).toHaveBeenCalledTimes(1);
        });

        expect(apiClient.bulkCreateSubtasks).toHaveBeenCalledWith({ parentId: '100', subjects: ['Task A', 'Task B'] });
        expect(notify).toHaveBeenCalledWith('2 tasks created.', 'success');
        expect(onTasksCreated).toHaveBeenCalledTimes(1);
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
});
