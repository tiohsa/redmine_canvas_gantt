import { create } from 'zustand';
import type { Task, Relation, Viewport, ViewMode, ZoomLevel, LayoutRow } from '../types';
import { ZOOM_SCALES } from '../utils/grid';
import { TaskLogicService } from '../services/TaskLogicService';
import { loadPreferences } from '../utils/preferences';
import { getMaxFiniteDueDate } from '../utils/taskRange';

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
    organizeByDependency: boolean;
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
    setOrganizeByDependency: (enabled: boolean) => void;
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
    relations: Relation[],
    groupByProject: boolean,
    organizeByDependency: boolean,
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

    const componentMap = organizeByDependency ? buildDependencyComponents(normalizedTasks, relations) : null;

    if (organizeByDependency && componentMap) {
        projectRoots.forEach((roots) => {
            const rootIndex = new Map(roots.map((id, index) => [id, index]));
            const componentOrder = new Map<string, number>();
            let order = 0;

            roots.forEach((id) => {
                const component = componentMap.get(id) ?? id;
                if (!componentOrder.has(component)) {
                    componentOrder.set(component, order);
                    order += 1;
                }
            });

            roots.sort((a, b) => {
                const componentA = componentMap.get(a) ?? a;
                const componentB = componentMap.get(b) ?? b;
                const orderA = componentOrder.get(componentA) ?? 0;
                const orderB = componentOrder.get(componentB) ?? 0;
                if (orderA !== orderB) return orderA - orderB;
                return (rootIndex.get(a) ?? 0) - (rootIndex.get(b) ?? 0);
            });
        });
    }

    const orderedProjects = Array.from(projectRoots.keys()).sort((a, b) => (projectOrder.get(a) ?? 0) - (projectOrder.get(b) ?? 0));

    let rowIndex = 0;
    const arrangedTasks: Task[] = [];
    const layoutRows: LayoutRow[] = [];

    const traverse = (taskId: string, depth: number, hiddenByAncestor: boolean, guides: boolean[], isLast: boolean) => {
        const node = nodeMap.get(taskId);
        if (!node) return;

        const isExpanded = taskExpansion[taskId] ?? true;
        const shouldHideChildren = hiddenByAncestor || !isExpanded;

        if (!hiddenByAncestor) {
            const taskWithLayout: Task = {
                ...node.task,
                indentLevel: depth,
                rowIndex,
                treeLevelGuides: guides,
                isLastChild: isLast
            };
            arrangedTasks.push(taskWithLayout);
            layoutRows.push({ type: 'task', taskId: taskWithLayout.id, rowIndex });
            rowIndex += 1;
        }

        const childGuides = [...guides, !isLast];
        node.children.forEach((childId, idx) => {
            const isChildLast = idx === node.children.length - 1;
            traverse(childId, depth + 1, shouldHideChildren, childGuides, isChildLast);
        });
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
        roots.forEach((rootId, idx) => {
            const isLast = idx === roots.length - 1;
            traverse(rootId, 0, hideDescendants, [], isLast);
        });
    });

    return { tasks: arrangedTasks, layoutRows, rowCount: rowIndex };
};

const applyFilters = (tasks: Task[], filterText: string, selectedAssigneeIds: (number | null)[]) => {
    const lowerText = filterText.toLowerCase();
    const hasTextFilter = Boolean(lowerText);
    const hasAssigneeFilter = selectedAssigneeIds.length > 0;

    if (!hasTextFilter && !hasAssigneeFilter) {
        return tasks;
    }

    const matched = tasks.filter(t => {
        const matchesText = !hasTextFilter || t.subject.toLowerCase().includes(lowerText);
        const taskAssignee = t.assignedToId === undefined ? null : t.assignedToId;
        const matchesAssignee = !hasAssigneeFilter || selectedAssigneeIds.includes(taskAssignee);
        return matchesText && matchesAssignee;
    });

    if (matched.length === 0) return [];

    const taskById = new Map(tasks.map(task => [task.id, task]));
    const visibleIds = new Set<string>();

    matched.forEach(task => {
        visibleIds.add(task.id);

        let currentParentId = task.parentId;
        while (currentParentId && taskById.has(currentParentId)) {
            visibleIds.add(currentParentId);
            currentParentId = taskById.get(currentParentId)?.parentId;
        }
    });

    return tasks.filter(task => visibleIds.has(task.id));
};

const computeCenteredViewport = (viewport: Viewport, newScale: number, tasksMaxDue: number | null): { scrollX: number; startDate: number } => {
    const safeScale = viewport.scale || 0.00000001;
    const centerDate = viewport.startDate + (viewport.scrollX + viewport.width / 2) / safeScale;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const paddingMs = 60 * ONE_DAY;

    // Calculate the ideal scrollX to center on centerDate
    let nextScrollX = (centerDate - viewport.startDate) * newScale - viewport.width / 2;
    let nextStartDate = viewport.startDate;

    // If scrollX would be negative, we need to shift startDate earlier
    if (nextScrollX < 0) {
        // Calculate how much earlier startDate needs to be
        const shortfallMs = -nextScrollX / newScale;
        // Add some buffer (2 weeks) to avoid edge cases
        nextStartDate = viewport.startDate - shortfallMs - 14 * ONE_DAY;
        // Recalculate scrollX with the new startDate
        nextScrollX = (centerDate - nextStartDate) * newScale - viewport.width / 2;
    }

    // Calculate max scroll based on task range
    const visibleMs = viewport.width / newScale;
    const minRangeEnd = centerDate + visibleMs / 2;
    const rangeEnd = Math.max(tasksMaxDue ?? minRangeEnd, minRangeEnd) + paddingMs;
    const maxScrollX = Math.max(0, (rangeEnd - nextStartDate) * newScale - viewport.width);

    if (nextScrollX > maxScrollX) nextScrollX = maxScrollX;
    if (nextScrollX < 0) nextScrollX = 0;

    console.log('[computeCenteredViewport] Result:', {
        centerDate: new Date(centerDate).toISOString(),
        startDateChanged: nextStartDate !== viewport.startDate,
        nextScrollX
    });

    return { scrollX: nextScrollX, startDate: nextStartDate };
};

const buildDependencyComponents = (tasks: Task[], relations: Relation[]): Map<string, string> => {
    const parent = new Map<string, string>();
    tasks.forEach(task => parent.set(task.id, task.id));

    const find = (id: string): string => {
        const stored = parent.get(id);
        if (!stored) return id;
        if (stored !== id) {
            const root = find(stored);
            parent.set(id, root);
            return root;
        }
        return stored;
    };

    const union = (a: string, b: string) => {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA === rootB) return;
        parent.set(rootB, rootA);
    };

    relations.forEach((rel) => {
        if (!parent.has(rel.from) || !parent.has(rel.to)) return;
        union(rel.from, rel.to);
    });

    tasks.forEach((task) => {
        if (!task.parentId) return;
        if (!parent.has(task.parentId)) return;
        union(task.id, task.parentId);
    });

    const components = new Map<string, string>();
    tasks.forEach((task) => {
        components.set(task.id, find(task.id));
    });

    return components;
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
    organizeByDependency: preferences.organizeByDependency ?? false,
    viewportFromStorage: Boolean(preferences.viewport),
    selectedTaskId: null,
    hoveredTaskId: null,
    contextMenu: null,
    projectExpansion: {},
    taskExpansion: {},
    filterText: '',
    selectedAssigneeIds: preferences.selectedAssigneeIds ?? [],
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
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.groupByProject,
            state.organizeByDependency,
            projectExpansion,
            taskExpansion,
            state.sortConfig
        );

        return {
            allTasks: tasks,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount,
            projectExpansion,
            taskExpansion
        };
    }),
    setRelations: (relations) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(
            filteredTasks,
            relations,
            state.groupByProject,
            state.organizeByDependency,
            state.projectExpansion,
            state.taskExpansion,
            state.sortConfig
        );
        return {
            relations,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    addRelation: (relation) => set((state) => {
        const exists = state.relations.some(r => r.from === relation.from && r.to === relation.to && r.type === relation.type);
        if (exists) return state;
        const nextRelations = [...state.relations, relation];
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(
            filteredTasks,
            nextRelations,
            state.groupByProject,
            state.organizeByDependency,
            state.projectExpansion,
            state.taskExpansion,
            state.sortConfig
        );
        return {
            relations: nextRelations,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    removeRelation: (relationId) => set((state) => {
        const nextRelations = state.relations.filter(r => r.id !== relationId);
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(
            filteredTasks,
            nextRelations,
            state.groupByProject,
            state.organizeByDependency,
            state.projectExpansion,
            state.taskExpansion,
            state.sortConfig
        );
        return {
            relations: nextRelations,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
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
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.groupByProject,
            state.organizeByDependency,
            state.projectExpansion,
            state.taskExpansion,
            state.sortConfig
        );

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
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.groupByProject,
            state.organizeByDependency,
            state.projectExpansion,
            state.taskExpansion,
            state.sortConfig
        );
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
        const tasksMaxDue = getMaxFiniteDueDate(state.allTasks);
        const adjustment = computeCenteredViewport(viewport, newScale, tasksMaxDue);

        return {
            viewMode: mode,
            zoomLevel: zoom,
            viewport: { ...state.viewport, scale: newScale, scrollX: adjustment.scrollX, startDate: adjustment.startDate }
        };
    }),

    setZoomLevel: (level) => set((state) => {
        const { viewport } = state;
        const newScale = ZOOM_SCALES[level];
        const tasksMaxDue = getMaxFiniteDueDate(state.allTasks);
        const adjustment = computeCenteredViewport(viewport, newScale, tasksMaxDue);

        let mode: ViewMode = 'Week';
        if (level === 0) mode = 'Month';
        if (level === 1) mode = 'Week';
        if (level === 2) mode = 'Day';

        return {
            zoomLevel: level,
            viewMode: mode,
            viewport: { ...state.viewport, scale: newScale, scrollX: adjustment.scrollX, startDate: adjustment.startDate }
        };
    }),

    setGroupByProject: (grouped) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            grouped,
            state.organizeByDependency,
            state.projectExpansion,
            state.taskExpansion,
            state.sortConfig
        );
        return {
            groupByProject: grouped,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    setOrganizeByDependency: (enabled) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.groupByProject,
            enabled,
            state.projectExpansion,
            state.taskExpansion,
            state.sortConfig
        );
        return {
            organizeByDependency: enabled,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    toggleProjectExpansion: (projectId) => set((state) => {
        const projectExpansion = { ...state.projectExpansion, [projectId]: !(state.projectExpansion[projectId] ?? true) };
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.groupByProject,
            state.organizeByDependency,
            projectExpansion,
            state.taskExpansion,
            state.sortConfig
        );
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
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.groupByProject,
            state.organizeByDependency,
            state.projectExpansion,
            taskExpansion,
            state.sortConfig
        );
        return {
            taskExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    setFilterText: (text) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, text, state.selectedAssigneeIds);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.groupByProject,
            state.organizeByDependency,
            state.projectExpansion,
            state.taskExpansion,
            state.sortConfig
        );
        return {
            filterText: text,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    setSelectedAssigneeIds: (ids) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, state.filterText, ids);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.groupByProject,
            state.organizeByDependency,
            state.projectExpansion,
            state.taskExpansion,
            state.sortConfig
        );
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
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.groupByProject,
            state.organizeByDependency,
            state.projectExpansion,
            state.taskExpansion,
            newSort
        );

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
