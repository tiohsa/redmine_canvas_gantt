import { create } from 'zustand';
import type { Task, Relation, Viewport } from '../types';

interface TaskState {
    tasks: Task[];
    relations: Relation[];
    viewport: Viewport;
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
}

const DEFAULT_VIEWPORT: Viewport = {
    startDate: new Date().setHours(0, 0, 0, 0),
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
    selectedTaskId: null,
    hoveredTaskId: null,
    contextMenu: null,

    setTasks: (tasks) => set({ tasks }),
    setRelations: (relations) => set({ relations }),
    selectTask: (id) => set({ selectedTaskId: id }),
    setHoveredTask: (id) => set({ hoveredTaskId: id }),
    setContextMenu: (menu) => set({ contextMenu: menu }),

    updateTask: (id, updates) => set((state) => ({
        tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates } : t)
    })),

    updateViewport: (updates) => set((state) => ({
        viewport: { ...state.viewport, ...updates }
    }))
}));
