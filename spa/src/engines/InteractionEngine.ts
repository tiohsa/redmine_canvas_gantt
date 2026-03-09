import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { LayoutEngine } from './LayoutEngine';
import type { Relation, Task } from '../types';
import {
    buildRelationRenderContext,
    buildRelationRoutePoints,
    distanceToPolyline,
    isRouteVisible,
    RELATION_HIT_TOLERANCE_PX,
    shouldRenderRelationsAtZoom
} from '../renderers/relationGeometry';
import { snapToUtcDay } from '../utils/time';

type DragMode = 'none' | 'pan' | 'task-move' | 'task-resize-start' | 'task-resize-end';
const TASK_MOVE_CURSOR = 'move';
const TASK_RESIZE_CURSOR = 'ew-resize';
const TASK_DISABLED_PARENT_CURSOR = 'pointer';
const DEFAULT_CURSOR = 'default';
const RELATION_ROW_BUFFER = 50;
const TASK_RESIZE_HANDLE_WIDTH_PX = 8;
const TASK_RESIZE_OUTSIDE_MARGIN_PX = 6;
const TASK_MIN_MOVE_REGION_WIDTH_PX = 8;

interface DragState {
    mode: DragMode;
    startX: number;
    startY: number;
    taskId: string | null;
    originalStartDate: number | undefined;
    originalDueDate: number | undefined;
    snapshot: Task[] | null;
}

export class InteractionEngine {
    private container: HTMLElement;
    private drag: DragState = {
        mode: 'none',
        startX: 0,
        startY: 0,
        taskId: null,
        originalStartDate: undefined,
        originalDueDate: undefined,
        snapshot: null
    };

    constructor(container: HTMLElement) {
        this.container = container;
        this.attachEvents();
    }

    private isScrollInteractionLocked(): boolean {
        return useUIStore.getState().isSidebarResizing;
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
        const { tasks, viewport, rowCount, zoomLevel } = useTaskStore.getState();

        const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, rowCount || tasks.length);
        const visibleTasks = LayoutEngine.sliceTasksInRowRange(tasks, startRow, endRow);

        for (const t of visibleTasks) {
            const bounds = LayoutEngine.getTaskBounds(t, viewport, 'hit', zoomLevel);
            if (y < bounds.y || y > bounds.y + bounds.height) {
                continue;
            }

            // Determine which part was clicked
            const isPoint = !Number.isFinite(t.startDate) || !Number.isFinite(t.dueDate);
            if (isPoint) {
                if (x >= bounds.x && x <= bounds.x + bounds.width) {
                    return { task: t, region: 'body' };
                }
                continue;
            }

            const region = this.getTaskRegionForX(bounds.x, bounds.width, x);
            if (region) {
                return { task: t, region };
            }
        }
        return { task: null, region: 'body' };
    }

    private getTaskRegionForX(
        taskX: number,
        taskWidth: number,
        pointerX: number
    ): 'body' | 'start' | 'end' | null {
        const taskEndX = taskX + taskWidth;
        const paddedStartX = taskX - TASK_RESIZE_OUTSIDE_MARGIN_PX;
        const paddedEndX = taskEndX + TASK_RESIZE_OUTSIDE_MARGIN_PX;

        if (pointerX < paddedStartX || pointerX > paddedEndX) {
            return null;
        }

        const availableForHandles = Math.max(0, taskWidth - TASK_MIN_MOVE_REGION_WIDTH_PX);
        const handleWidth = Math.min(TASK_RESIZE_HANDLE_WIDTH_PX, availableForHandles / 2);
        const leftResizeEnd = taskX + handleWidth;
        const rightResizeStart = taskEndX - handleWidth;

        const isNearLeftEdge = pointerX <= leftResizeEnd || pointerX < taskX;
        const isNearRightEdge = pointerX >= rightResizeStart || pointerX > taskEndX;

        if (isNearLeftEdge && isNearRightEdge) {
            return (pointerX - taskX) <= (taskEndX - pointerX) ? 'start' : 'end';
        }
        if (isNearLeftEdge) return 'start';
        if (isNearRightEdge) return 'end';
        if (pointerX >= taskX && pointerX <= taskEndX) return 'body';
        return null;
    }

    private isPointerWithinActualTaskHitBounds(task: Task, x: number, y: number): boolean {
        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task, viewport, 'hit', zoomLevel);
        return (
            x >= bounds.x &&
            x <= bounds.x + bounds.width &&
            y >= bounds.y &&
            y <= bounds.y + bounds.height
        );
    }

    private getResizeRegionFromTarget(target: EventTarget | null): 'start' | 'end' | null {
        if (!(target instanceof Element)) return null;
        const handle = target.closest('.task-resize-handle');
        if (!handle) return null;

        const region = handle.getAttribute('data-region');
        return region === 'start' || region === 'end' ? region : null;
    }

    private snapToDate(timestamp: number): number {
        return snapToUtcDay(timestamp);
    }

    private getCursorForHit(hit: { task: Task | null; region: 'body' | 'start' | 'end'; relation: Relation | null }): string {
        if (this.drag.mode === 'task-move') return TASK_MOVE_CURSOR;
        if (this.drag.mode === 'task-resize-start' || this.drag.mode === 'task-resize-end') return TASK_RESIZE_CURSOR;
        if (this.drag.mode === 'pan') return DEFAULT_CURSOR;

        if (hit.relation) return 'pointer';
        if (!hit.task) return DEFAULT_CURSOR;
        if (hit.task.hasChildren) return TASK_DISABLED_PARENT_CURSOR;
        if (!hit.task.editable) return DEFAULT_CURSOR;
        if (hit.region === 'start' || hit.region === 'end') return TASK_RESIZE_CURSOR;
        return TASK_MOVE_CURSOR;
    }

    private hitTestRelation(x: number, y: number): Relation | null {
        const { tasks, relations, viewport, rowCount, zoomLevel } = useTaskStore.getState();
        if (!shouldRenderRelationsAtZoom(zoomLevel)) {
            return null;
        }

        const totalRows = rowCount || tasks.length;
        const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, totalRows);
        const bufferedTasks = LayoutEngine.sliceTasksInRowRange(
            tasks,
            Math.max(0, startRow - RELATION_ROW_BUFFER),
            Math.min(totalRows - 1, endRow + RELATION_ROW_BUFFER)
        );
        const context = buildRelationRenderContext(bufferedTasks, viewport, zoomLevel);
        const worldPoint = {
            x: x + viewport.scrollX,
            y: y + viewport.scrollY
        };

        let match: Relation | null = null;
        let bestDistance = Infinity;

        relations.forEach((relation) => {
            const points = buildRelationRoutePoints(relation, context, viewport);
            if (!points || !isRouteVisible(points, viewport)) {
                return;
            }

            const distance = distanceToPolyline(worldPoint, points);
            if (distance <= RELATION_HIT_TOLERANCE_PX && distance < bestDistance) {
                bestDistance = distance;
                match = relation;
            }
        });

        return match;
    }

    private handleMouseDown = (e: MouseEvent) => {
        if (e.button === 2) return; // Ignore right-click
        if (this.isScrollInteractionLocked()) return;

        // Ignore events from dependency handles (let/leave them for the Overlay handler)
        const downTarget = e.target;
        if (downTarget instanceof Element && downTarget.closest('.dependency-handle')) {
            return;
        }

        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const handleRegion = this.getResizeRegionFromTarget(downTarget);
        const hit = this.hitTest(x, y);
        const resolvedHit = handleRegion && hit.task ? { ...hit, region: handleRegion } : hit;
        const relation = this.hitTestRelation(x, y);
        if (relation && (!resolvedHit.task || !this.isPointerWithinActualTaskHitBounds(resolvedHit.task, x, y))) {
            useTaskStore.getState().selectRelation(relation.id);
            return;
        }

        if (resolvedHit.task && resolvedHit.task.editable) {
            // Check if parent task
            if (resolvedHit.task.hasChildren) {
                useTaskStore.getState().selectTask(resolvedHit.task.id);
                // Show warning and return
                useUIStore.getState().addNotification('Cannot move parent task. Move child tasks instead.', 'warning');
                return;
            }

            useTaskStore.getState().selectTask(resolvedHit.task.id);
            // Suspend sorting during interaction
            useTaskStore.getState().setSortingSuspended(true);

            if (resolvedHit.region === 'body') {
                this.drag = {
                    mode: 'task-move',
                    startX: e.clientX,
                    startY: e.clientY,
                    taskId: resolvedHit.task.id,
                    originalStartDate: resolvedHit.task.startDate,
                    originalDueDate: resolvedHit.task.dueDate,
                    snapshot: JSON.parse(JSON.stringify(useTaskStore.getState().allTasks))
                };
            } else if (resolvedHit.region === 'start') {
                this.drag = {
                    mode: 'task-resize-start',
                    startX: e.clientX,
                    startY: e.clientY,
                    taskId: resolvedHit.task.id,
                    originalStartDate: resolvedHit.task.startDate,
                    originalDueDate: resolvedHit.task.dueDate,
                    snapshot: JSON.parse(JSON.stringify(useTaskStore.getState().allTasks))
                };
            } else if (resolvedHit.region === 'end') {
                this.drag = {
                    mode: 'task-resize-end',
                    startX: e.clientX,
                    startY: e.clientY,
                    taskId: resolvedHit.task.id,
                    originalStartDate: resolvedHit.task.startDate,
                    originalDueDate: resolvedHit.task.dueDate,
                    snapshot: JSON.parse(JSON.stringify(useTaskStore.getState().allTasks))
                };
            }
        } else if (resolvedHit.task) {
            // Not editable, just select
            useTaskStore.getState().selectTask(resolvedHit.task.id);
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
        const relationHit = this.hitTestRelation(x, y);

        // Skip hover update during task drag to keep tooltip visible
        const isTaskDragging = this.drag.mode === 'task-move' ||
            this.drag.mode === 'task-resize-start' ||
            this.drag.mode === 'task-resize-end';
        if (!isTaskDragging) {
            // Check if hovering over a dependency handle
            const moveTarget = e.target;
            if (moveTarget instanceof Element && moveTarget.closest('.dependency-handle')) {
                // Keep current hover
            } else {
                let hoveredId = hit.task ? hit.task.id : null;

                // If not strictly hitting a task, check with expanded bounds (to cover the gap to handles)
                if (!hoveredId) {
                    const { tasks, rowCount, zoomLevel: currentZoom } = useTaskStore.getState();
                    const [startRow, endRow] = LayoutEngine.getVisibleRowRange(viewport, rowCount || tasks.length);
                    const candidates = LayoutEngine.sliceTasksInRowRange(tasks, startRow, endRow);
                    const HOVER_MARGIN = 20; // Enough to cover handle offset (12px) + handle size (10px)
                    for (const t of candidates) {
                        const bounds = LayoutEngine.getTaskBounds(t, viewport, 'hit', currentZoom);
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

        this.container.style.cursor = this.getCursorForHit({ ...hit, relation: relationHit });

        if (this.drag.mode === 'none') return;

        const dx = e.clientX - this.drag.startX;
        const dy = e.clientY - this.drag.startY;

        if (this.drag.mode === 'pan') {
            this.panViewportByPixels(dx, dy);
            this.drag.startX = e.clientX;
            this.drag.startY = e.clientY;
        } else if (this.drag.mode === 'task-move' && this.drag.taskId) {
            const timeDelta = dx / viewport.scale;
            const currentTask = useTaskStore.getState().tasks.find(t => t.id === this.drag.taskId);

            if (Number.isFinite(this.drag.originalStartDate) && Number.isFinite(this.drag.originalDueDate)) {
                const newStart = this.snapToDate(this.drag.originalStartDate! + timeDelta);
                const duration = this.drag.originalDueDate! - this.drag.originalStartDate!;

                if (currentTask && currentTask.startDate !== newStart) {
                    updateTask(this.drag.taskId, {
                        startDate: newStart,
                        dueDate: newStart + duration
                    });
                }
            } else if (Number.isFinite(this.drag.originalStartDate)) {
                const newStart = this.snapToDate(this.drag.originalStartDate! + timeDelta);
                if (currentTask && currentTask.startDate !== newStart) {
                    updateTask(this.drag.taskId, {
                        startDate: newStart
                    });
                }
            } else if (Number.isFinite(this.drag.originalDueDate)) {
                // Determine delta based on drag start
                const newDue = this.snapToDate(this.drag.originalDueDate! + timeDelta);
                if (currentTask && currentTask.dueDate !== newDue) {
                    updateTask(this.drag.taskId, {
                        dueDate: newDue
                    });
                }
            }
        } else if (this.drag.mode === 'task-resize-start' && this.drag.taskId) {
            const timeDelta = dx / viewport.scale;
            const newStart = this.snapToDate(this.drag.originalStartDate! + timeDelta);

            const currentTask = useTaskStore.getState().tasks.find(t => t.id === this.drag.taskId);

            if (currentTask && newStart <= this.drag.originalDueDate! && currentTask.startDate !== newStart) {
                updateTask(this.drag.taskId, { startDate: newStart });
            }
        } else if (this.drag.mode === 'task-resize-end' && this.drag.taskId) {
            const timeDelta = dx / viewport.scale;
            const newEnd = this.snapToDate(this.drag.originalDueDate! + timeDelta);

            const currentTask = useTaskStore.getState().tasks.find(t => t.id === this.drag.taskId);

            if (currentTask && newEnd >= this.drag.originalStartDate! && currentTask.dueDate !== newEnd) {
                updateTask(this.drag.taskId, { dueDate: newEnd });
            }
        }
    };

    private handleMouseUp = async () => {
        const draggedTaskId = this.drag.taskId;
        const wasDragging = this.drag.mode !== 'none' && this.drag.mode !== 'pan' && draggedTaskId;


        // Resume sorting (will trigger re-layout)
        useTaskStore.getState().setSortingSuspended(false);

        this.drag = { mode: 'none', startX: 0, startY: 0, taskId: null, originalStartDate: undefined, originalDueDate: undefined, snapshot: null };
        this.container.style.cursor = DEFAULT_CURSOR;

        if (wasDragging && draggedTaskId) {
            const { autoSave, saveChanges } = useTaskStore.getState();
            if (autoSave) {
                saveChanges().catch(console.error);
            }
        }
    };

    private handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        const { hoveredTaskId, setContextMenu } = useTaskStore.getState();
        if (hoveredTaskId) {
            setContextMenu({ x: e.clientX, y: e.clientY, taskId: hoveredTaskId });
        } else {
            setContextMenu(null);
        }
    };

    private handleWheel = (e: WheelEvent) => {
        if (this.isScrollInteractionLocked()) {
            e.preventDefault();
            return;
        }

        const { viewport, updateViewport } = useTaskStore.getState();
        if (e.ctrlKey || e.metaKey) {
            // Zoom
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(0.00000001, Math.min(0.001, viewport.scale * zoomFactor));
            updateViewport({ scale: newScale });
        } else {
            // Scroll
            e.preventDefault();
            this.scrollViewportByWheel(e.deltaX, e.deltaY);
        }
    };

    private handleKeyDown = (e: KeyboardEvent) => {
        if (this.isScrollInteractionLocked() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            return;
        }

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
