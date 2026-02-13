import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HtmlOverlay } from './HtmlOverlay';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { LayoutEngine } from '../engines/LayoutEngine';
import type { Relation, Task, Viewport } from '../types';
import { RelationType } from '../types/constraints';

vi.mock('../api/client', () => ({
    apiClient: {
        fetchData: vi.fn(),
        fetchEditMeta: vi.fn(),
        updateTask: vi.fn(),
        updateTaskFields: vi.fn(),
        createRelation: vi.fn(),
        deleteRelation: vi.fn(),
        deleteTask: vi.fn()
    }
}));

import { apiClient } from '../api/client';

describe('HtmlOverlay', () => {
    const viewport: Viewport = {
        startDate: 0,
        scrollX: 0,
        scrollY: 0,
        scale: 1,
        width: 800,
        height: 600,
        rowHeight: 32
    };

    const task1: Task = {
        id: '1',
        subject: 'Task 1',
        projectId: 'p1',
        projectName: 'Project',
        displayOrder: 1,
        startDate: 0,
        dueDate: 10,
        ratioDone: 0,
        statusId: 1,
        lockVersion: 0,
        editable: true,
        rowIndex: 0,
        hasChildren: false
    };

    const task2: Task = {
        id: '2',
        subject: 'Task 2',
        projectId: 'p1',
        projectName: 'Project',
        displayOrder: 2,
        startDate: 0,
        dueDate: 10,
        ratioDone: 0,
        statusId: 1,
        lockVersion: 0,
        editable: true,
        rowIndex: 0,
        hasChildren: false
    };

    beforeEach(() => {
        vi.mocked(apiClient.createRelation).mockReset();
        vi.mocked(apiClient.fetchData).mockReset();
        vi.mocked(apiClient.fetchEditMeta).mockReset();
        vi.mocked(apiClient.updateTaskFields).mockReset();
        useUIStore.setState({ issueDialogUrl: null });
        useTaskStore.setState({
            tasks: [],
            relations: [],
            viewport,
            layoutRows: [],
            rowCount: 0,
            zoomLevel: 2,
            groupByProject: false,
            viewportFromStorage: false,
            selectedTaskId: null,
            hoveredTaskId: null,
            contextMenu: null
        });
    });

    it('creates a relation by dragging a dependency handle onto another task', async () => {
        const relation: Relation = { id: 'rel-1', from: '1', to: '2', type: RelationType.Precedes };
        vi.mocked(apiClient.createRelation).mockResolvedValue(relation);
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [task1, task2],
            relations: [relation],
            versions: [],
            project: { id: 'p1', name: 'Project' },
            statuses: [],
            permissions: { editable: true, viewable: true }
        });

        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setHoveredTask('1');
        });

        const { container } = render(<HtmlOverlay />);

        const overlay = container.firstElementChild as HTMLDivElement;
        expect(overlay).toBeTruthy();
        vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            toJSON: () => ({})
        } as DOMRect);

        const handles = container.querySelectorAll('.dependency-handle');
        expect(handles.length).toBe(2);

        fireEvent.mouseDown(handles[1]);

        const arrangedTask2 = useTaskStore.getState().tasks.find(t => t.id === '2');
        expect(arrangedTask2).toBeTruthy();

        const bounds2 = LayoutEngine.getTaskBounds(arrangedTask2!, viewport, 'hit', 2);
        fireEvent.mouseMove(window, { clientX: bounds2.x + 1, clientY: bounds2.y + 1 });
        fireEvent.mouseUp(window);

        await waitFor(() => {
            expect(apiClient.createRelation).toHaveBeenCalledWith('1', '2', RelationType.Precedes);
            expect(apiClient.fetchData).toHaveBeenCalled();
            expect(useTaskStore.getState().relations).toEqual([relation]);
        });
    });

    it('removes a relation from the context menu', async () => {
        vi.mocked(apiClient.deleteRelation).mockResolvedValue(undefined);
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [task1, task2],
            relations: [],
            versions: [],
            statuses: [],
            project: { id: 'p1', name: 'Project' },
            permissions: { editable: true, viewable: true }
        });

        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setRelations([{ id: 'rel-1', from: '1', to: '2', type: RelationType.Precedes }]);
            useTaskStore.getState().setHoveredTask('1');
            useTaskStore.getState().setContextMenu({ x: 10, y: 10, taskId: '1' });
        });

        render(<HtmlOverlay />);
        const removeItem = screen.getByTestId('remove-relation-rel-1');
        expect(removeItem).toBeTruthy();

        fireEvent.click(removeItem!);

        await waitFor(() => {
            expect(apiClient.deleteRelation).toHaveBeenCalledWith('rel-1');
            expect(apiClient.fetchData).toHaveBeenCalled();
            expect(useTaskStore.getState().relations).toEqual([]);
        });
    });

    it('opens child issue dialog with parent params from context menu', () => {
        act(() => {
            useTaskStore.getState().setTasks([task1]);
            useTaskStore.getState().setContextMenu({ x: 10, y: 10, taskId: '1' });
        });

        render(<HtmlOverlay />);
        const addChildItem = screen.getByTestId('context-menu-add-child-task');
        expect(addChildItem).toBeTruthy();

        fireEvent.click(addChildItem!);

        const openedUrl = useUIStore.getState().issueDialogUrl;
        expect(openedUrl).toContain('/projects/p1/issues/new?');
        expect(openedUrl).toContain('issue%5Bparent_issue_id%5D=1');
        expect(openedUrl).toContain('parent_issue_id=1');
    });

    it('unsets parent from context menu', async () => {
        const childTask: Task = { ...task1, id: '10', parentId: '1' };
        act(() => {
            useTaskStore.getState().setTasks([childTask]);
            useTaskStore.getState().setContextMenu({ x: 10, y: 10, taskId: '10' });
        });

        render(<HtmlOverlay />);
        const unsetParentItem = screen.getByTestId('context-menu-unset-parent');
        expect(unsetParentItem).toBeTruthy();

        fireEvent.click(unsetParentItem!);

        await waitFor(() => {
            expect(useTaskStore.getState().allTasks.find((t) => t.id === '10')?.parentId).toBeUndefined();
            expect(useTaskStore.getState().contextMenu).toBeNull();
        });
    });

    it('does not show unset-parent item for root task', () => {
        const rootTask: Task = { ...task1, id: '20', parentId: undefined };
        act(() => {
            useTaskStore.getState().setTasks([rootTask]);
            useTaskStore.getState().setContextMenu({ x: 10, y: 10, taskId: '20' });
        });

        render(<HtmlOverlay />);
        const unsetParentItem = screen.queryByTestId('context-menu-unset-parent');
        expect(unsetParentItem).toBeNull();
    });

    it('opens category submenu and applies selected category', async () => {
        vi.mocked(apiClient.fetchEditMeta).mockResolvedValue({
            task: { id: '1', subject: 'Task 1', assignedToId: null, statusId: 1, doneRatio: 0, dueDate: null, startDate: null, priorityId: 1, categoryId: null, estimatedHours: null, projectId: 1, trackerId: 1, fixedVersionId: null, lockVersion: 0 },
            editable: { subject: true, assignedToId: true, statusId: true, doneRatio: true, dueDate: true, startDate: true, priorityId: true, categoryId: true, estimatedHours: true, projectId: true, trackerId: true, fixedVersionId: true, customFieldValues: false },
            options: { statuses: [], assignees: [], priorities: [], categories: [{ id: 10, name: 'Cat-A' }], projects: [], trackers: [], versions: [], customFields: [] },
            customFieldValues: {}
        });
        vi.mocked(apiClient.updateTaskFields).mockResolvedValue({ status: 'ok', lockVersion: 2, taskId: '1' });

        act(() => {
            useTaskStore.getState().setTasks([task1]);
            useTaskStore.getState().setContextMenu({ x: 10, y: 10, taskId: '1' });
        });

        render(<HtmlOverlay />);
        fireEvent.click(screen.getByTestId('context-menu-category'));

        const option = await screen.findByTestId('context-menu-category-option-10');
        fireEvent.click(option);

        await waitFor(() => {
            expect(apiClient.updateTaskFields).toHaveBeenCalled();
            expect(useTaskStore.getState().allTasks.find((t) => t.id === '1')?.categoryId).toBe(10);
            expect(useTaskStore.getState().contextMenu).toBeNull();
        });
    });

    it('shows disabled state when category update is not editable', async () => {
        vi.mocked(apiClient.fetchEditMeta).mockResolvedValue({
            task: { id: '1', subject: 'Task 1', assignedToId: null, statusId: 1, doneRatio: 0, dueDate: null, startDate: null, priorityId: 1, categoryId: null, estimatedHours: null, projectId: 1, trackerId: 1, fixedVersionId: null, lockVersion: 0 },
            editable: { subject: true, assignedToId: true, statusId: true, doneRatio: true, dueDate: true, startDate: true, priorityId: true, categoryId: false, estimatedHours: true, projectId: true, trackerId: true, fixedVersionId: true, customFieldValues: false },
            options: { statuses: [], assignees: [], priorities: [], categories: [{ id: 10, name: 'Cat-A' }], projects: [], trackers: [], versions: [], customFields: [] },
            customFieldValues: {}
        });

        act(() => {
            useTaskStore.getState().setTasks([task1]);
            useTaskStore.getState().setContextMenu({ x: 10, y: 10, taskId: '1' });
        });

        render(<HtmlOverlay />);
        fireEvent.click(screen.getByTestId('context-menu-category'));

        expect(await screen.findByTestId('context-menu-category-disabled')).toBeTruthy();
        expect(apiClient.updateTaskFields).not.toHaveBeenCalled();
    });
});
