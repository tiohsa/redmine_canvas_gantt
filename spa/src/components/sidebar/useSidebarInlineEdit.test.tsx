import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSidebarInlineEdit } from './useSidebarInlineEdit';
import { useTaskStore } from '../../stores/TaskStore';
import { useUIStore } from '../../stores/UIStore';
import { useEditMetaStore } from '../../stores/EditMetaStore';
import { apiClient } from '../../api/client';
import { createServerSnapshot } from '../../stores/taskStore/stateContract';
import type { Task } from '../../types';
import type { InlineEditSettings, TaskEditMeta } from '../../types/editMeta';

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
};

const buildTask = (id: string): Task => ({
    id,
    subject: `Task ${id}`,
    projectId: '1',
    trackerId: 1,
    statusId: 1,
    ratioDone: 0,
    lockVersion: 1,
    editable: true,
    rowIndex: 0,
    hasChildren: false
});

const buildMeta = (taskId: string): TaskEditMeta => ({
    task: { id: taskId } as TaskEditMeta['task'],
    editable: { statusId: true } as TaskEditMeta['editable'],
    options: { statuses: [] } as unknown as TaskEditMeta['options'],
    customFieldValues: {}
});

describe('useSidebarInlineEdit session ownership', () => {
    beforeEach(() => {
        useUIStore.setState(useUIStore.getInitialState(), true);
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useEditMetaStore.setState(useEditMetaStore.getInitialState(), true);
        vi.restoreAllMocks();
    });

    const buildContextMeta = (task: Task): TaskEditMeta => ({
        ...buildMeta(task.id),
        capabilityContext: {
            taskId: task.id,
            projectId: Number(task.projectId),
            trackerId: task.trackerId ?? 1,
            statusId: task.statusId
        },
        task: {
            ...buildMeta(task.id).task,
            statusId: task.statusId,
            projectId: Number(task.projectId),
            trackerId: task.trackerId ?? 1
        } as TaskEditMeta['task']
    });

    const renderWithRealEditMetaStore = () => renderHook(() => useSidebarInlineEdit({
        settings: {} as InlineEditSettings,
        editMetaByTaskId: useEditMetaStore(state => state.metaByTaskId),
        fetchEditMeta: useEditMetaStore(state => state.fetchEditMeta),
        selectTask: vi.fn(),
        setActiveInlineEdit: useUIStore(state => state.setActiveInlineEdit)
    }));

    it('opens status editing across persisted New, In Progress, Done, and reverse transitions', async () => {
        const initialTask = buildTask('task-a');
        useTaskStore.setState({ allTasks: [initialTask], tasks: [initialTask] });
        useTaskStore.setState({ serverTaskSnapshot: createServerSnapshot([initialTask]) });
        vi.spyOn(apiClient, 'fetchEditMeta').mockImplementation(async (taskId) => {
            const task = useTaskStore.getState().allTasks.find(candidate => candidate.id === taskId)!;
            return buildContextMeta(task);
        });
        const { result } = renderWithRealEditMetaStore();

        for (const statusId of [1, 2, 3, 2, 1]) {
            const task = { ...useTaskStore.getState().allTasks[0], statusId };
            useTaskStore.setState({
                allTasks: [task],
                serverTaskSnapshot: createServerSnapshot([task])
            });
            await act(async () => {
                await result.current.startCellEdit(task, 'statusId');
            });
            expect(useUIStore.getState().activeInlineEdit?.taskId).toBe(task.id);
            expect(useUIStore.getState().activeInlineEdit?.field).toBe('statusId');
            useUIStore.getState().setActiveInlineEdit(null);
        }

        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(5);
    });

    it('refreshes metadata for assignee editing after a persisted status change', async () => {
        const initialTask = buildTask('task-a');
        useTaskStore.setState({ allTasks: [initialTask], tasks: [initialTask] });
        useTaskStore.setState({ serverTaskSnapshot: createServerSnapshot([initialTask]) });
        vi.spyOn(apiClient, 'fetchEditMeta').mockImplementation(async (taskId) => {
            const task = useTaskStore.getState().allTasks.find(candidate => candidate.id === taskId)!;
            return buildContextMeta(task);
        });
        const { result } = renderWithRealEditMetaStore();

        await act(async () => { await result.current.startCellEdit(initialTask, 'statusId'); });
        useUIStore.getState().setActiveInlineEdit(null);
        const updatedTask = { ...initialTask, statusId: 2 };
        useTaskStore.setState({
            allTasks: [updatedTask],
            serverTaskSnapshot: createServerSnapshot([updatedTask])
        });
        await act(async () => { await result.current.startCellEdit(updatedTask, 'assignedToId'); });

        expect(useUIStore.getState().activeInlineEdit?.field).toBe('assignedToId');
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(2);
    });

    it('uses successive effective status patches for status and assignee editing when autosave is off', async () => {
        const task = buildTask('task-a');
        useTaskStore.setState({ allTasks: [task], tasks: [task] });
        useTaskStore.setState({ serverTaskSnapshot: createServerSnapshot([task]) });
        vi.spyOn(apiClient, 'fetchEditMeta').mockImplementation(async (taskId) => {
            const effectiveTask = useTaskStore.getState().allTasks.find(candidate => candidate.id === taskId)!;
            return buildContextMeta(effectiveTask);
        });
        const { result } = renderWithRealEditMetaStore();

        await act(async () => { await result.current.startCellEdit(task, 'statusId'); });
        useUIStore.getState().setActiveInlineEdit(null);

        useTaskStore.getState().updateTask(task.id, { statusId: 2 });
        const statusTwoTask = useTaskStore.getState().allTasks[0];
        await act(async () => { await result.current.startCellEdit(statusTwoTask, 'statusId'); });
        useUIStore.getState().setActiveInlineEdit(null);

        useTaskStore.getState().updateTask(task.id, { statusId: 3 });
        const statusThreeTask = useTaskStore.getState().allTasks[0];
        await act(async () => { await result.current.startCellEdit(statusThreeTask, 'statusId'); });
        useUIStore.getState().setActiveInlineEdit(null);
        await act(async () => { await result.current.startCellEdit(statusThreeTask, 'assignedToId'); });

        expect(useTaskStore.getState().localTaskPatches[task.id]).toBeDefined();
        expect(useTaskStore.getState().serverTaskSnapshot.entitiesById[task.id]?.statusId).toBe(1);
        expect(apiClient.fetchEditMeta).toHaveBeenCalledTimes(3);
        expect(useUIStore.getState().activeInlineEdit?.field).toBe('assignedToId');
        expect(apiClient.fetchEditMeta).toHaveBeenNthCalledWith(
            2, task.id, undefined, undefined, undefined, { status_id: 2, lock_version: 1 }
        );
        expect(apiClient.fetchEditMeta).toHaveBeenNthCalledWith(
            3, task.id, undefined, undefined, undefined, { status_id: 3, lock_version: 1 }
        );
    });

    it('does not let an earlier same-cell metadata response replace a newer active session', async () => {
        const task = buildTask('task-a');
        useTaskStore.setState({ allTasks: [task], tasks: [task] });
        const firstMeta = deferred<TaskEditMeta>();
        const secondMeta = deferred<TaskEditMeta>();
        const fetchEditMeta = vi.fn()
            .mockReturnValueOnce(firstMeta.promise)
            .mockReturnValueOnce(secondMeta.promise);
        const setActiveInlineEdit = useUIStore.getState().setActiveInlineEdit;

        const { result } = renderHook(() => useSidebarInlineEdit({
            settings: {} as InlineEditSettings,
            editMetaByTaskId: {},
            fetchEditMeta,
            selectTask: vi.fn(),
            setActiveInlineEdit
        }));

        act(() => {
            void result.current.startCellEdit(task, 'statusId');
            void result.current.startCellEdit(task, 'statusId');
        });

        await act(async () => {
            secondMeta.resolve(buildMeta(task.id));
            await Promise.resolve();
        });
        await waitFor(() => expect(useUIStore.getState().activeInlineEdit?.taskId).toBe(task.id));
        const newerSessionId = useUIStore.getState().activeInlineEdit?.sessionId;
        expect(newerSessionId).toBeDefined();

        await act(async () => {
            firstMeta.resolve(buildMeta(task.id));
            await Promise.resolve();
        });

        expect(useUIStore.getState().activeInlineEdit?.sessionId).toBe(newerSessionId);
    });

    it('does not let an older captured close clear a newer active session', async () => {
        const firstTask = buildTask('task-a');
        const secondTask = buildTask('task-b');
        useTaskStore.setState({ allTasks: [firstTask, secondTask], tasks: [firstTask, secondTask] });
        const firstMeta = deferred<TaskEditMeta>();
        const secondMeta = deferred<TaskEditMeta>();
        const fetchEditMeta = vi.fn()
            .mockReturnValueOnce(firstMeta.promise)
            .mockReturnValueOnce(secondMeta.promise);
        const setActiveInlineEdit = useUIStore.getState().setActiveInlineEdit;

        const { result } = renderHook(() => useSidebarInlineEdit({
            settings: {} as InlineEditSettings,
            editMetaByTaskId: {},
            fetchEditMeta,
            selectTask: vi.fn(),
            setActiveInlineEdit
        }));

        act(() => {
            void result.current.startCellEdit(firstTask, 'statusId');
        });
        await act(async () => {
            firstMeta.resolve(buildMeta(firstTask.id));
            await Promise.resolve();
        });
        await waitFor(() => expect(useUIStore.getState().activeInlineEdit?.taskId).toBe(firstTask.id));
        const olderSessionId = useUIStore.getState().activeInlineEdit?.sessionId;

        act(() => {
            void result.current.startCellEdit(secondTask, 'statusId');
        });
        await act(async () => {
            secondMeta.resolve(buildMeta(secondTask.id));
            await Promise.resolve();
        });
        await waitFor(() => expect(useUIStore.getState().activeInlineEdit?.taskId).toBe(secondTask.id));

        const closeInlineEdit = result.current.closeInlineEdit;
        expect(olderSessionId).toBeDefined();
        closeInlineEdit(olderSessionId);

        expect(useUIStore.getState().activeInlineEdit?.taskId).toBe(secondTask.id);
    });
});
