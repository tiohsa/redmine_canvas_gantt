import { create } from 'zustand';
import type { Task, Relation, Viewport, ViewMode } from '../types';
import { SCALES } from '../utils/grid';
import { TaskLogicService } from '../services/TaskLogicService';

interface TaskState {
    tasks: Task[];
    relations: Relation[];
    viewport: Viewport;
    viewMode: ViewMode;
    selectedTaskId: string | null;
    hoveredTaskId: string | null;
    contextMenu: { x: number; y: number; taskId: string } | null;

    // Actions
    setTasks: (tasks: Task[]) => void;
    setRelations: (relations: Relation[]) => void;
    selectTask: (id: string | null) => void;
    setHoveredTask: (id: string | null) => void;
    setContextMenu: (menu: { x: number; y: number; taskId: string } | null) => void;
    updateTask: (id: string, updates: Partial<Task>) => void;
    updateViewport: (updates: Partial<Viewport>) => void;
    setViewMode: (mode: ViewMode) => void;
}

const DEFAULT_VIEWPORT: Viewport = {
    startDate: new Date().setFullYear(new Date().getFullYear() - 1),
    scrollX: 0,
    scrollY: 0,
    scale: 0.0000005787, // ~50px per day
    width: 800,
    height: 600,
    rowHeight: 40
};

export const useTaskStore = create<TaskState>((set) => ({
    tasks: [],
    relations: [],
    viewport: DEFAULT_VIEWPORT,
    viewMode: 'Day',
    selectedTaskId: null,
    hoveredTaskId: null,
    contextMenu: null,

    setTasks: (tasks) => set({ tasks }),
    setRelations: (relations) => set({ relations }),
    selectTask: (id) => set({ selectedTaskId: id }),
    setHoveredTask: (id) => set({ hoveredTaskId: id }),
    setContextMenu: (menu) => set({ contextMenu: menu }),

    updateTask: (id, updates) => set((state) => {
        const task = state.tasks.find(t => t.id === id);
        if (!task) return state;

        // 1. Check editability
        if (!TaskLogicService.canEditTask(task)) {
            console.warn('Task is not editable');
            return state;
        }

        // 2. Prepare new state for this task
        const updatedTask = { ...task, ...updates };

        // 3. Validate dates (basic check)
        // For now logging warnings, but we could prevent update if invalid
        TaskLogicService.validateDates(updatedTask).forEach(warn => console.warn(warn));

        let currentTasks = state.tasks.map(t => t.id === id ? updatedTask : t);
        const pendingUpdates = new Map<string, Partial<Task>>();

        // 4. Check dependencies (snap successors)
        if (updates.startDate || updates.dueDate) {
            const depUpdates = TaskLogicService.checkDependencies(
                currentTasks,
                state.relations,
                id,
                updatedTask.startDate,
                updatedTask.dueDate
            );
            depUpdates.forEach((v, k) => pendingUpdates.set(k, v));
        }

        // Apply dependency updates to currentTasks to prepare for parent calc
        if (pendingUpdates.size > 0) {
            currentTasks = currentTasks.map(t => {
                if (pendingUpdates.has(t.id)) {
                    return { ...t, ...pendingUpdates.get(t.id) };
                }
                return t;
            });
        }

        // 5. Recalculate parent dates
        // We need to check the parent of the moved task, and parents of any moved successors
        const tasksToCheckParents = [id, ...pendingUpdates.keys()];
        const processedParents = new Set<string>();

        tasksToCheckParents.forEach(taskId => {
            const t = currentTasks.find(ct => ct.id === taskId);
            if (t && t.parentId && !processedParents.has(t.parentId)) {
                processedParents.add(t.parentId);
                const parentUpdates = TaskLogicService.recalculateParentDates(currentTasks, t.parentId);
                parentUpdates.forEach((v, k) => pendingUpdates.set(k, v));
            }
        });

        // Final application of all updates
        const finalTasks = state.tasks.map(t => {
            if (t.id === id) return updatedTask;
            if (pendingUpdates.has(t.id)) return { ...t, ...pendingUpdates.get(t.id) };
            return t;
        });

        return { tasks: finalTasks };
    }),

    updateViewport: (updates) => set((state) => ({
        viewport: { ...state.viewport, ...updates }
    })),



    setViewMode: (mode) => set((state) => {
        let scale = state.viewport.scale;
        switch (mode) {
            case 'Day':
                scale = SCALES.Day;
                break;
            case 'Week':
                scale = SCALES.Week;
                break;
            case 'Month':
                scale = SCALES.Month;
                break;
        }
        return {
            viewMode: mode,
            viewport: { ...state.viewport, scale }
        };
    })
}));
