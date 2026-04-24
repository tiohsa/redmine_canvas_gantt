import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditMetaStore } from './EditMetaStore';
import { apiClient } from '../api/client';
import type { TaskEditMeta } from '../types/editMeta';

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
        vi.clearAllMocks();
    });

    it('caches fetchEditMeta result per taskId', async () => {
        vi.mocked(apiClient.fetchEditMeta).mockResolvedValue(metaFixture);

        const first = await useEditMetaStore.getState().fetchEditMeta('1');
        const second = await useEditMetaStore.getState().fetchEditMeta('1');

        expect(first).toBe(second);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(1);
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
        expect(apiClient.fetchEditMeta).toHaveBeenLastCalledWith('1', 3);
    });

    it('stores error when fetchEditMeta fails and clearError resets it', async () => {
        vi.mocked(apiClient.fetchEditMeta).mockRejectedValue(new Error('Network down'));

        await expect(useEditMetaStore.getState().fetchEditMeta('1')).rejects.toThrow('Network down');
        expect(useEditMetaStore.getState().loadingTaskId).toBeNull();
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
