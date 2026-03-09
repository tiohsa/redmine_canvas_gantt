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
        updateRelation: vi.fn(),
        deleteRelation: vi.fn(),
        deleteTask: vi.fn()
    }
}));

import { apiClient } from '../api/client';

describe('HtmlOverlay', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const viewport: Viewport = {
        startDate: 0,
        scrollX: 0,
        scrollY: 0,
        scale: 1 / DAY_MS,
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
        dueDate: DAY_MS,
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
        startDate: DAY_MS * 4,
        dueDate: DAY_MS * 5,
        ratioDone: 0,
        statusId: 1,
        lockVersion: 0,
        editable: true,
        rowIndex: 1,
        hasChildren: false
    };

    beforeEach(() => {
        vi.mocked(apiClient.createRelation).mockReset();
        vi.mocked(apiClient.updateRelation).mockReset();
        vi.mocked(apiClient.deleteRelation).mockReset();
        vi.mocked(apiClient.deleteTask).mockReset();
        vi.stubGlobal('confirm', vi.fn(() => true));

        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/projects/1/canvas_gantt',
            redmineBase: '',
            authToken: 'token',
            apiKey: 'key',
            settings: { }
        };

        useUIStore.setState({
            ...useUIStore.getState(),
            issueDialogUrl: null
        });

        useTaskStore.setState({
            ...useTaskStore.getState(),
            tasks: [],
            relations: [],
            viewport,
            layoutRows: [],
            rowCount: 0,
            zoomLevel: 2,
            groupByProject: false,
            viewportFromStorage: false,
            selectedTaskId: null,
            selectedRelationId: null,
            draftRelation: null,
            hoveredTaskId: null,
            contextMenu: null
        });
    });

    const mockOverlayRect = (container: HTMLElement) => {
        const overlay = container.firstElementChild as HTMLDivElement;
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
    };

    it('opens a draft relation popover after dragging a dependency handle when auto apply is off', async () => {
        const relation: Relation = { id: 'rel-1', from: '1', to: '2', type: RelationType.Precedes, delay: 0 };
        vi.mocked(apiClient.createRelation).mockResolvedValue(relation);

        act(() => {
            useUIStore.setState({ autoApplyDefaultRelation: false });
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setHoveredTask('1');
        });

        const { container } = render(<HtmlOverlay />);
        mockOverlayRect(container);

        const handles = container.querySelectorAll('.dependency-handle');
        fireEvent.mouseDown(handles[1]);

        const arrangedTask2 = useTaskStore.getState().tasks.find(t => t.id === '2');
        const bounds2 = LayoutEngine.getTaskBounds(arrangedTask2!, viewport, 'hit', 2);
        fireEvent.mouseMove(window, { clientX: bounds2.x + 1, clientY: bounds2.y + 1 });
        fireEvent.mouseUp(window);

        expect(await screen.findByTestId('relation-editor')).toBeInTheDocument();
        expect(screen.getByTestId('relation-type-select')).toHaveValue(RelationType.Precedes);

        fireEvent.click(screen.getByTestId('relation-save-button'));

        await waitFor(() => {
            expect(apiClient.createRelation).toHaveBeenCalledWith('1', '2', RelationType.Precedes, 2);
            expect(useTaskStore.getState().relations).toEqual([relation]);
            expect(useTaskStore.getState().draftRelation).toBeNull();
        });
    });



    it('creates relation immediately after dragging when auto apply is on', async () => {
        const relation: Relation = { id: 'rel-1', from: '1', to: '2', type: RelationType.Precedes, delay: 2 };
        vi.mocked(apiClient.createRelation).mockResolvedValue(relation);

        act(() => {
            useUIStore.setState({
                autoApplyDefaultRelation: true,
                defaultRelationType: RelationType.Precedes,
                autoCalculateDelay: true
            });
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setHoveredTask('1');
        });

        const { container } = render(<HtmlOverlay />);
        mockOverlayRect(container);

        const handles = container.querySelectorAll('.dependency-handle');
        fireEvent.mouseDown(handles[1]);

        const arrangedTask2 = useTaskStore.getState().tasks.find(t => t.id === '2');
        const bounds2 = LayoutEngine.getTaskBounds(arrangedTask2!, viewport, 'hit', 2);
        fireEvent.mouseMove(window, { clientX: bounds2.x + 1, clientY: bounds2.y + 1 });
        fireEvent.mouseUp(window);

        await waitFor(() => {
            expect(apiClient.createRelation).toHaveBeenCalledWith('1', '2', RelationType.Precedes, 2);
            expect(useTaskStore.getState().relations).toEqual([relation]);
        });
        expect(screen.queryByTestId('relation-editor')).not.toBeInTheDocument();
    });
    it('updates an existing relation from the popover', async () => {
        const existingRelation: Relation = { id: 'rel-1', from: '1', to: '2', type: RelationType.Follows, delay: 2 };
        const updatedRelation: Relation = { id: 'rel-1', from: '1', to: '2', type: RelationType.Blocked };
        vi.mocked(apiClient.updateRelation).mockResolvedValue(updatedRelation);

        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setRelations([existingRelation]);
            useTaskStore.getState().selectRelation('rel-1');
        });

        render(<HtmlOverlay />);

        expect(await screen.findByTestId('relation-type-select')).toHaveValue(RelationType.Precedes);
        fireEvent.change(screen.getByTestId('relation-type-select'), { target: { value: RelationType.Blocks } });
        fireEvent.click(screen.getByTestId('relation-save-button'));

        await waitFor(() => {
            expect(apiClient.updateRelation).toHaveBeenCalledWith('rel-1', RelationType.Blocked, undefined);
            expect(useTaskStore.getState().relations).toEqual([updatedRelation]);
            expect(useTaskStore.getState().selectedRelationId).toBeNull();
        });
    });

    it('shows validation error when delay is blank for precedes', async () => {
        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setDraftRelation({
                from: '1',
                to: '2',
                type: RelationType.Precedes,
                anchor: { x: 100, y: 80 }
            });
        });

        render(<HtmlOverlay />);
        const delayInput = await screen.findByTestId('relation-delay-input');
        fireEvent.change(delayInput, { target: { value: '' } });
        fireEvent.click(screen.getByTestId('relation-save-button'));

        expect(await screen.findByTestId('relation-error')).toHaveTextContent('Delay is required for this relation type');
        expect(apiClient.createRelation).not.toHaveBeenCalled();
    });

    it('recalculates and clears delay as relation type changes in the draft editor', async () => {
        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setDraftRelation({
                from: '1',
                to: '2',
                type: RelationType.Precedes,
                delay: 2,
                autoDelayMessage: 'Auto delay',
                anchor: { x: 100, y: 80 }
            });
        });

        render(<HtmlOverlay />);

        const relationTypeSelect = await screen.findByTestId('relation-type-select');
        expect(screen.getByTestId('relation-delay-input')).toHaveValue('2');

        fireEvent.change(relationTypeSelect, { target: { value: RelationType.Relates } });
        expect(screen.queryByTestId('relation-delay-input')).not.toBeInTheDocument();

        fireEvent.change(relationTypeSelect, { target: { value: RelationType.Precedes } });
        expect(await screen.findByTestId('relation-delay-input')).toHaveValue('2');
    });

    it('deletes a relation from the popover after confirmation', async () => {
        vi.mocked(apiClient.deleteRelation).mockResolvedValue(undefined);

        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setRelations([{ id: 'rel-1', from: '1', to: '2', type: RelationType.Precedes }]);
            useTaskStore.getState().selectRelation('rel-1');
        });

        render(<HtmlOverlay />);
        fireEvent.click(await screen.findByTestId('relation-delete-button'));

        await waitFor(() => {
            expect(apiClient.deleteRelation).toHaveBeenCalledWith('rel-1');
            expect(useTaskStore.getState().relations).toEqual([]);
        });
    });

    it('keeps relation selection when clicking inside the gantt viewport', async () => {
        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setRelations([{ id: 'rel-1', from: '1', to: '2', type: RelationType.Precedes }]);
            useTaskStore.getState().selectRelation('rel-1');
        });

        const { container } = render(<HtmlOverlay />);
        expect(await screen.findByTestId('relation-editor')).toBeInTheDocument();

        fireEvent.mouseDown(container);

        expect(useTaskStore.getState().selectedRelationId).toBe('rel-1');
    });

    it('keeps relation selection when clicking inside the relation popover and clears it on outside click', async () => {
        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setRelations([{ id: 'rel-1', from: '1', to: '2', type: RelationType.Precedes }]);
            useTaskStore.getState().selectRelation('rel-1');
        });

        render(<HtmlOverlay />);
        const relationEditor = await screen.findByTestId('relation-editor');

        fireEvent.mouseDown(relationEditor);
        expect(useTaskStore.getState().selectedRelationId).toBe('rel-1');

        fireEvent.mouseDown(document.body);
        await waitFor(() => {
            expect(useTaskStore.getState().selectedRelationId).toBeNull();
        });
    });

    it('clears relation selection on Escape', async () => {
        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setRelations([{ id: 'rel-1', from: '1', to: '2', type: RelationType.Precedes }]);
            useTaskStore.getState().selectRelation('rel-1');
        });

        render(<HtmlOverlay />);
        expect(await screen.findByTestId('relation-editor')).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });

        await waitFor(() => {
            expect(useTaskStore.getState().selectedRelationId).toBeNull();
        });
    });

});
