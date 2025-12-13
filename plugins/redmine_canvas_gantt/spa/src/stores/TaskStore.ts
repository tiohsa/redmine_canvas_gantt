import { create } from 'zustand';
import type { Task, Relation, Viewport, ViewMode } from '../types';
import { SCALES } from '../utils/grid';
import { applyHierarchyRules } from '../utils/constraints';

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

    setTasks: (tasks) => set({ tasks: applyHierarchyRules(tasks) }),
    setRelations: (relations) => set({ relations }),
    selectTask: (id) => set({ selectedTaskId: id }),
    setHoveredTask: (id) => set({ hoveredTaskId: id }),
    setContextMenu: (menu) => set({ contextMenu: menu }),

    updateTask: (id, updates) => set((state) => ({
        tasks: applyHierarchyRules(
            state.tasks.map(t => t.id === id ? { ...t, ...updates } : t)
        )
    })),

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
