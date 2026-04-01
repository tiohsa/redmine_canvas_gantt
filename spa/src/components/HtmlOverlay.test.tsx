import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HtmlOverlay } from './HtmlOverlay';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { useBaselineStore } from '../stores/BaselineStore';
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
        useBaselineStore.getState().reset();
        useUIStore.setState({
            ...useUIStore.getState(),
            showBaseline: false
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
            expect(apiClient.createRelation).toHaveBeenCalledWith('1', '2', RelationType.Precedes, 0);
            expect(useTaskStore.getState().relations).toEqual([relation]);
            expect(useTaskStore.getState().draftRelation).toBeNull();
        });
    });


    it('creates reversed endpoints when dragging from the left dependency handle', async () => {
        const relation: Relation = { id: 'rel-1', from: '2', to: '1', type: RelationType.Relates };
        vi.mocked(apiClient.createRelation).mockResolvedValue(relation);

        act(() => {
            useUIStore.setState({ autoApplyDefaultRelation: false });
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setHoveredTask('1');
        });

        const { container } = render(<HtmlOverlay />);
        mockOverlayRect(container);

        const handles = container.querySelectorAll('.dependency-handle');
        fireEvent.mouseDown(handles[0]);

        const arrangedTask2 = useTaskStore.getState().tasks.find(t => t.id === '2');
        const bounds2 = LayoutEngine.getTaskBounds(arrangedTask2!, viewport, 'hit', 2);
        fireEvent.mouseMove(window, { clientX: bounds2.x + 1, clientY: bounds2.y + 1 });
        fireEvent.mouseUp(window);

        expect(await screen.findByTestId('relation-editor')).toBeInTheDocument();
        fireEvent.change(screen.getByTestId('relation-type-select'), { target: { value: RelationType.Relates } });
        fireEvent.click(screen.getByTestId('relation-save-button'));

        await waitFor(() => {
            expect(apiClient.createRelation).toHaveBeenCalledWith('2', '1', RelationType.Relates, undefined);
            expect(useTaskStore.getState().relations).toEqual([relation]);
        });
    });

    it('shows resize handles for a hovered editable leaf task', () => {
        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setHoveredTask('1');
        });

        render(<HtmlOverlay />);

        const startHandle = screen.getByTestId('task-resize-handle-start-1');
        expect(startHandle).toBeInTheDocument();
        expect(screen.getByTestId('task-resize-handle-end-1')).toBeInTheDocument();
        expect(startHandle.getAttribute('style')).toContain('background: rgba(26, 115, 232, 0.18)');
        expect(startHandle.getAttribute('style')).toContain('border: 1px solid rgba(26, 115, 232, 0.68)');
    });

    it('does not render scheduling warning icons in the right pane', () => {
        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.setState({
                schedulingStates: {
                    '1': {
                        state: 'conflicted',
                        message: 'This task violates a scheduling dependency.'
                    },
                    '2': {
                        state: 'invalid',
                        message: 'This task has an invalid date range.'
                    }
                }
            });
        });

        render(<HtmlOverlay />);

        expect(screen.queryByTestId('task-scheduling-state-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('task-scheduling-state-2')).not.toBeInTheDocument();
    });

    it('keeps resize handles visible for a selected task even when not hovered', () => {
        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().selectTask('1');
        });

        render(<HtmlOverlay />);

        const startHandle = screen.getByTestId('task-resize-handle-start-1');
        expect(startHandle).toBeInTheDocument();
        expect(screen.getByTestId('task-resize-handle-end-1')).toBeInTheDocument();
        expect(startHandle.getAttribute('style')).toContain('background: rgba(26, 115, 232, 0.24)');
        expect(startHandle.getAttribute('style')).toContain('border: 1px solid rgba(26, 115, 232, 0.82)');
    });

    it('shows baseline comparison details for the selected task', async () => {
        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().selectTask('1');
            useTaskStore.setState({ permissions: { editable: true, viewable: true, baselineEditable: true } });
            useUIStore.setState({ showBaseline: true });
            useBaselineStore.getState().setSnapshot({
                snapshotId: 'baseline-1',
                projectId: 'p1',
                capturedAt: '2026-04-01T00:00:00.000Z',
                capturedById: 1,
                capturedByName: 'Alice',
                scope: 'project',
                tasksByIssueId: {
                    '1': {
                        issueId: '1',
                        baselineStartDate: -DAY_MS,
                        baselineDueDate: 0
                    }
                }
            });
        });

        render(<HtmlOverlay />);

        expect(await screen.findByTestId('baseline-diff-popover')).toBeInTheDocument();
        expect(screen.getByText('Baseline comparison')).toBeInTheDocument();
        expect(screen.getByText(/Task 1/)).toBeInTheDocument();
        expect(screen.getByText('Scope: Whole project')).toBeInTheDocument();
        expect(screen.getAllByText('+1d')).toHaveLength(2);
    });

    it('hides resize handles while dragging a dependency and restores them on mouseup', () => {
        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setHoveredTask('1');
            useTaskStore.getState().selectTask('1');
        });

        const { container } = render(<HtmlOverlay />);
        mockOverlayRect(container);

        expect(screen.getByTestId('task-resize-handle-start-1')).toBeInTheDocument();
        expect(screen.getByTestId('task-resize-handle-end-1')).toBeInTheDocument();

        const handles = container.querySelectorAll('.dependency-handle');
        fireEvent.mouseDown(handles[1]);

        expect(screen.queryByTestId('task-resize-handle-start-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('task-resize-handle-end-1')).not.toBeInTheDocument();

        fireEvent.mouseUp(window);

        expect(screen.getByTestId('task-resize-handle-start-1')).toBeInTheDocument();
        expect(screen.getByTestId('task-resize-handle-end-1')).toBeInTheDocument();
    });

    it('does not show resize handles for parent, read-only, or single-date tasks', () => {
        const parentTask = { ...task1, id: 'parent', hasChildren: true };
        const readonlyTask = { ...task2, id: 'readonly', editable: false, rowIndex: 1 };
        const singleDateTask = { ...task2, id: 'single-date', rowIndex: 2, dueDate: Number.NaN };

        act(() => {
            useTaskStore.setState({
                ...useTaskStore.getState(),
                allTasks: [parentTask, readonlyTask, singleDateTask],
                tasks: [parentTask, readonlyTask, singleDateTask],
                layoutRows: [],
                rowCount: 3,
                hoveredTaskId: 'parent'
            });
        });

        const { rerender } = render(<HtmlOverlay />);
        expect(screen.queryByTestId('task-resize-handle-start-parent')).not.toBeInTheDocument();
        expect(screen.queryByTestId('task-resize-handle-end-parent')).not.toBeInTheDocument();

        act(() => {
            useTaskStore.setState({ ...useTaskStore.getState(), hoveredTaskId: 'readonly' });
        });
        rerender(<HtmlOverlay />);
        expect(screen.queryByTestId('task-resize-handle-start-readonly')).not.toBeInTheDocument();
        expect(screen.queryByTestId('task-resize-handle-end-readonly')).not.toBeInTheDocument();

        act(() => {
            useTaskStore.setState({ ...useTaskStore.getState(), hoveredTaskId: 'single-date' });
        });
        rerender(<HtmlOverlay />);
        expect(screen.queryByTestId('task-resize-handle-start-single-date')).not.toBeInTheDocument();
        expect(screen.queryByTestId('task-resize-handle-end-single-date')).not.toBeInTheDocument();
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
            expect(apiClient.createRelation).toHaveBeenCalledWith('1', '2', RelationType.Precedes, 0);
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

    it('blocks draft relation save when delay does not match current task dates', async () => {
        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setDraftRelation({
                from: '1',
                to: '2',
                type: RelationType.Precedes,
                delay: 3,
                anchor: { x: 100, y: 80 }
            });
        });

        render(<HtmlOverlay />);
        fireEvent.click(await screen.findByTestId('relation-save-button'));

        expect(await screen.findByTestId('relation-error')).toHaveTextContent('Delay does not match the current task dates.');
        expect(apiClient.createRelation).not.toHaveBeenCalled();
    });

    it('blocks follows relation update when delay does not match current task dates', async () => {
        const invalidFollowsRelation: Relation = { id: 'rel-1', from: '1', to: '2', type: RelationType.Follows, delay: 0 };

        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setRelations([invalidFollowsRelation]);
            useTaskStore.getState().selectRelation('rel-1');
        });

        render(<HtmlOverlay />);
        fireEvent.click(await screen.findByTestId('relation-save-button'));

        expect(await screen.findByTestId('relation-error')).toHaveTextContent('Delay does not match the current task dates.');
        expect(apiClient.updateRelation).not.toHaveBeenCalled();
    });

    it('allows save when dependency dates are missing', async () => {
        const relation: Relation = { id: 'rel-1', from: '1', to: '2', type: RelationType.Precedes, delay: 0 };
        vi.mocked(apiClient.createRelation).mockResolvedValue(relation);

        act(() => {
            useTaskStore.getState().setTasks([
                { ...task1, dueDate: undefined },
                task2
            ]);
            useTaskStore.getState().setDraftRelation({
                from: '1',
                to: '2',
                type: RelationType.Precedes,
                delay: 0,
                anchor: { x: 100, y: 80 }
            });
        });

        render(<HtmlOverlay />);
        fireEvent.click(await screen.findByTestId('relation-save-button'));

        await waitFor(() => {
            expect(apiClient.createRelation).toHaveBeenCalledWith('1', '2', RelationType.Precedes, 0);
        });
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
        expect(await screen.findByTestId('relation-delay-input')).toHaveValue('0');
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
            expect(useTaskStore.getState().selectedRelationId).toBeNull();
        });
    });

    it('shows an inline error when relation deletion fails', async () => {
        vi.mocked(apiClient.deleteRelation).mockRejectedValue(new Error('Delete failed'));

        act(() => {
            useTaskStore.getState().setTasks([task1, task2]);
            useTaskStore.getState().setRelations([{ id: 'rel-1', from: '1', to: '2', type: RelationType.Precedes }]);
            useTaskStore.getState().selectRelation('rel-1');
        });

        render(<HtmlOverlay />);
        fireEvent.click(await screen.findByTestId('relation-delete-button'));

        expect(await screen.findByTestId('relation-error')).toHaveTextContent('Delete failed');
        expect(screen.getByTestId('relation-editor')).toBeInTheDocument();
        expect(useTaskStore.getState().selectedRelationId).toBe('rel-1');
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
