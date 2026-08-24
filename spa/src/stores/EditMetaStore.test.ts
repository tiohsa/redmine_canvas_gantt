import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditMetaStore } from './EditMetaStore';
import { apiClient } from '../api/client';
import type { TaskEditMeta } from '../types/editMeta';
import { useTaskStore } from './TaskStore';
import type { Task } from '../types';
import { createServerSnapshot } from './taskStore/stateContract';
import { configureBusinessCalendar, getBusinessCalendarPayload } from '../utils/businessCalendar';

vi.mock('../api/client', () => ({
    apiClient: {
        fetchEditMeta: vi.fn(),
        fetchData: vi.fn()
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

const calendarConflict = () => Object.assign(new Error('Business calendar changed'), {
    status: 'conflict',
    failure: {
        kind: 'conflict',
        resourceRole: 'scope',
        resourceType: 'business_calendar',
        remoteAvailability: 'needs_refresh'
    }
});

describe('EditMetaStore', () => {
    beforeEach(() => {
        useEditMetaStore.setState(useEditMetaStore.getInitialState(), true);
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        vi.resetAllMocks();
        configureBusinessCalendar(null);
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

    it('sends an explicit Tracker target through the Draft Preview contract', async () => {
        const persistedTask = {
            id: '1',
            subject: 'Task',
            projectId: '1',
            trackerId: 1,
            statusId: 1,
            ratioDone: 0,
            lockVersion: 1,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        } as Task;
        useTaskStore.setState({ serverTaskSnapshot: createServerSnapshot([persistedTask]) });
        vi.mocked(apiClient.fetchEditMeta).mockResolvedValue({
            ...metaFixture,
            capabilityContext: { taskId: '1', projectId: 1, trackerId: 2, statusId: 3 },
            draftContract: {
                baseRevision: 1,
                materialized: { tracker_id: 2, status_id: 3 },
                normalizations: [{ field: 'status_id', from: 1, to: 3, source: 'redmine' }],
                violations: []
            }
        });

        await useEditMetaStore.getState().fetchEditMeta('1', { targetTrackerId: 2, force: true });

        expect(apiClient.fetchEditMeta).toHaveBeenCalledWith(
            '1', undefined, undefined, undefined,
            { tracker_id: 2, lock_version: 1 }
        );
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

    it('rejects an older metadata response so its caller cannot continue a mutation', async () => {
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
        await expect(first).rejects.toMatchObject({ name: 'StaleEditMetaResponseError' });

        expect(useEditMetaStore.getState().metaByTaskId['1']?.task.projectId).toBe(3);
        expect(useEditMetaStore.getState().latestReadContextByTaskId['1']?.purpose).toBe('edit_meta');

        vi.mocked(apiClient.fetchEditMeta).mockResolvedValueOnce(metaFixture);
        await expect(useEditMetaStore.getState().fetchEditMeta('1', { force: true })).resolves.toBe(metaFixture);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(3);
    });

    it('rejects a stale Tracker Preview without replacing the newest capability context', async () => {
        let resolveOlder!: (value: TaskEditMeta) => void;
        const older = new Promise<TaskEditMeta>(resolve => { resolveOlder = resolve; });
        const newer = {
            ...metaFixture,
            capabilityContext: { taskId: '1', projectId: 1, trackerId: 3, statusId: 4 }
        };
        vi.mocked(apiClient.fetchEditMeta)
            .mockReturnValueOnce(older)
            .mockResolvedValueOnce(newer);

        const first = useEditMetaStore.getState().fetchEditMeta('1', { targetTrackerId: 2, force: true });
        const second = useEditMetaStore.getState().fetchEditMeta('1', { targetTrackerId: 3, force: true });
        await second;
        resolveOlder({ ...metaFixture, capabilityContext: { taskId: '1', projectId: 1, trackerId: 2, statusId: 3 } });

        await expect(first).rejects.toMatchObject({ name: 'StaleEditMetaResponseError' });
        expect(useEditMetaStore.getState().metaByTaskId['1']).toBe(newer);
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

    it('refreshes authoritative data and retries a calendar-conflicted preview once while preserving local intent', async () => {
        const persistedTask = {
            id: '1',
            subject: 'Task',
            projectId: '1',
            trackerId: 1,
            statusId: 1,
            ratioDone: 0,
            lockVersion: 1,
            editable: true,
            rowIndex: 0,
            hasChildren: false
        } as Task;
        useTaskStore.setState({
            allTasks: [persistedTask],
            serverTaskSnapshot: createServerSnapshot([persistedTask])
        });
        useTaskStore.getState().updateTask('1', { dueDate: Date.UTC(2027, 0, 5) });
        const patchesBefore = useTaskStore.getState().localTaskPatches['1'];
        const generationBefore = useTaskStore.getState().editGenerations['1'];

        vi.mocked(apiClient.fetchEditMeta)
            .mockRejectedValueOnce(calendarConflict())
            .mockResolvedValueOnce(metaFixture);
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [{ ...persistedTask, lockVersion: 2 }],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [], trackers: [] },
            project: { id: '1', name: 'Demo' },
            statuses: [],
            customFields: [],
            permissions: { editable: true, viewable: true, baselineEditable: false },
            businessCalendar: {
                status: 'ok',
                revision: 'calendar-revision-2',
                defaultCalendarId: null,
                projectCalendarIds: {},
                calendars: {},
                warnings: []
            }
        });

        await expect(useEditMetaStore.getState().fetchEditMeta('1', { force: true })).resolves.toBe(metaFixture);

        expect(apiClient.fetchData).toHaveBeenCalledTimes(1);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(2);
        expect(apiClient.fetchEditMeta).toHaveBeenLastCalledWith(
            '1', undefined, undefined, undefined,
            { due_date: '2027-01-05', lock_version: 2 }
        );
        expect(useTaskStore.getState().localTaskPatches['1']).toEqual(patchesBefore);
        expect(useTaskStore.getState().editGenerations['1']).toBe(generationBefore);
        expect(useTaskStore.getState().modifiedTaskIds.has('1')).toBe(true);
        expect(getBusinessCalendarPayload().revision).toBe('calendar-revision-2');
        expect(useEditMetaStore.getState().errorByTaskId['1']).toBeUndefined();
    });

    it('stops after one calendar conflict retry and exposes the second failure', async () => {
        const conflict = calendarConflict();
        configureBusinessCalendar({
            status: 'ok', revision: 'calendar-revision-1', defaultCalendarId: null,
            projectCalendarIds: {}, calendars: {}, warnings: []
        });
        vi.mocked(apiClient.fetchEditMeta).mockRejectedValue(conflict);
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [], trackers: [] },
            project: { id: '1', name: 'Demo' },
            statuses: [],
            customFields: [],
            permissions: { editable: true, viewable: true, baselineEditable: false },
            businessCalendar: {
                status: 'ok', revision: 'calendar-revision-2', defaultCalendarId: null,
                projectCalendarIds: {}, calendars: {}, warnings: []
            }
        });

        await expect(useEditMetaStore.getState().fetchEditMeta('1', { force: true })).rejects.toBe(conflict);

        expect(apiClient.fetchData).toHaveBeenCalledTimes(1);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(2);
        expect(useEditMetaStore.getState().errorByTaskId['1']).toBe('Business calendar changed');

        vi.mocked(apiClient.fetchEditMeta).mockResolvedValueOnce(metaFixture);
        await expect(useEditMetaStore.getState().fetchEditMeta('1', { force: true })).resolves.toBe(metaFixture);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(3);
    });

    it('does not retry after refresh failure', async () => {
        vi.mocked(apiClient.fetchEditMeta).mockRejectedValue(calendarConflict());
        vi.mocked(apiClient.fetchData).mockRejectedValue(new Error('Refresh failed'));

        await expect(useEditMetaStore.getState().fetchEditMeta('1', { force: true })).rejects.toThrow('Refresh failed');

        expect(apiClient.fetchData).toHaveBeenCalledTimes(1);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(1);
        expect(useEditMetaStore.getState().errorByTaskId['1']).toBe('Refresh failed');
    });

    it('does not retry when an applied refresh keeps the failed calendar revision', async () => {
        configureBusinessCalendar({
            status: 'ok', revision: 'calendar-revision-1', defaultCalendarId: null,
            projectCalendarIds: {}, calendars: {}, warnings: []
        });
        const conflict = calendarConflict();
        vi.mocked(apiClient.fetchEditMeta).mockRejectedValue(conflict);
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [], relations: [], versions: [],
            filterOptions: { projects: [], assignees: [], trackers: [] },
            project: { id: '1', name: 'Demo' }, statuses: [], customFields: [],
            permissions: { editable: true, viewable: true, baselineEditable: false },
            businessCalendar: {
                status: 'ok', revision: 'calendar-revision-1', defaultCalendarId: null,
                projectCalendarIds: {}, calendars: {}, warnings: []
            }
        });

        await expect(useEditMetaStore.getState().fetchEditMeta('1', { force: true })).rejects.toBe(conflict);
        expect(apiClient.fetchData).toHaveBeenCalledTimes(1);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(1);
    });

    it('does not retry when an applied refresh produces an empty calendar revision', async () => {
        configureBusinessCalendar({
            status: 'ok', revision: 'calendar-revision-1', defaultCalendarId: null,
            projectCalendarIds: {}, calendars: {}, warnings: []
        });
        const conflict = calendarConflict();
        vi.mocked(apiClient.fetchEditMeta).mockRejectedValue(conflict);
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [], relations: [], versions: [],
            filterOptions: { projects: [], assignees: [], trackers: [] },
            project: { id: '1', name: 'Demo' }, statuses: [], customFields: [],
            permissions: { editable: true, viewable: true, baselineEditable: false },
            businessCalendar: {
                status: 'ok', revision: '', defaultCalendarId: null,
                projectCalendarIds: {}, calendars: {}, warnings: []
            }
        });

        await expect(useEditMetaStore.getState().fetchEditMeta('1', { force: true })).rejects.toBe(conflict);
        expect(apiClient.fetchData).toHaveBeenCalledTimes(1);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(1);
    });

    it('retries when the applied calendar advances beyond the revision reported by the conflict', async () => {
        configureBusinessCalendar({
            status: 'ok', revision: 'calendar-revision-1', defaultCalendarId: null,
            projectCalendarIds: {}, calendars: {}, warnings: []
        });
        vi.mocked(apiClient.fetchEditMeta)
            .mockRejectedValueOnce(calendarConflict())
            .mockResolvedValueOnce(metaFixture);
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [], relations: [], versions: [],
            filterOptions: { projects: [], assignees: [], trackers: [] },
            project: { id: '1', name: 'Demo' }, statuses: [], customFields: [],
            permissions: { editable: true, viewable: true, baselineEditable: false },
            businessCalendar: {
                status: 'ok', revision: 'calendar-revision-3', defaultCalendarId: null,
                projectCalendarIds: {}, calendars: {}, warnings: []
            }
        });

        await expect(useEditMetaStore.getState().fetchEditMeta('1', { force: true })).resolves.toBe(metaFixture);
        expect(apiClient.fetchData).toHaveBeenCalledTimes(1);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(2);
    });

    it('invalidates cached metadata when the business calendar revision changes', async () => {
        configureBusinessCalendar({
            status: 'ok',
            revision: 'calendar-revision-1',
            defaultCalendarId: null,
            projectCalendarIds: {},
            calendars: {},
            warnings: []
        });
        const refreshed = { ...metaFixture, task: { ...metaFixture.task, lockVersion: 2 } };
        vi.mocked(apiClient.fetchEditMeta).mockResolvedValueOnce(metaFixture).mockResolvedValueOnce(refreshed);

        await useEditMetaStore.getState().fetchEditMeta('1');
        configureBusinessCalendar({
            status: 'ok',
            revision: 'calendar-revision-2',
            defaultCalendarId: null,
            projectCalendarIds: {},
            calendars: {},
            warnings: []
        });

        await expect(useEditMetaStore.getState().fetchEditMeta('1')).resolves.toBe(refreshed);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(2);
    });

    it('does not retry a calendar conflict after a newer edit-meta generation supersedes it during refresh', async () => {
        let resolveRefresh!: (value: Awaited<ReturnType<typeof apiClient.fetchData>>) => void;
        const refreshedData = new Promise<Awaited<ReturnType<typeof apiClient.fetchData>>>(resolve => {
            resolveRefresh = resolve;
        });
        const newer = {
            ...metaFixture,
            capabilityContext: { taskId: '1', projectId: 1, trackerId: 3, statusId: 4 }
        };
        vi.mocked(apiClient.fetchEditMeta)
            .mockRejectedValueOnce(calendarConflict())
            .mockResolvedValueOnce(newer);
        vi.mocked(apiClient.fetchData).mockReturnValue(refreshedData);

        const olderRequest = useEditMetaStore.getState().fetchEditMeta('1', { targetTrackerId: 2, force: true });
        await vi.waitFor(() => expect(apiClient.fetchData).toHaveBeenCalledTimes(1));
        const newerRequest = useEditMetaStore.getState().fetchEditMeta('1', { targetTrackerId: 3, force: true });
        await expect(newerRequest).resolves.toBe(newer);
        resolveRefresh({
            tasks: [],
            relations: [],
            versions: [],
            filterOptions: { projects: [], assignees: [], trackers: [] },
            project: { id: '1', name: 'Demo' },
            statuses: [],
            customFields: [],
            permissions: { editable: true, viewable: true, baselineEditable: false },
            businessCalendar: {
                status: 'ok',
                revision: 'calendar-revision-2',
                defaultCalendarId: null,
                projectCalendarIds: {},
                calendars: {},
                warnings: []
            }
        });

        await expect(olderRequest).rejects.toMatchObject({ name: 'StaleEditMetaResponseError' });
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(2);
        expect(useEditMetaStore.getState().metaByTaskId['1']).toBe(newer);
    });

    it('does not retry when its authoritative TaskStore refresh is superseded', async () => {
        configureBusinessCalendar({
            status: 'ok',
            revision: 'calendar-revision-1',
            defaultCalendarId: null,
            projectCalendarIds: {},
            calendars: {},
            warnings: []
        });
        let rejectInitial!: (reason: unknown) => void;
        const initialRequest = new Promise<TaskEditMeta>((_resolve, reject) => {
            rejectInitial = reject;
        });
        let resolveRecoveryRefresh!: (value: Awaited<ReturnType<typeof apiClient.fetchData>>) => void;
        const recoveryRefresh = new Promise<Awaited<ReturnType<typeof apiClient.fetchData>>>(resolve => {
            resolveRecoveryRefresh = resolve;
        });
        let resolveNewerRefresh!: (value: Awaited<ReturnType<typeof apiClient.fetchData>>) => void;
        const newerRefresh = new Promise<Awaited<ReturnType<typeof apiClient.fetchData>>>(resolve => {
            resolveNewerRefresh = resolve;
        });
        vi.mocked(apiClient.fetchEditMeta).mockReturnValue(initialRequest);
        vi.mocked(apiClient.fetchData)
            .mockReturnValueOnce(recoveryRefresh)
            .mockReturnValueOnce(newerRefresh);

        const editMetaRequest = useEditMetaStore.getState().fetchEditMeta('1', { force: true });
        rejectInitial(calendarConflict());
        await vi.waitFor(() => expect(apiClient.fetchData).toHaveBeenCalledTimes(1));
        const laterRefresh = useTaskStore.getState().refreshData();
        resolveRecoveryRefresh({
            tasks: [], relations: [], versions: [],
            filterOptions: { projects: [], assignees: [], trackers: [] },
            project: { id: '1', name: 'Demo' }, statuses: [], customFields: [],
            permissions: { editable: true, viewable: true, baselineEditable: false },
            businessCalendar: {
                status: 'ok', revision: 'calendar-revision-2', defaultCalendarId: null,
                projectCalendarIds: {}, calendars: {}, warnings: []
            }
        });

        await expect(editMetaRequest).rejects.toThrow('Business calendar changed');
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(1);
        expect(getBusinessCalendarPayload().revision).toBe('calendar-revision-1');

        resolveNewerRefresh({
            tasks: [], relations: [], versions: [],
            filterOptions: { projects: [], assignees: [], trackers: [] },
            project: { id: '1', name: 'Demo' }, statuses: [], customFields: [],
            permissions: { editable: true, viewable: true, baselineEditable: false },
            businessCalendar: {
                status: 'ok', revision: 'calendar-revision-3', defaultCalendarId: null,
                projectCalendarIds: {}, calendars: {}, warnings: []
            }
        });
        await laterRefresh;
    });

    it('single-flights a caller that joins the refreshed effective context during retry', async () => {
        const persistedTask = {
            id: '1', subject: 'Task', projectId: '1', trackerId: 1, statusId: 1,
            ratioDone: 0, lockVersion: 1, editable: true, rowIndex: 0, hasChildren: false
        } as Task;
        configureBusinessCalendar({
            status: 'ok', revision: 'calendar-revision-1', defaultCalendarId: null,
            projectCalendarIds: {}, calendars: {}, warnings: []
        });
        useTaskStore.setState({
            allTasks: [persistedTask],
            serverTaskSnapshot: createServerSnapshot([persistedTask])
        });
        useTaskStore.getState().updateTask('1', { dueDate: Date.UTC(2027, 0, 5) });
        let resolveRetry!: (value: TaskEditMeta) => void;
        const retry = new Promise<TaskEditMeta>(resolve => {
            resolveRetry = resolve;
        });
        vi.mocked(apiClient.fetchEditMeta)
            .mockRejectedValueOnce(calendarConflict())
            .mockReturnValue(retry);
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [{ ...persistedTask, lockVersion: 2 }], relations: [], versions: [],
            filterOptions: { projects: [], assignees: [], trackers: [] },
            project: { id: '1', name: 'Demo' }, statuses: [], customFields: [],
            permissions: { editable: true, viewable: true, baselineEditable: false },
            businessCalendar: {
                status: 'ok', revision: 'calendar-revision-2', defaultCalendarId: null,
                projectCalendarIds: {}, calendars: {}, warnings: []
            }
        });

        const recovering = useEditMetaStore.getState().fetchEditMeta('1', { force: true });
        await vi.waitFor(() => expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(2));
        const joining = useEditMetaStore.getState().fetchEditMeta('1', { force: true });
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(2);

        resolveRetry(metaFixture);
        await expect(Promise.all([recovering, joining])).resolves.toEqual([metaFixture, metaFixture]);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(2);

        vi.mocked(apiClient.fetchEditMeta).mockResolvedValueOnce(metaFixture);
        await expect(useEditMetaStore.getState().fetchEditMeta('1', { force: true })).resolves.toBe(metaFixture);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(3);
    });

    it('releases both context keys when a recovering operation becomes stale during retry', async () => {
        const persistedTask = {
            id: '1', subject: 'Task', projectId: '1', trackerId: 1, statusId: 1,
            ratioDone: 0, lockVersion: 1, editable: true, rowIndex: 0, hasChildren: false
        } as Task;
        configureBusinessCalendar({
            status: 'ok', revision: 'calendar-revision-1', defaultCalendarId: null,
            projectCalendarIds: {}, calendars: {}, warnings: []
        });
        useTaskStore.setState({
            allTasks: [persistedTask],
            serverTaskSnapshot: createServerSnapshot([persistedTask])
        });
        useTaskStore.getState().updateTask('1', { dueDate: Date.UTC(2027, 0, 5) });
        let resolveRetry!: (value: TaskEditMeta) => void;
        const retry = new Promise<TaskEditMeta>(resolve => {
            resolveRetry = resolve;
        });
        const newer = {
            ...metaFixture,
            capabilityContext: { taskId: '1', projectId: 1, trackerId: 2, statusId: 1 }
        };
        vi.mocked(apiClient.fetchEditMeta)
            .mockRejectedValueOnce(calendarConflict())
            .mockReturnValueOnce(retry)
            .mockResolvedValueOnce(newer);
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [{ ...persistedTask, lockVersion: 2 }], relations: [], versions: [],
            filterOptions: { projects: [], assignees: [], trackers: [] },
            project: { id: '1', name: 'Demo' }, statuses: [], customFields: [],
            permissions: { editable: true, viewable: true, baselineEditable: false },
            businessCalendar: {
                status: 'ok', revision: 'calendar-revision-2', defaultCalendarId: null,
                projectCalendarIds: {}, calendars: {}, warnings: []
            }
        });

        const recovering = useEditMetaStore.getState().fetchEditMeta('1', { force: true });
        await vi.waitFor(() => expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(2));
        await expect(useEditMetaStore.getState().fetchEditMeta('1', {
            targetTrackerId: 2,
            force: true
        })).resolves.toBe(newer);
        resolveRetry(metaFixture);
        await expect(recovering).rejects.toMatchObject({ name: 'StaleEditMetaResponseError' });

        vi.mocked(apiClient.fetchEditMeta).mockResolvedValueOnce(metaFixture);
        await expect(useEditMetaStore.getState().fetchEditMeta('1', { force: true })).resolves.toBe(metaFixture);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(4);
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
