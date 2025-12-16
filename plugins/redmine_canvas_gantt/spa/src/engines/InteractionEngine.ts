import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { LayoutEngine } from './LayoutEngine';
import type { Task } from '../types';
import { snapToUtcDay } from '../utils/time';

type DragMode = 'none' | 'pan' | 'task-move' | 'task-resize-start' | 'task-resize-end';

interface DragState {
    mode: DragMode;
    startX: number;
    startY: number;
    taskId: string | null;
    originalStartDate: number;
    originalDueDate: number;
    snapshot: Task[] | null;
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
        snapshot: null
    };

    constructor(container: HTMLElement) {
        this.container = container;
        this.attachEvents();
    }

    private panViewportByPixels(deltaX: number, deltaY: number) {
        const { viewport, updateViewport } = useTaskStore.getState();
        const scale = viewport.scale || 0.00000001;

        // Horizontal: keep scrollX >= 0 by shifting startDate when overscrolling to the past.
        let nextScrollX = viewport.scrollX - deltaX;
        let nextStartDate = viewport.startDate;
        if (nextScrollX < 0) {
            nextStartDate = viewport.startDate + (nextScrollX / scale);
            nextScrollX = 0;
        }

        updateViewport({
            startDate: nextStartDate,
            scrollX: nextScrollX,
            scrollY: Math.max(0, viewport.scrollY - deltaY)
        });
    }

    private scrollViewportByWheel(deltaX: number, deltaY: number) {
        const { viewport, updateViewport } = useTaskStore.getState();
        const scale = viewport.scale || 0.00000001;

        let nextScrollX = viewport.scrollX + deltaX;
        let nextStartDate = viewport.startDate;
        if (nextScrollX < 0) {
            nextStartDate = viewport.startDate + (nextScrollX / scale);
            nextScrollX = 0;
        }

        updateViewport({
            startDate: nextStartDate,
            scrollX: nextScrollX,
            scrollY: Math.max(0, viewport.scrollY + deltaY)
        });
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

    private hitTest(x: number, y: number): { task: Task | null; region: 'body' | 'start' | 'end' } {
        const { tasks, viewport } = useTaskStore.getState();
        const RESIZE_HANDLE_WIDTH = 8;

        for (const t of tasks) {
            const bounds = LayoutEngine.getTaskBounds(t, viewport, 'hit');
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
        // Ignore events from dependency handles (let/leave them for the Overlay handler)
        if ((e.target as HTMLElement).closest('.dependency-handle')) {
            return;
        }

        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const hit = this.hitTest(x, y);

        if (hit.task && hit.task.editable) {
            // Check if parent task
            if (hit.task.hasChildren) {
                useTaskStore.getState().selectTask(hit.task.id);
                // Show warning and return
                useUIStore.getState().addNotification('Cannot move parent task. Move child tasks instead.', 'warning');
                return;
            }

            useTaskStore.getState().selectTask(hit.task.id);
            if (hit.region === 'body') {
                this.drag = {
                    mode: 'task-move',
                    startX: e.clientX,
                    startY: e.clientY,
                    taskId: hit.task.id,
                    originalStartDate: hit.task.startDate,
                    originalDueDate: hit.task.dueDate,
                    snapshot: JSON.parse(JSON.stringify(useTaskStore.getState().allTasks))
                };
            } else if (hit.region === 'start') {
                this.drag = {
                    mode: 'task-resize-start',
                    startX: e.clientX,
                    startY: e.clientY,
                    taskId: hit.task.id,
                    originalStartDate: hit.task.startDate,
                    originalDueDate: hit.task.dueDate,
                    snapshot: JSON.parse(JSON.stringify(useTaskStore.getState().allTasks))
                };
            } else if (hit.region === 'end') {
                this.drag = {
                    mode: 'task-resize-end',
                    startX: e.clientX,
                    startY: e.clientY,
                    taskId: hit.task.id,
                    originalStartDate: hit.task.startDate,
                    originalDueDate: hit.task.dueDate,
                    snapshot: JSON.parse(JSON.stringify(useTaskStore.getState().allTasks))
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
                snapshot: null
            };
        }
    };

    private handleMouseMove = (e: MouseEvent) => {
        const { viewport, updateTask, setHoveredTask } = useTaskStore.getState();

        // Hover logic (only update when not dragging a task)
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hit = this.hitTest(x, y);

        // Skip hover update during task drag to keep tooltip visible
        const isTaskDragging = this.drag.mode === 'task-move' ||
            this.drag.mode === 'task-resize-start' ||
            this.drag.mode === 'task-resize-end';
        if (!isTaskDragging) {
            // Check if hovering over a dependency handle
            if ((e.target as HTMLElement).closest('.dependency-handle')) {
                // Keep current hover
            } else {
                let hoveredId = hit.task ? hit.task.id : null;

                // If not strictly hitting a task, check with expanded bounds (to cover the gap to handles)
                if (!hoveredId) {
                    const { tasks } = useTaskStore.getState();
                    const HOVER_MARGIN = 20; // Enough to cover handle offset (12px) + handle size (10px)
                    for (const t of tasks) {
                        const bounds = LayoutEngine.getTaskBounds(t, viewport, 'hit');
                        // Expand horizontally
                        if (x >= bounds.x - HOVER_MARGIN && x <= bounds.x + bounds.width + HOVER_MARGIN &&
                            y >= bounds.y && y <= bounds.y + bounds.height) {
                            hoveredId = t.id;
                            break;
                        }
                    }
                }
                setHoveredTask(hoveredId);
            }
        }

        // Update cursor based on hit region
        if (hit.task && hit.task.editable) {
            if (hit.region === 'start' || hit.region === 'end') {
                this.container.style.cursor = 'ew-resize';
            } else {
                this.container.style.cursor = 'grab';
            }
        } else {
            this.container.style.cursor = 'default';
        }

        if (this.drag.mode === 'none') return;

        const dx = e.clientX - this.drag.startX;
        const dy = e.clientY - this.drag.startY;

        if (this.drag.mode === 'pan') {
            this.panViewportByPixels(dx, dy);
            this.drag.startX = e.clientX;
            this.drag.startY = e.clientY;
        } else if (this.drag.mode === 'task-move' && this.drag.taskId) {
            const timeDelta = dx / viewport.scale;
            const newStart = this.snapToDate(this.drag.originalStartDate + timeDelta);
            const duration = this.drag.originalDueDate - this.drag.originalStartDate;

            // Only update if changed to avoid thrashing
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

    private handleMouseUp = async () => {
        const draggedTaskId = this.drag.taskId;
        const wasDragging = this.drag.mode !== 'none' && this.drag.mode !== 'pan' && draggedTaskId;
        const snapshot = this.drag.snapshot;

        this.drag = { mode: 'none', startX: 0, startY: 0, taskId: null, originalStartDate: 0, originalDueDate: 0, snapshot: null };
        this.container.style.cursor = 'default';

        if (wasDragging && draggedTaskId) {
            // Persist the change to backend
            const { tasks, updateTask } = useTaskStore.getState();
            const task = tasks.find(t => t.id === draggedTaskId);
            if (!task) return;

            try {
                const { apiClient } = await import('../api/client');
                const result = await apiClient.updateTask(task);

                if (result.status === 'ok' && result.lockVersion !== undefined) {
                    // Update lockVersion in store
                    updateTask(draggedTaskId, { lockVersion: result.lockVersion });
                } else {
                    const errorMsg = result.status === 'conflict'
                        ? (result.error || 'Conflict detected. Please reload.')
                        : ('Failed to save: ' + (result.error || 'Unknown error'));

                    useUIStore.getState().addNotification(errorMsg, 'warning');

                    // Revert changes
                    if (snapshot) {
                        useTaskStore.getState().setTasks(snapshot);
                    }
                }
            } catch (err) {
                console.error('API error:', err);
                useUIStore.getState().addNotification('Failed to save task changes.', 'error');

                // Revert changes
                if (snapshot) {
                    useTaskStore.getState().setTasks(snapshot);
                }
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
            // Zoom
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(0.00000001, Math.min(0.001, viewport.scale * zoomFactor));
            updateViewport({ scale: newScale });
        } else {
            // Scroll
            this.scrollViewportByWheel(e.deltaX, e.deltaY);
        }
    };

    private handleKeyDown = (e: KeyboardEvent) => {
        const { tasks, selectedTaskId, selectTask } = useTaskStore.getState();

        if (e.key === 'Escape') {
            selectTask(null);
            return;
        }

        if (!selectedTaskId) {
            // If nothing selected, arrow down selects first visible task
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
                this.scrollViewportByWheel(-50, 0);
                break;
            case 'ArrowRight':
                this.scrollViewportByWheel(50, 0);
                break;
        }
    };
}
