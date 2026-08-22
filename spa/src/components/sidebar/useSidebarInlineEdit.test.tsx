import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSidebarInlineEdit } from './useSidebarInlineEdit';
import { useTaskStore } from '../../stores/TaskStore';
import { useUIStore } from '../../stores/UIStore';
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
