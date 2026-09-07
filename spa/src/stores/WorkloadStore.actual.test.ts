import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useTaskStore } from './TaskStore';
import { useWorkloadStore } from './WorkloadStore';
import { WorkloadLogicService, type ActualWorkloadEntry } from '../services/WorkloadLogicService';

const day = Date.UTC(2026, 8, 7);
const entries: ActualWorkloadEntry[] = [{ id: 'e', issueId: '1', userId: 2, userName: 'John', spentOn: '2026-09-07', hours: 3 }];
const deferred = () => {
    let resolve!: (value: ActualWorkloadEntry[]) => void;
    const promise = new Promise<ActualWorkloadEntry[]>(done => { resolve = done; });
    return { promise, resolve };
};

describe('actual workload lifecycle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useWorkloadStore.getState().setWorkloadPaneVisible(false);
        useWorkloadStore.setState(useWorkloadStore.getInitialState(), true);
        useTaskStore.setState({ ...useTaskStore.getInitialState(), allTasks: [{
            id: '1', subject: 'Issue', statusId: 1, ratioDone: 0, lockVersion: 0, editable: true,
            rowIndex: 0, hasChildren: false, assignedToId: 1, assignedToName: 'Dave',
            estimatedHours: 8, startDate: day, dueDate: day
        }] }, true);
        useWorkloadStore.getState().setRange({ from: day, to: day });
    });
    afterEach(() => {
        useWorkloadStore.getState().setWorkloadPaneVisible(false);
        vi.restoreAllMocks();
        vi.useRealTimers();
    });
    it('loads on open, distinguishes loading/ready, and retains planned when actual fails', async () => {
        const fetch = vi.spyOn(apiClient, 'fetchActualWorkload').mockResolvedValue(entries);
        useWorkloadStore.getState().setWorkloadPaneVisible(true);
        expect(useWorkloadStore.getState().actualStatus).toBe('loading');
        await vi.advanceTimersByTimeAsync(150);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(useWorkloadStore.getState().actualStatus).toBe('ready');
        expect(useWorkloadStore.getState().workloadData?.assignees.get(2)?.actualTotal).toBe(3);
        fetch.mockRejectedValue(new Error('offline'));
        useWorkloadStore.getState().refreshActual();
        await vi.advanceTimersByTimeAsync(150);
        expect(useWorkloadStore.getState().actualStatus).toBe('error');
        expect(useWorkloadStore.getState().actualEntries).toEqual(entries);
        expect(useWorkloadStore.getState().workloadData?.assignees.get(1)?.plannedTotal).toBe(8);
    });
    it('ignores an old response even while a new range request is still debounced', async () => {
        const old = deferred();
        vi.spyOn(apiClient, 'fetchActualWorkload').mockReturnValueOnce(old.promise).mockResolvedValue([]);
        useWorkloadStore.getState().setWorkloadPaneVisible(true);
        await vi.advanceTimersByTimeAsync(150);
        useWorkloadStore.getState().setRange({ from: day + 86400000, to: day + 86400000 });
        old.resolve(entries);
        await Promise.resolve();
        expect(useWorkloadStore.getState().actualStatus).toBe('loading');
        expect(useWorkloadStore.getState().actualEntries).toEqual([]);
        await vi.advanceTimersByTimeAsync(150);
        expect(useWorkloadStore.getState().actualEntries).toEqual([]);
    });
    it('does not fetch while closed and ignores in-flight completion after closing', async () => {
        const pending = deferred();
        const fetch = vi.spyOn(apiClient, 'fetchActualWorkload').mockReturnValue(pending.promise);
        useWorkloadStore.getState().refreshActual();
        await vi.advanceTimersByTimeAsync(200);
        expect(fetch).not.toHaveBeenCalled();
        useWorkloadStore.getState().setWorkloadPaneVisible(true);
        await vi.advanceTimersByTimeAsync(150);
        useWorkloadStore.getState().setWorkloadPaneVisible(false);
        pending.resolve(entries);
        await Promise.resolve();
        expect(useWorkloadStore.getState().actualEntries).toEqual([]);
    });
    it('coalesces query/project changes and refreshes after authoritative reload', async () => {
        const fetch = vi.spyOn(apiClient, 'fetchActualWorkload').mockResolvedValue(entries);
        useWorkloadStore.getState().setWorkloadPaneVisible(true);
        await vi.advanceTimersByTimeAsync(150);
        useTaskStore.setState({ currentProjectId: '2' });
        useTaskStore.setState({ selectedProjectIds: ['2'], projectSelectionExplicit: true });
        useTaskStore.setState({ selectedStatusIds: [1] });
        await vi.advanceTimersByTimeAsync(150);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.lastCall?.[0].query.canvasProjectIds).toEqual(['2']);
        useTaskStore.setState({ serverTaskSnapshot: { ...useTaskStore.getState().serverTaskSnapshot } });
        await vi.advanceTimersByTimeAsync(150);
        expect(fetch).toHaveBeenCalledTimes(3);
    });
    it('coalesces range calculations and fetches while preserving the final issue-wide allocation', async () => {
        const task = useTaskStore.getState().allTasks[0];
        useTaskStore.setState({ allTasks: [{ ...task, estimatedHours: 40, dueDate: day + 4 * 86400000 }] });
        const fetch = vi.spyOn(apiClient, 'fetchActualWorkload').mockResolvedValue([]);
        useWorkloadStore.getState().setWorkloadPaneVisible(true);
        await vi.advanceTimersByTimeAsync(150);
        const calculate = vi.spyOn(WorkloadLogicService, 'calculateWorkload');
        fetch.mockClear();
        for (let i = 0; i < 100; i++) {
            const date = day + (i % 5) * 86400000;
            useWorkloadStore.getState().setRange({ from: date, to: date });
        }
        await vi.advanceTimersByTimeAsync(150);
        expect(calculate.mock.calls.length).toBeGreaterThan(0);
        expect(calculate.mock.calls.length).toBeLessThan(10);
        expect(calculate.mock.lastCall?.[4]).toEqual({ from: day + 4 * 86400000, to: day + 4 * 86400000 });
        expect(useWorkloadStore.getState().workloadData?.assignees.get(1)?.plannedTotal).toBe(8);
        expect([...useWorkloadStore.getState().workloadData!.assignees.get(1)!.dailyWorkloads.keys()]).toEqual(['2026-09-11']);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.lastCall?.[0]).toMatchObject({ from: '2026-09-11', to: '2026-09-11' });
    });
    it('updates capacity immediately during a pending range calculation without refetching', async () => {
        const fetch = vi.spyOn(apiClient, 'fetchActualWorkload').mockResolvedValue([]);
        useWorkloadStore.getState().setWorkloadPaneVisible(true);
        await vi.advanceTimersByTimeAsync(150);
        useWorkloadStore.getState().setRange({ from: day, to: day + 86400000 });
        useWorkloadStore.getState().setCapacityThreshold(4);
        expect(useWorkloadStore.getState().workloadData?.assignees.get(1)?.dailyWorkloads.get('2026-09-07')?.isPlannedOverload).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(150);
        expect(fetch).toHaveBeenCalledTimes(2);
        useWorkloadStore.getState().setCapacityThreshold(8);
        await vi.advanceTimersByTimeAsync(150);
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('cancels pending range calculation on close', async () => {
        vi.spyOn(apiClient, 'fetchActualWorkload').mockResolvedValue([]);
        useWorkloadStore.getState().setWorkloadPaneVisible(true);
        await vi.advanceTimersByTimeAsync(150);
        useWorkloadStore.getState().setRange({ from: day + 86400000, to: day + 86400000 });
        const calculate = vi.spyOn(WorkloadLogicService, 'calculateWorkload');
        useWorkloadStore.getState().setWorkloadPaneVisible(false);
        await vi.advanceTimersByTimeAsync(200);
        expect(calculate).not.toHaveBeenCalled();
    });
    it.each(['project', 'query'] as const)('ignores an old response after %s changes', async (scope) => {
        const old = deferred();
        vi.spyOn(apiClient, 'fetchActualWorkload').mockReturnValueOnce(old.promise).mockResolvedValue([]);
        useWorkloadStore.getState().setWorkloadPaneVisible(true);
        await vi.advanceTimersByTimeAsync(150);
        if (scope === 'project') useTaskStore.setState({ currentProjectId: '2' });
        else useTaskStore.setState({ selectedStatusIds: [1] });
        old.resolve(entries);
        await Promise.resolve();
        expect(useWorkloadStore.getState().actualEntries).toEqual([]);
        expect(useWorkloadStore.getState().actualStatus).toBe('loading');
        await vi.advanceTimersByTimeAsync(150);
        expect(useWorkloadStore.getState().actualStatus).toBe('ready');
        expect(useWorkloadStore.getState().actualEntries).toEqual([]);
    });
    it('cycles actual issues once each independently from planned selection', async () => {
        useTaskStore.setState({ allTasks: [...useTaskStore.getState().allTasks, { ...useTaskStore.getState().allTasks[0], id: '2', estimatedHours: 4 }] });
        vi.spyOn(apiClient, 'fetchActualWorkload').mockResolvedValue([...entries, { ...entries[0], id: 'e2' }, { ...entries[0], id: 'e3', issueId: '2' }]);
        useWorkloadStore.getState().setWorkloadPaneVisible(true);
        await vi.advanceTimersByTimeAsync(150);
        const store = useWorkloadStore.getState();
        expect(store.resolveNextHistogramTask(2, '2026-09-07', 'actual').taskId).toBe('1');
        expect(store.resolveNextHistogramTask(2, '2026-09-07', 'actual').taskId).toBe('2');
        expect(store.resolveNextHistogramTask(2, '2026-09-07', 'actual').taskId).toBe('1');
        expect(store.resolveNextHistogramTask(1, '2026-09-07').taskId).toBe('1');
    });
});
