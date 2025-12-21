import { create } from 'zustand';
import type { Task, Relation, Viewport, ViewMode, ZoomLevel, LayoutRow, Version } from '../types';
import { ZOOM_SCALES } from '../utils/grid';
import { TaskLogicService } from '../services/TaskLogicService';
import { loadPreferences } from '../utils/preferences';
import { getMaxFiniteDueDate } from '../utils/taskRange';

interface TaskState {
    allTasks: Task[];
    tasks: Task[];
    relations: Relation[];
    versions: Version[];
    viewport: Viewport;
    viewMode: ViewMode;
    zoomLevel: ZoomLevel;
    layoutRows: LayoutRow[];
    rowCount: number;
    groupByProject: boolean;
    showVersions: boolean;
    organizeByDependency: boolean;
    viewportFromStorage: boolean;
    selectedTaskId: string | null;
    hoveredTaskId: string | null;
    contextMenu: { x: number; y: number; taskId: string } | null;
    projectExpansion: Record<string, boolean>;
    versionExpansion: Record<string, boolean>;
    taskExpansion: Record<string, boolean>;
    filterText: string;
    selectedAssigneeIds: (number | null)[];
    selectedProjectIds: string[];
    selectedVersionIds: string[];

    sortConfig: { key: keyof Task; direction: 'asc' | 'desc' } | null;
    customScales: Record<number, number>;

    currentProjectId: string | null;
    showSubprojects: boolean;

    // Actions
    setTasks: (tasks: Task[]) => void;
    setRelations: (relations: Relation[]) => void;
    setVersions: (versions: Version[]) => void;
    setShowVersions: (show: boolean) => void;
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
    setShowSubprojects: (enabled: boolean) => void;
    setCurrentProjectId: (id: string) => void;
    toggleProjectExpansion: (projectId: string) => void;
    toggleVersionExpansion: (versionId: string) => void;
    toggleTaskExpansion: (taskId: string) => void;
    toggleAllExpansion: () => void;
    expandAll: () => void;
    collapseAll: () => void;

    setFilterText: (text: string) => void;
    setSelectedAssigneeIds: (ids: (number | null)[]) => void;
    setSelectedProjectIds: (ids: string[]) => void;
    setSelectedVersionIds: (ids: string[]) => void;
    scrollToTask: (taskId: string) => void;
    setSortConfig: (key: keyof Task | null) => void;
    refreshData: () => Promise<void>;
}

const preferences = loadPreferences();

const DEFAULT_VIEWPORT: Viewport = {
    startDate: preferences.viewport?.startDate ?? new Date().setFullYear(new Date().getFullYear() - 1),
    scrollX: preferences.viewport?.scrollX ?? 0,
    scrollY: preferences.viewport?.scrollY ?? 0,
    scale: preferences.viewport?.scale ?? preferences.customScales?.[preferences.zoomLevel ?? 1] ?? ZOOM_SCALES[preferences.zoomLevel ?? 1],
    width: 800,
    height: 600,
    rowHeight: Number((window as any).RedmineCanvasGantt?.settings?.row_height) || 36
};

const buildLayout = (
    tasks: Task[],
    relations: Relation[],
    versions: Version[],
    groupByProject: boolean,
    showVersions: boolean,
    organizeByDependency: boolean,
    projectExpansion: Record<string, boolean>,
    versionExpansion: Record<string, boolean>,
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
            // Find min/max dates for this project to draw the summary bar
            let pStart: number | undefined;
            let pDue: number | undefined;

            // We iterate all tasks belonging to this project in nodeMap
            nodeMap.forEach(node => {
                if (node.task.projectId === projectId) {
                    const ts = node.task.startDate;
                    const td = node.task.dueDate;
                    if (Number.isFinite(ts)) {
                        pStart = pStart === undefined ? ts : Math.min(pStart, ts);
                    }
                    if (Number.isFinite(td)) {
                        pDue = pDue === undefined ? td : Math.max(pDue, td);
                    }
                }
            });

            layoutRows.push({
                type: 'header',
                projectId,
                projectName,
                rowIndex,
                startDate: pStart,
                dueDate: pDue
            });
            rowIndex += 1;
        }

        const hideDescendants = groupByProject ? !expanded : false;

        if (groupByProject && showVersions) {
            const versionMap = new Map<string | undefined, string[]>();
            roots.forEach(rootId => {
                const t = nodeMap.get(rootId)?.task;
                const vId = t?.fixedVersionId;
                const key = vId || undefined;
                if (!versionMap.has(key)) versionMap.set(key, []);
                versionMap.get(key)?.push(rootId);
            });

            const usedVersionIds = new Set<string>();
            versionMap.forEach((_, vId) => {
                if (vId) usedVersionIds.add(String(vId));
            });

            const projectVersions = versions.filter(v => usedVersionIds.has(v.id));
            projectVersions.sort((a, b) => (a.effectiveDate - b.effectiveDate));

            projectVersions.forEach(v => {
                const vRoots = versionMap.get(v.id) || [];
                const vExpanded = versionExpansion[v.id] ?? true;

                let vStart = v.startDate;
                if (!Number.isFinite(vStart)) {
                    if (vRoots.length > 0) {
                        let minS = Infinity;
                        vRoots.forEach(rid => {
                            const t = nodeMap.get(rid)?.task;
                            if (t && Number.isFinite(t.startDate)) minS = Math.min(minS, t.startDate);
                        });
                        if (minS !== Infinity) vStart = minS;
                        else vStart = v.effectiveDate;
                    } else {
                        vStart = v.effectiveDate;
                    }
                }

                if (!hideDescendants) {
                    layoutRows.push({
                        type: 'version',
                        id: v.id,
                        name: v.name,
                        rowIndex,
                        startDate: vStart,
                        dueDate: v.effectiveDate,
                        ratioDone: v.ratioDone,
                        projectId
                    });
                    rowIndex += 1;
                }

                const hideVersionChildren = hideDescendants || !vExpanded;
                vRoots.forEach((rootId, idx) => {
                    const isLast = idx === vRoots.length - 1;
                    traverse(rootId, 0, hideVersionChildren, [], isLast);
                });

                versionMap.delete(v.id);
            });

            // Render remaining roots (those with no version, or versions not found in the metadata)
            const remainingEntries = Array.from(versionMap.entries());
            remainingEntries.forEach(([_vId, vRoots], entryIdx) => {
                const isLastEntry = entryIdx === remainingEntries.length - 1;
                vRoots.forEach((rootId, idx) => {
                    const isLast = isLastEntry && (idx === vRoots.length - 1);
                    traverse(rootId, 0, hideDescendants, [], isLast);
                });
            });
        } else {
            roots.forEach((rootId, idx) => {
                const isLast = idx === roots.length - 1;
                traverse(rootId, 0, hideDescendants, [], isLast);
            });
        }
    });

    return { tasks: arrangedTasks, layoutRows, rowCount: rowIndex };
};

const applyFilters = (
    tasks: Task[],
    filterText: string,
    selectedAssigneeIds: (number | null)[],
    selectedProjectIds: string[],
    selectedVersionIds: string[],
    showSubprojects: boolean = true,
    currentProjectId: string | null = null
) => {
    const lowerText = filterText.toLowerCase();
    const hasTextFilter = Boolean(lowerText);
    const hasAssigneeFilter = selectedAssigneeIds.length > 0;
    const hasProjectFilter = selectedProjectIds.length > 0;
    const hasVersionFilter = selectedVersionIds.length > 0;
    const hasSubprojectFilter = !showSubprojects && currentProjectId !== null;

    if (!hasTextFilter && !hasAssigneeFilter && !hasProjectFilter && !hasVersionFilter && !hasSubprojectFilter) {
        return tasks;
    }

    const matched = tasks.filter(t => {
        const matchesText = !hasTextFilter || t.subject.toLowerCase().includes(lowerText);
        const taskAssignee = t.assignedToId === undefined ? null : t.assignedToId;
        const matchesAssignee = !hasAssigneeFilter || selectedAssigneeIds.includes(taskAssignee);
        const matchesProject = !hasProjectFilter || (t.projectId && selectedProjectIds.includes(t.projectId));
        const matchesVersion = !hasVersionFilter || (t.fixedVersionId && selectedVersionIds.includes(t.fixedVersionId));
        const matchesSubproject = !hasSubprojectFilter || t.projectId === currentProjectId;
        return matchesText && matchesAssignee && matchesProject && matchesVersion && matchesSubproject;
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
    versions: [],
    viewport: DEFAULT_VIEWPORT,
    viewMode: preferences.viewMode ?? 'Week',
    zoomLevel: preferences.zoomLevel ?? 1,
    layoutRows: [],
    rowCount: 0,
    groupByProject: preferences.groupByProject ?? true,
    showVersions: preferences.showVersions ?? true,
    organizeByDependency: preferences.organizeByDependency ?? false,
    viewportFromStorage: Boolean(preferences.viewport),
    selectedTaskId: null,
    hoveredTaskId: null,
    contextMenu: null,
    projectExpansion: {},
    versionExpansion: {},
    taskExpansion: {},
    filterText: '',
    selectedAssigneeIds: preferences.selectedAssigneeIds ?? [],
    selectedProjectIds: [],
    selectedVersionIds: [],
    sortConfig: null,
    customScales: preferences.customScales ?? {},
    currentProjectId: (window as any).RedmineCanvasGantt?.projectId?.toString() || null,
    showSubprojects: true,

    setTasks: (tasks) => set((state) => {
        const projectExpansion = { ...state.projectExpansion };
        const taskExpansion = { ...state.taskExpansion };
        const versionExpansion = { ...state.versionExpansion };

        tasks.forEach((task) => {
            const projectId = task.projectId ?? 'default_project';
            if (projectExpansion[projectId] === undefined) projectExpansion[projectId] = true;
            if (taskExpansion[task.id] === undefined) taskExpansion[task.id] = true;
            if (task.fixedVersionId && versionExpansion[task.fixedVersionId] === undefined) versionExpansion[task.fixedVersionId] = true;
        });

        const filteredTasks = applyFilters(tasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            projectExpansion,
            versionExpansion,
            taskExpansion,
            state.sortConfig
        );

        return {
            allTasks: tasks,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount,
            projectExpansion,
            versionExpansion,
            taskExpansion
        };
    }),
    setRelations: (relations) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
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
    setVersions: (versions) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
            state.taskExpansion,
            state.sortConfig
        );
        return {
            versions,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    setShowVersions: (show) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            show,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
            state.taskExpansion,
            state.sortConfig
        );
        return {
            showVersions: show,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    addRelation: (relation) => set((state) => {
        const exists = state.relations.some(r => r.from === relation.from && r.to === relation.to && r.type === relation.type);
        if (exists) return state;
        const nextRelations = [...state.relations, relation];
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            nextRelations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
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
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            nextRelations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
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

        const filteredTasks = applyFilters(finalTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
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
        const filteredTasks = applyFilters(finalTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
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

        const nextState: Partial<TaskState> = {
            viewport: { ...nextViewport, scrollY: nextScrollY }
        };

        // If scale changed (e.g. CTRL+wheel), persist it to customScales for current level
        if (updates.scale !== undefined && updates.scale !== state.viewport.scale) {
            nextState.customScales = {
                ...state.customScales,
                [state.zoomLevel]: updates.scale
            };
        }

        return nextState;
    }),

    setViewMode: (mode) => set((state) => {
        let zoom = state.zoomLevel;
        if (mode === 'Month') zoom = 0;
        if (mode === 'Week') zoom = 1;
        if (mode === 'Day') zoom = 2;

        const { viewport, customScales } = state;
        const newScale = customScales[zoom] ?? ZOOM_SCALES[zoom];
        const tasksMaxDue = getMaxFiniteDueDate(state.allTasks);
        const adjustment = computeCenteredViewport(viewport, newScale, tasksMaxDue);

        return {
            viewMode: mode,
            zoomLevel: zoom,
            viewport: { ...state.viewport, scale: newScale, scrollX: adjustment.scrollX, startDate: adjustment.startDate }
        };
    }),

    setZoomLevel: (level) => set((state) => {
        const { viewport, customScales } = state;
        const newScale = customScales[level] ?? ZOOM_SCALES[level];
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
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            grouped,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
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
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            enabled,
            state.projectExpansion,
            state.versionExpansion,
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

    setShowSubprojects: (enabled) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, enabled, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
            state.taskExpansion,
            state.sortConfig
        );
        return {
            showSubprojects: enabled,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    setCurrentProjectId: (id) => set({ currentProjectId: id }),

    toggleProjectExpansion: (projectId) => set((state) => {
        const projectExpansion = { ...state.projectExpansion, [projectId]: !(state.projectExpansion[projectId] ?? true) };
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            projectExpansion,
            state.versionExpansion,
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

    toggleVersionExpansion: (versionId) => set((state) => {
        const versionExpansion = { ...state.versionExpansion, [versionId]: !(state.versionExpansion[versionId] ?? true) };
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            versionExpansion,
            state.taskExpansion,
            state.sortConfig
        );
        return {
            versionExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    toggleTaskExpansion: (taskId: string) => set((state) => {
        const taskExpansion = { ...state.taskExpansion, [taskId]: !(state.taskExpansion[taskId] ?? true) };
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
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

    toggleAllExpansion: () => set((state) => {
        // Check if anything is collapsed. If so, expand all. Otherwise, collapse all.
        const anyProjectCollapsed = state.groupByProject &&
            Object.keys(state.projectExpansion).length > 0 &&
            Object.values(state.projectExpansion).some(v => v === false);

        const anyVersionCollapsed = state.showVersions &&
            Object.keys(state.versionExpansion).length > 0 &&
            Object.values(state.versionExpansion).some(v => v === false);

        const anyTaskCollapsed = state.tasks.some(t => t.hasChildren && state.taskExpansion[t.id] === false);

        const shouldExpand = anyProjectCollapsed || anyVersionCollapsed || anyTaskCollapsed;

        const projectExpansion: Record<string, boolean> = {};
        const versionExpansion: Record<string, boolean> = {};
        const taskExpansion: Record<string, boolean> = {};

        state.allTasks.forEach((task) => {
            const projectId = task.projectId ?? 'default_project';
            projectExpansion[projectId] = shouldExpand;
            taskExpansion[task.id] = shouldExpand;
            if (task.fixedVersionId) versionExpansion[task.fixedVersionId] = shouldExpand;
        });

        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            projectExpansion,
            versionExpansion,
            taskExpansion,
            state.sortConfig
        );

        return {
            projectExpansion,
            versionExpansion,
            taskExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    expandAll: () => set((state) => {
        const projectExpansion: Record<string, boolean> = {};
        const versionExpansion: Record<string, boolean> = {};
        const taskExpansion: Record<string, boolean> = {};

        state.allTasks.forEach((task) => {
            const projectId = task.projectId ?? 'default_project';
            projectExpansion[projectId] = true;
            taskExpansion[task.id] = true;
            if (task.fixedVersionId) versionExpansion[task.fixedVersionId] = true;
        });

        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            projectExpansion,
            versionExpansion,
            taskExpansion,
            state.sortConfig
        );

        return {
            projectExpansion,
            versionExpansion,
            taskExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    collapseAll: () => set((state) => {
        const projectExpansion: Record<string, boolean> = {};
        const versionExpansion: Record<string, boolean> = {};
        const taskExpansion: Record<string, boolean> = {};

        state.allTasks.forEach((task) => {
            const projectId = task.projectId ?? 'default_project';
            projectExpansion[projectId] = false;
            taskExpansion[task.id] = false;
            if (task.fixedVersionId) versionExpansion[task.fixedVersionId] = false;
        });

        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            projectExpansion,
            versionExpansion,
            taskExpansion,
            state.sortConfig
        );

        return {
            projectExpansion,
            versionExpansion,
            taskExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    setFilterText: (text) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, text, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
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
        const filteredTasks = applyFilters(state.allTasks, state.filterText, ids, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
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

    setSelectedProjectIds: (ids) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, ids, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
            state.taskExpansion,
            state.sortConfig
        );
        return {
            selectedProjectIds: ids,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    setSelectedVersionIds: (ids) => set((state) => {
        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, ids, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
            state.taskExpansion,
            state.sortConfig
        );
        return {
            selectedVersionIds: ids,
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

        const filteredTasks = applyFilters(state.allTasks, state.filterText, state.selectedAssigneeIds, state.selectedProjectIds, state.selectedVersionIds, state.showSubprojects, state.currentProjectId);
        const layout = buildLayout(
            filteredTasks,
            state.relations,
            state.versions,
            state.groupByProject,
            state.showVersions,
            state.organizeByDependency,
            state.projectExpansion,
            state.versionExpansion,
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
        const { setTasks, setRelations, setVersions } = useTaskStore.getState();
        setTasks(data.tasks);
        setRelations(data.relations);
        setVersions(data.versions);
    }
}));
