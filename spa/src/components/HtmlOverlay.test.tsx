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
        updateTask: vi.fn(),
        createRelation: vi.fn(),
        deleteRelation: vi.fn()
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
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key',
            settings: { default_relation_type: 'precedes', auto_calculate_delay: '1', dependency_edit_mode: '1' }
        };
        useUIStore.setState({ issueDialogUrl: null, dependencyEditMode: true });
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
            customFields: [],
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

        const createButton = await screen.findByTestId('relation-dialog-create');
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(apiClient.createRelation).toHaveBeenCalledWith('1', '2', RelationType.Precedes, undefined);
            expect(apiClient.fetchData).toHaveBeenCalled();
            expect(useTaskStore.getState().relations).toEqual([relation]);
        });
    });

    it('does not render dependency handles when dependency edit mode is off', () => {
        useUIStore.setState({ dependencyEditMode: false });
        act(() => {
            useTaskStore.getState().setTasks([task1]);
            useTaskStore.getState().setHoveredTask('1');
        });

        const { container } = render(<HtmlOverlay />);
        expect(container.querySelectorAll('.dependency-handle').length).toBe(0);
    });

    it('removes a relation from the context menu', async () => {
        vi.mocked(apiClient.deleteRelation).mockResolvedValue(undefined);
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [task1, task2],
            relations: [],
            versions: [],
            customFields: [],
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
});
