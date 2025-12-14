import { create } from 'zustand';
import type { Task, Relation, Viewport, ViewMode, ZoomLevel, LayoutRow } from '../types';
import { ZOOM_SCALES } from '../utils/grid';
import { TaskLogicService } from '../services/TaskLogicService';
import { loadPreferences } from '../utils/preferences';

interface TaskState {
    tasks: Task[];
    relations: Relation[];
    viewport: Viewport;
    viewMode: ViewMode;
    zoomLevel: ZoomLevel;
    layoutRows: LayoutRow[];
    rowCount: number;
    groupByProject: boolean;
    viewportFromStorage: boolean;
    selectedTaskId: string | null;
    hoveredTaskId: string | null;
    contextMenu: { x: number; y: number; taskId: string } | null;

    // Actions
    setTasks: (tasks: Task[]) => void;
    setRelations: (relations: Relation[]) => void;
    addRelation: (relation: Relation) => void;
    selectTask: (id: string | null) => void;
    setHoveredTask: (id: string | null) => void;
    setContextMenu: (menu: { x: number; y: number; taskId: string } | null) => void;
    updateTask: (id: string, updates: Partial<Task>) => void;
    updateViewport: (updates: Partial<Viewport>) => void;
    setViewMode: (mode: ViewMode) => void;
    setZoomLevel: (level: ZoomLevel) => void;
    setGroupByProject: (grouped: boolean) => void;
}

const preferences = loadPreferences();

const DEFAULT_VIEWPORT: Viewport = {
    startDate: preferences.viewport?.startDate ?? new Date().setFullYear(new Date().getFullYear() - 1),
    scrollX: preferences.viewport?.scrollX ?? 0,
    scrollY: preferences.viewport?.scrollY ?? 0,
    scale: preferences.viewport?.scale ?? ZOOM_SCALES[preferences.zoomLevel ?? 1],
    width: 800,
    height: 600,
    rowHeight: 32
};

const buildLayout = (tasks: Task[], groupByProject: boolean): { tasks: Task[]; layoutRows: LayoutRow[]; rowCount: number } => {
    const groups = new Map<string, { projectId: string; projectName?: string; tasks: Task[]; order: number }>();

    tasks.forEach((task, index) => {
        const projectId = task.projectId ?? 'default_project';
        if (!groups.has(projectId)) {
            groups.set(projectId, {
                projectId,
                projectName: task.projectName,
                tasks: [],
                order: index
            });
        }

        const group = groups.get(projectId);
        if (group) {
            group.tasks.push(task);
            group.projectName = group.projectName || task.projectName;
        }
    });

    const orderedGroups = Array.from(groups.values()).sort((a, b) => a.order - b.order);

    let rowIndex = 0;
    const arrangedTasks: Task[] = [];
    const layoutRows: LayoutRow[] = [];

    orderedGroups.forEach(group => {
        if (groupByProject) {
            layoutRows.push({ type: 'header', projectId: group.projectId, projectName: group.projectName, rowIndex });
            rowIndex += 1;
        }

        const sortedTasks = [...group.tasks].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
        sortedTasks.forEach(task => {
            const taskWithRow = { ...task, rowIndex };
            arrangedTasks.push(taskWithRow);
            layoutRows.push({ type: 'task', taskId: task.id, rowIndex });
            rowIndex += 1;
        });
    });

    return { tasks: arrangedTasks, layoutRows, rowCount: rowIndex };
};

export const useTaskStore = create<TaskState>((set) => ({
    tasks: [],
    relations: [],
    viewport: DEFAULT_VIEWPORT,
    viewMode: preferences.viewMode ?? 'Week',
    zoomLevel: preferences.zoomLevel ?? 1,
    layoutRows: [],
    rowCount: 0,
    groupByProject: preferences.groupByProject ?? true,
    viewportFromStorage: Boolean(preferences.viewport),
    selectedTaskId: null,
    hoveredTaskId: null,
    contextMenu: null,

    setTasks: (tasks) => set((state) => buildLayout(tasks, state.groupByProject)),
    setRelations: (relations) => set({ relations }),
    addRelation: (relation) => set((state) => {
        const exists = state.relations.some(r => r.from === relation.from && r.to === relation.to && r.type === relation.type);
        if (exists) return state;
        return { relations: [...state.relations, relation] };
    }),
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
        let zoom = state.zoomLevel;
        if (mode === 'Month') zoom = 0;
        if (mode === 'Week') zoom = 1;
        if (mode === 'Day') zoom = 2;

        const { viewport } = state;
        const newScale = ZOOM_SCALES[zoom];

        // Preserve Center Logic (shared)
        const width = viewport.width || 800;
        const centerOffsetPixels = viewport.scrollX + (width / 2);
        const centerTimeOffset = centerOffsetPixels / viewport.scale;

        let newScrollX = (centerTimeOffset * newScale) - (width / 2);
        if (newScrollX < 0) newScrollX = 0;

        return {
            viewMode: mode,
            zoomLevel: zoom,
            viewport: { ...state.viewport, scale: newScale, scrollX: newScrollX }
        };
    }),

    setZoomLevel: (level) => set((state) => {
        const { viewport } = state;
        const newScale = ZOOM_SCALES[level];

        // Preserve Center Logic
        const width = viewport.width || 800;
        // Current center relative to start
        const centerOffsetPixels = viewport.scrollX + (width / 2);
        const centerTimeOffset = centerOffsetPixels / viewport.scale;

        // New scrollX
        let newScrollX = (centerTimeOffset * newScale) - (width / 2);
        if (newScrollX < 0) newScrollX = 0;

        // Reverse map to viewMode for compatibility if needed
        let mode: ViewMode = 'Week';
        if (level === 0) mode = 'Month';
        if (level === 1) mode = 'Week';
        if (level === 2) mode = 'Day';


        return {
            zoomLevel: level,
            viewMode: mode,
            viewport: { ...state.viewport, scale: newScale, scrollX: newScrollX }
        };
    }),

    setGroupByProject: (grouped) => set((state) => ({
        groupByProject: grouped,
        ...buildLayout(state.tasks.map(t => ({ ...t })), grouped)
    }))
}));
