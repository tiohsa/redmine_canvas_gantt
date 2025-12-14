import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { LayoutEngine } from './LayoutEngine';
import type { Task } from '../types';
import { snapToUtcDay } from '../utils/time';

type DragMode = 'none' | 'pan' | 'task-move' | 'task-resize-start' | 'task-resize-end' | 'dependency-create';

interface DragState {
    mode: DragMode;
    startX: number;
    startY: number;
    taskId: string | null;
    originalStartDate: number;
    originalDueDate: number;
    // For dependency creation
    depStartTaskId: string | null;
    currentX?: number;
    currentY?: number;
}

export class InteractionEngine {
    private container: HTMLElement;
    private drag: DragState = {
        mode: 'none',
        startX: 0,
        startY: 0,
        taskId: null,
        originalStartDate: 0,
        originalDueDate: 0,
        depStartTaskId: null
    };

    constructor(container: HTMLElement) {
        this.container = container;
        this.attachEvents();
    }

    private attachEvents() {
        this.container.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);
        this.container.addEventListener('wheel', this.handleWheel, { passive: false });
        this.container.addEventListener('contextmenu', this.handleContextMenu);
        window.addEventListener('keydown', this.handleKeyDown);
    }

    public detach() {
        this.container.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
        this.container.removeEventListener('wheel', this.handleWheel);
        this.container.removeEventListener('contextmenu', this.handleContextMenu);
        window.removeEventListener('keydown', this.handleKeyDown);
    }

    private hitTest(x: number, y: number): { task: Task | null; region: 'body' | 'start' | 'end' | 'dep-handle-start' | 'dep-handle-end' } {
        const { tasks, viewport, hoveredTaskId } = useTaskStore.getState();
        const RESIZE_HANDLE_WIDTH = 8;
        const DEP_HANDLE_RADIUS = 8; // generous hit area

        for (const t of tasks) {
            // Optimization: Skip off-screen tasks (rough)
            // const yPos = t.rowIndex * viewport.rowHeight - viewport.scrollY;
            // if (yPos < -50 || yPos > viewport.height + 50) continue;

            const bounds = LayoutEngine.getTaskBounds(t, viewport, 'hit');

            // Check Dependency Handles first (only if task is hovered or active)
            // Or just check geometry.
            if (t.editable) { // Only editable tasks have handles
                const cy = bounds.y + bounds.height / 2;
                // Start handle
                if (Math.abs(y - cy) <= DEP_HANDLE_RADIUS && Math.abs(x - (bounds.x - 2)) <= DEP_HANDLE_RADIUS) {
                    return { task: t, region: 'dep-handle-start' };
                }
                // End handle
                if (Math.abs(y - cy) <= DEP_HANDLE_RADIUS && Math.abs(x - (bounds.x + bounds.width + 2)) <= DEP_HANDLE_RADIUS) {
                    return { task: t, region: 'dep-handle-end' };
                }
            }

            if (x >= bounds.x && x <= bounds.x + bounds.width &&
                y >= bounds.y && y <= bounds.y + bounds.height) {
                // Determine which part was clicked
                if (x <= bounds.x + RESIZE_HANDLE_WIDTH) {
                    return { task: t, region: 'start' };
                } else if (x >= bounds.x + bounds.width - RESIZE_HANDLE_WIDTH) {
                    return { task: t, region: 'end' };
                }
                return { task: t, region: 'body' };
            }
        }
        return { task: null, region: 'body' };
    }

    private snapToDate(timestamp: number): number {
        return snapToUtcDay(timestamp);
    }

    private handleMouseDown = (e: MouseEvent) => {
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const hit = this.hitTest(x, y);

        if (hit.task && hit.task.editable) {
            // Check if parent task
            if (hit.task.hasChildren && hit.region === 'body') { // Allow selecting but maybe warn on move
                useTaskStore.getState().selectTask(hit.task.id);
                 // If body click on parent, maybe prevent move
                if (hit.region === 'body') {
                    // Standard Redmine doesn't usually allow moving parent bars directly (computed)
                     useUIStore.getState().addNotification('Cannot move parent task. Move child tasks instead.', 'warning');
                     return;
                }
            }

            useTaskStore.getState().selectTask(hit.task.id);

            if (hit.region === 'dep-handle-start' || hit.region === 'dep-handle-end') {
                // Start creating dependency
                this.drag = {
                    mode: 'dependency-create',
                    startX: x,
                    startY: y,
                    taskId: null,
                    originalStartDate: 0,
                    originalDueDate: 0,
                    depStartTaskId: hit.task.id,
                    currentX: x,
                    currentY: y
                };
                // We use setHoveredTask(null) to maybe clear UI or something? No.
            } else if (hit.region === 'body') {
                this.drag = {
                    mode: 'task-move',
                    startX: e.clientX,
                    startY: e.clientY,
                    taskId: hit.task.id,
                    originalStartDate: hit.task.startDate,
                    originalDueDate: hit.task.dueDate,
                    depStartTaskId: null
                };
            } else if (hit.region === 'start') {
                this.drag = {
                    mode: 'task-resize-start',
                    startX: e.clientX,
                    startY: e.clientY,
                    taskId: hit.task.id,
                    originalStartDate: hit.task.startDate,
                    originalDueDate: hit.task.dueDate,
                    depStartTaskId: null
                };
            } else if (hit.region === 'end') {
                this.drag = {
                    mode: 'task-resize-end',
                    startX: e.clientX,
                    startY: e.clientY,
                    taskId: hit.task.id,
                    originalStartDate: hit.task.startDate,
                    originalDueDate: hit.task.dueDate,
                    depStartTaskId: null
                };
            }
        } else if (hit.task) {
            // Not editable, just select
            useTaskStore.getState().selectTask(hit.task.id);
        } else {
            // No task hit - start panning
            useTaskStore.getState().selectTask(null);
            this.drag = {
                mode: 'pan',
                startX: e.clientX,
                startY: e.clientY,
                taskId: null,
                originalStartDate: 0,
                originalDueDate: 0,
                depStartTaskId: null
            };
        }
    };

    private handleMouseMove = (e: MouseEvent) => {
        const { viewport, updateViewport, updateTask, setHoveredTask } = useTaskStore.getState();

        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Update hovered task if not dragging something else
        if (this.drag.mode === 'none' || this.drag.mode === 'dependency-create') {
            const hit = this.hitTest(x, y);
            setHoveredTask(hit.task ? hit.task.id : null);

            // Cursor
            if (hit.task && hit.task.editable) {
                 if (hit.region.startsWith('dep-handle')) {
                     this.container.style.cursor = 'crosshair';
                 } else if (hit.region === 'start' || hit.region === 'end') {
                    this.container.style.cursor = 'ew-resize';
                } else {
                    this.container.style.cursor = 'grab';
                }
            } else if (this.drag.mode === 'dependency-create') {
                this.container.style.cursor = 'crosshair';
            } else {
                this.container.style.cursor = 'default';
            }
        }

        if (this.drag.mode === 'none') return;

        if (this.drag.mode === 'dependency-create') {
            this.drag.currentX = x;
            this.drag.currentY = y;
            useTaskStore.getState().setTempDependency({
                startX: this.drag.startX,
                startY: this.drag.startY,
                currentX: x,
                currentY: y
            });
        }

        const dx = e.clientX - this.drag.startX;
        const dy = e.clientY - this.drag.startY;

        if (this.drag.mode === 'pan') {
            updateViewport({
                scrollX: Math.max(0, viewport.scrollX - dx),
                scrollY: Math.max(0, viewport.scrollY - dy)
            });
            this.drag.startX = e.clientX;
            this.drag.startY = e.clientY;
        } else if (this.drag.mode === 'task-move' && this.drag.taskId) {
            const timeDelta = dx / viewport.scale;
            const newStart = this.snapToDate(this.drag.originalStartDate + timeDelta);
            const duration = this.drag.originalDueDate - this.drag.originalStartDate;

            const currentTask = useTaskStore.getState().tasks.find(t => t.id === this.drag.taskId);
            if (currentTask && currentTask.startDate !== newStart) {
                updateTask(this.drag.taskId, {
                    startDate: newStart,
                    dueDate: newStart + duration
                });
            }
        } else if (this.drag.mode === 'task-resize-start' && this.drag.taskId) {
            const timeDelta = dx / viewport.scale;
            const newStart = this.snapToDate(this.drag.originalStartDate + timeDelta);
            const currentTask = useTaskStore.getState().tasks.find(t => t.id === this.drag.taskId);
            if (currentTask && newStart < this.drag.originalDueDate && currentTask.startDate !== newStart) {
                updateTask(this.drag.taskId, { startDate: newStart });
            }
        } else if (this.drag.mode === 'task-resize-end' && this.drag.taskId) {
            const timeDelta = dx / viewport.scale;
            const newEnd = this.snapToDate(this.drag.originalDueDate + timeDelta);
            const currentTask = useTaskStore.getState().tasks.find(t => t.id === this.drag.taskId);
            if (currentTask && newEnd > this.drag.originalStartDate && currentTask.dueDate !== newEnd) {
                updateTask(this.drag.taskId, { dueDate: newEnd });
            }
        }
    };

    private handleMouseUp = async (e: MouseEvent) => {
        const draggedTaskId = this.drag.taskId;
        const mode = this.drag.mode;

        // Clear drag state
        const oldStart = this.drag.originalStartDate;
        const oldDue = this.drag.originalDueDate;
        const depStart = this.drag.depStartTaskId;

        // Clear visual line
        if (mode === 'dependency-create') {
            useTaskStore.getState().setTempDependency(null);
        }

        this.drag = { mode: 'none', startX: 0, startY: 0, taskId: null, originalStartDate: 0, originalDueDate: 0, depStartTaskId: null };
        this.container.style.cursor = 'default';

        if (mode === 'dependency-create' && depStart) {
            // Check hit on drop
            const rect = this.container.getBoundingClientRect();
            const hit = this.hitTest(e.clientX - rect.left, e.clientY - rect.top);

            if (hit.task && hit.task.id !== depStart) {
                // Create dependency: depStart -> hit.task
                // Requirement: check for cycles? API will handle it.
                try {
                    const { apiClient } = await import('../api/client');
                    const res = await apiClient.createRelation(depStart, hit.task.id, 'precedes');
                    if (res.status === 'ok' && res.relation) {
                         const { relations, setRelations } = useTaskStore.getState();
                         setRelations([...relations, res.relation]);
                         useUIStore.getState().addNotification('Dependency created', 'success');
                    } else {
                        useUIStore.getState().addNotification('Failed to create dependency: ' + res.error, 'error');
                    }
                } catch (err) {
                    useUIStore.getState().addNotification('Error creating dependency', 'error');
                }
            }
            return;
        }

        if ((mode === 'task-move' || mode === 'task-resize-start' || mode === 'task-resize-end') && draggedTaskId) {
            // Persist the change to backend
            const { tasks, updateTask } = useTaskStore.getState();
            const task = tasks.find(t => t.id === draggedTaskId);
            if (!task) return;

            try {
                const { apiClient } = await import('../api/client');
                const result = await apiClient.updateTask(task);

                if (result.status === 'ok' && result.lockVersion !== undefined) {
                    updateTask(draggedTaskId, { lockVersion: result.lockVersion });
                } else {
                    const errorMsg = result.status === 'conflict'
                        ? (result.error || 'Conflict detected. Please reload.')
                        : ('Failed to save: ' + (result.error || 'Unknown error'));

                    useUIStore.getState().addNotification(errorMsg, 'warning');

                    updateTask(draggedTaskId, {
                        startDate: oldStart,
                        dueDate: oldDue
                    });
                }
            } catch (err) {
                console.error('API error:', err);
                useUIStore.getState().addNotification('Failed to save task changes.', 'error');
                updateTask(draggedTaskId, {
                    startDate: oldStart,
                    dueDate: oldDue
                });
            }
        }
    };

    private handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        const { hoveredTaskId, setContextMenu } = useTaskStore.getState();
        if (hoveredTaskId) {
            setContextMenu({ x: e.clientX, y: e.clientY, taskId: hoveredTaskId });
        }
    };

    private handleWheel = (e: WheelEvent) => {
        const { viewport, updateViewport } = useTaskStore.getState();
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(0.00000001, Math.min(0.001, viewport.scale * zoomFactor));
            updateViewport({ scale: newScale });
        } else {
            updateViewport({
                scrollX: Math.max(0, viewport.scrollX + e.deltaX),
                scrollY: Math.max(0, viewport.scrollY + e.deltaY)
            });
        }
    };

    private handleKeyDown = (e: KeyboardEvent) => {
        const { tasks, selectedTaskId, selectTask, viewport, updateViewport } = useTaskStore.getState();

        if (e.key === 'Escape') {
            selectTask(null);
            return;
        }

        if (!selectedTaskId) {
            if (e.key === 'ArrowDown' && tasks.length > 0) {
                selectTask(tasks[0].id);
            }
            return;
        }

        const currentIndex = tasks.findIndex(t => t.id === selectedTaskId);
        if (currentIndex === -1) return;

        switch (e.key) {
            case 'ArrowDown':
                if (currentIndex < tasks.length - 1) {
                    selectTask(tasks[currentIndex + 1].id);
                }
                break;
            case 'ArrowUp':
                if (currentIndex > 0) {
                    selectTask(tasks[currentIndex - 1].id);
                }
                break;
            case 'ArrowLeft':
                updateViewport({ scrollX: Math.max(0, viewport.scrollX - 50) });
                break;
            case 'ArrowRight':
                updateViewport({ scrollX: viewport.scrollX + 50 });
                break;
        }
    };
}
