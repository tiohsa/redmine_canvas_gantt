import { create } from 'zustand';
import type { Task, Relation, Viewport, ViewMode, ZoomLevel, LayoutRow } from '../types';
import { ZOOM_SCALES } from '../utils/grid';
import { TaskLogicService } from '../services/TaskLogicService';
import { loadPreferences } from '../utils/preferences';

interface TaskState {
    allTasks: Task[];
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
    projectExpansion: Record<string, boolean>;
    taskExpansion: Record<string, boolean>;
    filterText: string;
    selectedAssigneeIds: (number | null)[];

    sortConfig: { key: keyof Task; direction: 'asc' | 'desc' } | null;

    // Actions
    setTasks: (tasks: Task[]) => void;
    setRelations: (relations: Relation[]) => void;
    addRelation: (relation: Relation) => void;
    removeRelation: (relationId: string) => void;
    selectTask: (id: string | null) => void;
    setHoveredTask: (id: string | null) => void;
    setContextMenu: (menu: { x: number; y: number; taskId: string } | null) => void;
    updateTask: (id: string, updates: Partial<Task>) => void;
    removeTask: (id: string) => void;
    updateViewport: (updates: Partial<Viewport>) => void;
    setViewMode: (mode: ViewMode) => void;
    setZoomLevel: (level: ZoomLevel) => void;
    setGroupByProject: (grouped: boolean) => void;
    toggleProjectExpansion: (projectId: string) => void;
    toggleTaskExpansion: (taskId: string) => void;

    setFilterText: (text: string) => void;
    setSelectedAssigneeIds: (ids: (number | null)[]) => void;
    scrollToTask: (taskId: string) => void;
    setSortConfig: (key: keyof Task | null) => void;
    refreshData: () => Promise<void>;
}

const preferences = loadPreferences();

const DEFAULT_VIEWPORT: Viewport = {
    startDate: preferences.viewport?.startDate ?? new Date().setFullYear(new Date().getFullYear() - 1),
    scrollX: preferences.viewport?.scrollX ?? 0,
    scrollY: preferences.viewport?.scrollY ?? 0,
    scale: preferences.viewport?.scale ?? ZOOM_SCALES[preferences.zoomLevel ?? 1],
    width: 800,
    height: 600,
    rowHeight: Number((window as any).RedmineCanvasGantt?.settings?.row_height) || 32
};

const buildLayout = (
    tasks: Task[],
    groupByProject: boolean,
    projectExpansion: Record<string, boolean>,
    taskExpansion: Record<string, boolean>,
    sortConfig: { key: keyof Task; direction: 'asc' | 'desc' } | null
): { tasks: Task[]; layoutRows: LayoutRow[]; rowCount: number } => {
    const normalizedTasks = tasks.map((task) => ({ ...task, hasChildren: false }));

    const nodeMap = new Map<string, { task: Task; children: string[] }>();
    normalizedTasks.forEach((task) => nodeMap.set(task.id, { task, children: [] }));

    const projectOrder = new Map<string, number>();
    const projectRoots = new Map<string, string[]>();

    normalizedTasks.forEach((task, index) => {
        const projectId = task.projectId ?? 'default_project';
        if (!projectOrder.has(projectId)) {
            projectOrder.set(projectId, index);
        }

        if (task.parentId && nodeMap.has(task.parentId)) {
            const parentNode = nodeMap.get(task.parentId);
            parentNode?.children.push(task.id);
            if (parentNode) {
                parentNode.task.hasChildren = true;
            }
        } else {
            if (!projectRoots.has(projectId)) {
                projectRoots.set(projectId, []);
            }
            projectRoots.get(projectId)?.push(task.id);
        }
    });

    // Helper to sort task IDs by configured sort or default displayOrder
    const sortTaskIds = (ids: string[]) => {
        ids.sort((a, b) => {
            const taskA = nodeMap.get(a)?.task;
            const taskB = nodeMap.get(b)?.task;
            if (!taskA || !taskB) return 0;

            if (sortConfig) {
                const valA = taskA[sortConfig.key];
                const valB = taskB[sortConfig.key];

                if (valA === valB) return 0;

                // Handle nulls/undefined always at the bottom? or top? 
                // Let's say nulls last.
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;

                const compare = (valA < valB ? -1 : 1);
                return sortConfig.direction === 'asc' ? compare : -compare;
            }

            return (taskA.displayOrder ?? 0) - (taskB.displayOrder ?? 0);
        });
    };

    // Sort children and root nodes by displayOrder for stable rendering
    nodeMap.forEach((node) => {
        sortTaskIds(node.children);
    });

    projectRoots.forEach((roots) => {
        sortTaskIds(roots);
    });

    const orderedProjects = Array.from(projectRoots.keys()).sort((a, b) => (projectOrder.get(a) ?? 0) - (projectOrder.get(b) ?? 0));

    let rowIndex = 0;
    const arrangedTasks: Task[] = [];
    const layoutRows: LayoutRow[] = [];

    const traverse = (taskId: string, depth: number, hiddenByAncestor: boolean) => {
        const node = nodeMap.get(taskId);
        if (!node) return;

        const isExpanded = taskExpansion[taskId] ?? true;
        const shouldHideChildren = hiddenByAncestor || !isExpanded;

        if (!hiddenByAncestor) {
            const taskWithLayout: Task = { ...node.task, indentLevel: depth, rowIndex };
            arrangedTasks.push(taskWithLayout);
            layoutRows.push({ type: 'task', taskId: taskWithLayout.id, rowIndex });
            rowIndex += 1;
        }

        node.children.forEach((childId) => traverse(childId, depth + 1, shouldHideChildren));
    };

    orderedProjects.forEach((projectId) => {
        const roots = projectRoots.get(projectId) ?? [];
        const projectName = nodeMap.get(roots[0] ?? '')?.task.projectName;
        const expanded = projectExpansion[projectId] ?? true;

        if (groupByProject) {
            layoutRows.push({ type: 'header', projectId, projectName, rowIndex });
            rowIndex += 1;
        }

        const hideDescendants = groupByProject ? !expanded : false;
        roots.forEach((rootId) => traverse(rootId, 0, hideDescendants));
    });

    return { tasks: arrangedTasks, layoutRows, rowCount: rowIndex };
};

const applyFilters = (tasks: Task[], filterText: string, selectedAssigneeIds: (number | null)[]) => {
    let filtered = tasks;
    const lowerText = filterText.toLowerCase();

    if (lowerText) {
        filtered = filtered.filter(t => t.subject.toLowerCase().includes(lowerText));
    }

    if (selectedAssigneeIds.length > 0) {
        filtered = filtered.filter(t => {
            const taskAssignee = t.assignedToId === undefined ? null : t.assignedToId;
            return selectedAssigneeIds.includes(taskAssignee);
        });
    }
    return filtered;
};

export const useTaskStore = create<TaskState>((set) => ({
    allTasks: [],
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
    projectExpansion: {},
    taskExpansion: {},
    filterText: '',
    selectedAssigneeIds: [],
    sortConfig: null,

    setTasks: (tasks) => set((state) => {
        const projectExpansion = { ...state.projectExpansion };
        const taskExpansion = { ...state.taskExpansion };

        tasks.forEach((task) => {
            const projectId = task.projectId ?? 'default_project';
            if (projectExpansion[projectId] === undefined) projectExpansion[projectId] = true;
            if (taskExpansion[task.id] === undefined) taskExpansion[task.id] = true;
        });

        const filteredTasks = applyFilters(tasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(filteredTasks, state.groupByProject, projectExpansion, taskExpansion, state.sortConfig);

        return {
            allTasks: tasks,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount,
            projectExpansion,
            taskExpansion
        };
    }),
    setRelations: (relations) => set({ relations }),
    addRelation: (relation) => set((state) => {
        const exists = state.relations.some(r => r.from === relation.from && r.to === relation.to && r.type === relation.type);
        if (exists) return state;
        return { relations: [...state.relations, relation] };
    }),
    removeRelation: (relationId) => set((state) => ({
        relations: state.relations.filter(r => r.id !== relationId)
    })),
    selectTask: (id) => set({ selectedTaskId: id }),
    setHoveredTask: (id) => set({ hoveredTaskId: id }),
    setContextMenu: (menu) => set({ contextMenu: menu }),

    updateTask: (id, updates) => set((state) => {
        const task = state.allTasks.find(t => t.id === id);
        if (!task) return state;

        if (!TaskLogicService.canEditTask(task)) {
            console.warn('Task is not editable');
            return state;
        }

        const updatedTask = { ...task, ...updates };
        TaskLogicService.validateDates(updatedTask).forEach(warn => console.warn(warn));

        let currentTasks = state.allTasks.map(t => t.id === id ? updatedTask : t);
        const pendingUpdates = new Map<string, Partial<Task>>();

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

        if (pendingUpdates.size > 0) {
            currentTasks = currentTasks.map(t => {
                if (pendingUpdates.has(t.id)) {
                    return { ...t, ...pendingUpdates.get(t.id) };
                }
                return t;
            });
        }

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

        const finalTasks = state.allTasks.map(t => {
            if (t.id === id) return updatedTask;
            if (pendingUpdates.has(t.id)) return { ...t, ...pendingUpdates.get(t.id) };
            return t;
        });

        const filteredTasks = applyFilters(finalTasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(filteredTasks, state.groupByProject, state.projectExpansion, state.taskExpansion, state.sortConfig);

        return {
            allTasks: finalTasks,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    removeTask: (id) => set((state) => {
        const finalTasks = state.allTasks.filter(t => t.id !== id);
        const filteredTasks = applyFilters(finalTasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(filteredTasks, state.groupByProject, state.projectExpansion, state.taskExpansion, state.sortConfig);
        return {
            allTasks: finalTasks,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    updateViewport: (updates) => set((state) => {
        const nextViewport = { ...state.viewport, ...updates };

        const totalHeight = Math.max(0, state.rowCount * nextViewport.rowHeight);
        const maxScrollY = Math.max(0, totalHeight - nextViewport.height);
        const nextScrollY = Math.max(0, Math.min(maxScrollY, nextViewport.scrollY));

        return {
            viewport: { ...nextViewport, scrollY: nextScrollY }
        };
    }),

    setViewMode: (mode) => set((state) => {
        let zoom = state.zoomLevel;
        if (mode === 'Month') zoom = 0;
        if (mode === 'Week') zoom = 1;
        if (mode === 'Day') zoom = 2;

        const { viewport } = state;
        const newScale = ZOOM_SCALES[zoom];
        const safeScale = viewport.scale || 0.00000001;

        const visibleStartTime = viewport.startDate + (viewport.scrollX / safeScale);
        let newScrollX = (visibleStartTime - viewport.startDate) * newScale;
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
        const safeScale = viewport.scale || 0.00000001;

        const visibleStartTime = viewport.startDate + (viewport.scrollX / safeScale);
        let newScrollX = (visibleStartTime - viewport.startDate) * newScale;
        if (newScrollX < 0) newScrollX = 0;

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

    setGroupByProject: (grouped) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(filteredTasks, grouped, state.projectExpansion, state.taskExpansion, state.sortConfig);
        return {
            groupByProject: grouped,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    toggleProjectExpansion: (projectId) => set((state) => {
        const projectExpansion = { ...state.projectExpansion, [projectId]: !(state.projectExpansion[projectId] ?? true) };
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(filteredTasks, state.groupByProject, projectExpansion, state.taskExpansion, state.sortConfig);
        return {
            projectExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    toggleTaskExpansion: (taskId: string) => set((state) => {
        const taskExpansion = { ...state.taskExpansion, [taskId]: !(state.taskExpansion[taskId] ?? true) };
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(filteredTasks, state.groupByProject, state.projectExpansion, taskExpansion, state.sortConfig);
        return {
            taskExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    setFilterText: (text) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, text, state.selectedAssigneeIds);
        const layout = buildLayout(filteredTasks, state.groupByProject, state.projectExpansion, state.taskExpansion, state.sortConfig);
        return {
            filterText: text,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    setSelectedAssigneeIds: (ids) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, state.filterText, ids);
        const layout = buildLayout(filteredTasks, state.groupByProject, state.projectExpansion, state.taskExpansion, state.sortConfig);
        return {
            selectedAssigneeIds: ids,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    scrollToTask: (taskId: string) => set((state) => {
        const targetTask = state.tasks.find(t => t.id === taskId)
            ?? state.allTasks.find(t => t.id === taskId);
        if (!targetTask) return state;

        let targetMetadata = 0;
        if (Number.isFinite(targetTask.startDate)) {
            targetMetadata = targetTask.startDate!;
        } else if (Number.isFinite(targetTask.dueDate)) {
            targetMetadata = targetTask.dueDate!;
        } else {
            targetMetadata = Date.now();
        }

        let { viewport } = state;

        if (targetMetadata < viewport.startDate) {
            const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
            const newStartDate = targetMetadata - ONE_WEEK;
            viewport = {
                ...viewport,
                startDate: newStartDate
            };
        }

        const taskX = (targetMetadata - viewport.startDate) * viewport.scale;
        const centeredX = Math.max(0, taskX - (viewport.width / 2));

        return {
            viewport: { ...viewport, scrollX: centeredX }
        };
    }),

    setSortConfig: (key) => set((state) => {
        let newSort: TaskState['sortConfig'] = null;
        if (key === null) {
            newSort = null;
        } else {
            if (state.sortConfig?.key === key) {
                newSort = { key, direction: state.sortConfig.direction === 'asc' ? 'desc' : 'asc' };
            } else {
                newSort = { key, direction: 'asc' };
            }
        }

        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(filteredTasks, state.groupByProject, state.projectExpansion, state.taskExpansion, newSort);

        return {
            sortConfig: newSort,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    refreshData: async () => {
        const { apiClient } = await import('../api/client');
        const data = await apiClient.fetchData();
        const { setTasks, setRelations } = useTaskStore.getState();
        setTasks(data.tasks);
        setRelations(data.relations);
    }
}));
