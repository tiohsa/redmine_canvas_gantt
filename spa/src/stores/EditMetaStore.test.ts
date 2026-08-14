import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditMetaStore } from './EditMetaStore';
import { apiClient } from '../api/client';
import type { TaskEditMeta } from '../types/editMeta';
import { useTaskStore } from './TaskStore';
import type { Task } from '../types';
import { createServerSnapshot } from './taskStore/stateContract';

vi.mock('../api/client', () => ({
    apiClient: {
        fetchEditMeta: vi.fn()
    }
}));

const metaFixture: TaskEditMeta = {
    task: {
        id: '1',
        subject: 'Task',
        assignedToId: null,
        statusId: 1,
        doneRatio: 0,
        dueDate: null,
        startDate: null,
        priorityId: 1,
        categoryId: null,
        estimatedHours: null,
        projectId: 1,
        trackerId: 1,
        fixedVersionId: null,
        lockVersion: 1
    },
    editable: {
        subject: true,
        assignedToId: true,
        statusId: true,
        doneRatio: true,
        dueDate: true,
        startDate: true,
        priorityId: true,
        categoryId: true,
        estimatedHours: true,
        projectId: true,
        trackerId: true,
        fixedVersionId: true,
        customFieldValues: true
    },
    options: {
        statuses: [{ id: 1, name: 'New' }],
        assignees: [],
        priorities: [],
        categories: [],
        projects: [],
        trackers: [],
        versions: [],
        customFields: []
    },
    customFieldValues: { '10': 'A' }
};

describe('EditMetaStore', () => {
    beforeEach(() => {
        useEditMetaStore.setState(useEditMetaStore.getInitialState(), true);
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.clearAllMocks();
    });

    it('caches fetchEditMeta result per taskId', async () => {
        vi.mocked(apiClient.fetchEditMeta).mockResolvedValue(metaFixture);

        const first = await useEditMetaStore.getState().fetchEditMeta('1');
        const second = await useEditMetaStore.getState().fetchEditMeta('1');

        expect(first).toBe(second);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(1);
    });

    it('sends the current effective Task context for draft capability preview', async () => {
        const draftTask = {
            id: '1',
            subject: 'Task',
            projectId: '1',
            trackerId: 4,
            statusId: 5,
            ratioDone: 0,
            lockVersion: 7,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        } as Task;
        useTaskStore.getState().setTasks([draftTask]);
        useTaskStore.setState({ serverTaskSnapshot: createServerSnapshot([draftTask]) });
        useTaskStore.getState().updateTask('1', { projectId: '3' });
        vi.mocked(apiClient.fetchEditMeta).mockResolvedValue({
            ...metaFixture,
            capabilityContext: { taskId: '1', projectId: 3, trackerId: 4, statusId: 5 }
        });

        await useEditMetaStore.getState().fetchEditMeta('1');

        expect(apiClient.fetchEditMeta).toHaveBeenCalledWith(
            '1',
            undefined,
            undefined,
            undefined,
            { project_id: '3', lock_version: 7 }
        );
    });

    it('invalidates the current snapshot when a local tracker/status context changes', async () => {
        const draftTask = {
            id: '1', subject: 'Task', projectId: '1', trackerId: 1, statusId: 1,
            ratioDone: 0, lockVersion: 1, editable: true, rowIndex: 0, hasChildren: false
        } as Task;
        useTaskStore.getState().setTasks([draftTask]);
        useTaskStore.setState({ serverTaskSnapshot: createServerSnapshot([draftTask]) });
        const nextMeta = {
            ...metaFixture,
            capabilityContext: { taskId: '1', projectId: 1, trackerId: 2, statusId: 3 }
        };
        vi.mocked(apiClient.fetchEditMeta).mockResolvedValueOnce({
            ...metaFixture,
            capabilityContext: { taskId: '1', projectId: 1, trackerId: 1, statusId: 1 }
        }).mockResolvedValueOnce(nextMeta);

        await useEditMetaStore.getState().fetchEditMeta('1');
        useTaskStore.getState().updateTask('1', { trackerId: 2, statusId: 3 });
        await useEditMetaStore.getState().fetchEditMeta('1');

        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(2);
        expect(apiClient.fetchEditMeta).toHaveBeenLastCalledWith(
            '1', undefined, undefined, undefined,
            { tracker_id: 2, status_id: 3, lock_version: 1 }
        );
        expect(useEditMetaStore.getState().metaByTaskId['1']).toBe(nextMeta);
    });

    it('single-flights simultaneous requests for the same capability context', async () => {
        let resolveRequest!: (meta: TaskEditMeta) => void;
        vi.mocked(apiClient.fetchEditMeta).mockReturnValue(new Promise<TaskEditMeta>((resolve) => {
            resolveRequest = resolve;
        }));

        const first = useEditMetaStore.getState().fetchEditMeta('1', { force: true });
        const second = useEditMetaStore.getState().fetchEditMeta('1', { force: true });
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(1);

        resolveRequest(metaFixture);
        await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    });

    it('force refreshes metadata for destination project options', async () => {
        const refreshed = {
            ...metaFixture,
            options: { ...metaFixture.options, trackers: [{ id: 3, name: 'Destination tracker' }] }
        };
        vi.mocked(apiClient.fetchEditMeta).mockResolvedValueOnce(metaFixture).mockResolvedValueOnce(refreshed);

        await useEditMetaStore.getState().fetchEditMeta('1');
        const result = await useEditMetaStore.getState().fetchEditMeta('1', { targetProjectId: 3, force: true });

        expect(result.options.trackers).toEqual([{ id: 3, name: 'Destination tracker' }]);
        expect(useEditMetaStore.getState().metaByTaskId['1']?.options.trackers).toEqual([{ id: 3, name: 'Destination tracker' }]);
        expect(apiClient.fetchEditMeta).toHaveBeenLastCalledWith(
            '1', undefined, undefined, undefined, { project_id: 3 }
        );
    });

    it('does not reuse destination metadata after returning to the source context', async () => {
        const source = { ...metaFixture, capabilityContext: { taskId: '1', projectId: 1, trackerId: 1, statusId: 1 } };
        const destination = { ...metaFixture, capabilityContext: { taskId: '1', projectId: 3, trackerId: 3, statusId: 4 } };
        vi.mocked(apiClient.fetchEditMeta)
            .mockResolvedValueOnce(source)
            .mockResolvedValueOnce(destination)
            .mockResolvedValueOnce(source);

        await useEditMetaStore.getState().fetchEditMeta('1');
        await useEditMetaStore.getState().fetchEditMeta('1', { targetProjectId: 3, force: true });
        const restored = await useEditMetaStore.getState().fetchEditMeta('1');

        expect(restored).toBe(source);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(3);
        expect(apiClient.fetchEditMeta).toHaveBeenLastCalledWith('1', undefined, undefined, undefined, undefined);
    });

    it('does not let an older metadata response overwrite a newer context', async () => {
        let resolveOlder!: (value: TaskEditMeta) => void;
        const older = new Promise<TaskEditMeta>(resolve => { resolveOlder = resolve; });
        const newer = { ...metaFixture, task: { ...metaFixture.task, projectId: 3 } };
        vi.mocked(apiClient.fetchEditMeta)
            .mockReturnValueOnce(older)
            .mockResolvedValueOnce(newer);

        const first = useEditMetaStore.getState().fetchEditMeta('1', { force: true });
        const second = useEditMetaStore.getState().fetchEditMeta('1', { targetProjectId: 3, force: true });
        await second;
        resolveOlder(metaFixture);
        await first;

        expect(useEditMetaStore.getState().metaByTaskId['1']?.task.projectId).toBe(3);
        expect(useEditMetaStore.getState().latestReadContextByTaskId['1']?.purpose).toBe('edit_meta');
    });

    it('does not let task B make task A response stale', async () => {
        let resolveTaskA!: (value: TaskEditMeta) => void;
        let resolveTaskB!: (value: TaskEditMeta) => void;
        vi.mocked(apiClient.fetchEditMeta)
            .mockReturnValueOnce(new Promise(resolve => { resolveTaskA = resolve; }))
            .mockReturnValueOnce(new Promise(resolve => { resolveTaskB = resolve; }));

        const taskA = useEditMetaStore.getState().fetchEditMeta('1', { force: true });
        const taskB = useEditMetaStore.getState().fetchEditMeta('2', { force: true });
        resolveTaskB({ ...metaFixture, task: { ...metaFixture.task, id: '2' } });
        await taskB;
        resolveTaskA(metaFixture);
        await taskA;

        expect(useEditMetaStore.getState().metaByTaskId['1']?.task.id).toBe('1');
        expect(useEditMetaStore.getState().metaByTaskId['2']?.task.id).toBe('2');
    });

    it('stores error when fetchEditMeta fails and clearError resets it', async () => {
        vi.mocked(apiClient.fetchEditMeta).mockRejectedValue(new Error('Network down'));

        await expect(useEditMetaStore.getState().fetchEditMeta('1')).rejects.toThrow('Network down');
        expect(useEditMetaStore.getState().loadingByTaskId['1']).toBeUndefined();
        expect(useEditMetaStore.getState().error).toBe('Network down');

        useEditMetaStore.getState().clearError();
        expect(useEditMetaStore.getState().error).toBeNull();
    });

    it('setCustomFieldValue updates only existing task metadata', () => {
        useEditMetaStore.setState({
            metaByTaskId: { '1': metaFixture }
        });

        useEditMetaStore.getState().setCustomFieldValue('1', 10, 'B');
        useEditMetaStore.getState().setCustomFieldValue('missing', 10, 'C');

        expect(useEditMetaStore.getState().metaByTaskId['1']?.customFieldValues['10']).toBe('B');
        expect(useEditMetaStore.getState().metaByTaskId.missing).toBeUndefined();
    });
});
