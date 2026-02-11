import { create } from 'zustand';
import type { Task, Relation, Viewport, ViewMode, ZoomLevel, LayoutRow, Version, TaskStatus } from '../types';
import { ZOOM_SCALES } from '../utils/grid';
import { TaskLogicService } from '../services/TaskLogicService';
import { loadPreferences, savePreferences } from '../utils/preferences';
import { getMaxFiniteDueDate } from '../utils/taskRange';
import { i18n } from '../utils/i18n';
import { useUIStore } from './UIStore';

type SortConfig = { key: keyof Task; direction: 'asc' | 'desc' } | null;

interface TaskState {
    allTasks: Task[];
    tasks: Task[];
    relations: Relation[];
    versions: Version[];
    taskStatuses: TaskStatus[];
    selectedStatusIds: number[];
    viewport: Viewport;
    viewMode: ViewMode;
    zoomLevel: ZoomLevel;
    layoutRows: LayoutRow[];
    rowCount: number;
    groupByProject: boolean;
    groupByAssignee: boolean;
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

    sortConfig: SortConfig;
    customScales: Record<number, number>;

    currentProjectId: string | null;
    showSubprojects: boolean;

    isSortingSuspended: boolean;
    modifiedTaskIds: Set<string>;
    autoSave: boolean;

    // Actions
    setAutoSave: (enabled: boolean) => void;
    setTasks: (tasks: Task[]) => void;
    setRelations: (relations: Relation[]) => void;
    setVersions: (versions: Version[]) => void;
    setTaskStatuses: (statuses: TaskStatus[]) => void;
    setSelectedStatusFromServer: (ids: number[]) => void;
    setShowVersions: (show: boolean) => void;
    addRelation: (relation: Relation) => void;
    removeRelation: (relationId: string) => void;
    selectTask: (id: string | null) => void;
    setHoveredTask: (id: string | null) => void;
    setContextMenu: (menu: { x: number; y: number; taskId: string } | null) => void;
    updateTask: (id: string, updates: Partial<Task>) => void;
    removeTask: (id: string) => void;
    updateViewport: (updates: Partial<Viewport>) => void;
    setRowHeight: (height: number) => void;
    setViewMode: (mode: ViewMode) => void;
    setZoomLevel: (level: ZoomLevel) => void;
    setGroupByProject: (grouped: boolean) => void;
    setGroupByAssignee: (grouped: boolean) => void;
    setOrganizeByDependency: (enabled: boolean) => void;
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
    setSortingSuspended: (suspended: boolean) => void;
    saveChanges: () => Promise<void>;
    discardChanges: () => Promise<void>;
}

const preferences = loadPreferences();

const DEFAULT_VIEWPORT: Viewport = {
    startDate: preferences.viewport?.startDate ?? new Date().setFullYear(new Date().getFullYear() - 1),
    scrollX: preferences.viewport?.scrollX ?? 0,
    scrollY: preferences.viewport?.scrollY ?? 0,
    scale: preferences.viewport?.scale ?? preferences.customScales?.[preferences.zoomLevel ?? 1] ?? ZOOM_SCALES[preferences.zoomLevel ?? 1],
    width: 800,
    height: 600,
    rowHeight: preferences.rowHeight ?? (Number(window.RedmineCanvasGantt?.settings?.row_height) || 36)
};

type LayoutState = {
    allTasks: Task[];
    relations: Relation[];
    versions: Version[];
    groupByProject: boolean;
    groupByAssignee: boolean;
    showVersions: boolean;
    organizeByDependency: boolean;
    projectExpansion: Record<string, boolean>;
    versionExpansion: Record<string, boolean>;
    taskExpansion: Record<string, boolean>;
    selectedVersionIds: string[];
    selectedProjectIds: string[];
    sortConfig: SortConfig;
    filterText: string;
    selectedAssigneeIds: (number | null)[];
    showSubprojects: boolean;
    currentProjectId: string | null;
};

const buildLayout = (
    tasks: Task[],
    relations: Relation[],
    versions: Version[],
    groupByProject: boolean,
    groupByAssignee: boolean,
    showVersions: boolean,
    organizeByDependency: boolean,
    projectExpansion: Record<string, boolean>,
    versionExpansion: Record<string, boolean>,
    taskExpansion: Record<string, boolean>,
    _selectedVersionIds: string[],
    selectedProjectIds: string[],
    sortConfig: SortConfig,
    allTasks: Task[]
): { tasks: Task[]; layoutRows: LayoutRow[]; rowCount: number } => {
    const ASSIGNEE_GROUP_PREFIX = 'assignee:';
    const UNASSIGNED_GROUP_ID = 'none';
    const groupingMode: 'none' | 'project' | 'assignee' = groupByAssignee ? 'assignee' : (groupByProject ? 'project' : 'none');

    const toAssigneeId = (task: Task) => (task.assignedToId === undefined || task.assignedToId === null ? UNASSIGNED_GROUP_ID : String(task.assignedToId));
    const toAssigneeGroupKey = (assigneeId: string) => `${ASSIGNEE_GROUP_PREFIX}${assigneeId}`;
    const toGroupKey = (task: Task) => {
        if (groupingMode === 'project') return task.projectId ?? 'default_project';
        if (groupingMode === 'assignee') return toAssigneeGroupKey(toAssigneeId(task));
        return '_global';
    };
    const toHeaderKind = () => groupingMode === 'assignee' ? 'assignee' : 'project';

    const assigneeNameById = new Map<string, string>();
    assigneeNameById.set(UNASSIGNED_GROUP_ID, i18n.t('label_unassigned') || 'Unassigned');
    allTasks.forEach((task) => {
        if (task.assignedToId === undefined || task.assignedToId === null) return;
        assigneeNameById.set(String(task.assignedToId), task.assignedToName || `${i18n.t('field_assigned_to') || 'Assignee'} #${task.assignedToId}`);
    });

    const normalizedTasks = tasks.map((task) => ({ ...task, hasChildren: false }));

    const nodeMap = new Map<string, { task: Task; children: string[] }>();
    normalizedTasks.forEach((task) => nodeMap.set(task.id, { task, children: [] }));

    const groupOrder = new Map<string, number>();
    const groupRoots = new Map<string, string[]>();

    normalizedTasks.forEach((task, index) => {
        const groupKey = toGroupKey(task);
        if (!groupOrder.has(groupKey)) {
            groupOrder.set(groupKey, index);
        }

        let treatedAsChild = false;

        if (task.parentId && nodeMap.has(task.parentId)) {
            const parentNode = nodeMap.get(task.parentId);
            const sameGroup = parentNode && toGroupKey(parentNode.task) === groupKey;

            if (groupingMode === 'none' || sameGroup) {
                parentNode?.children.push(task.id);
                if (parentNode) {
                    parentNode.task.hasChildren = true;
                }
                treatedAsChild = true;
            }
        }

        if (!treatedAsChild) {
            if (!groupRoots.has(groupKey)) {
                groupRoots.set(groupKey, []);
            }
            groupRoots.get(groupKey)?.push(task.id);
        }
    });

    // Ensure selected projects are included even if they have no visible tasks
    if (groupingMode === 'project') {
        selectedProjectIds.forEach(pid => {
            if (!groupRoots.has(pid)) {
                groupRoots.set(pid, []);
                if (!groupOrder.has(pid)) {
                // If the project is not in the filtered tasks, we try to find its order from allTasks
                // Or just append it to the end
                    const originalTask = allTasks.find(t => t.projectId === pid);
                    if (originalTask) {
                    // We don't have a reliable index from filtered tasks, so we might just put it at the end
                    // or try to match displayOrder if possible. 
                    // For simplicity, let's append to the end.
                        groupOrder.set(pid, Number.MAX_SAFE_INTEGER);
                    } else {
                        groupOrder.set(pid, Number.MAX_SAFE_INTEGER);
                    }
                }
            }
        });
    }


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

    groupRoots.forEach((roots) => {
        sortTaskIds(roots);
    });

    const componentMap = organizeByDependency ? buildDependencyComponents(normalizedTasks, relations) : null;

    if (organizeByDependency && componentMap) {
        groupRoots.forEach((roots) => {
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

    // When not grouping, combine all roots and sort globally
    if (groupingMode === 'none' && sortConfig) {
        const allRoots: string[] = [];
        groupRoots.forEach((roots) => {
            allRoots.push(...roots);
        });
        sortTaskIds(allRoots);
        // Clear and refill with global order under a single "virtual" project
        groupRoots.clear();
        groupRoots.set('_global', allRoots);
    }

    const orderedGroups = Array.from(groupRoots.keys()).sort((a, b) => (groupOrder.get(a) ?? 0) - (groupOrder.get(b) ?? 0));

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

    orderedGroups.forEach((groupId) => {
        const roots = groupRoots.get(groupId) ?? [];

        let projectName = '';
        if (groupingMode === 'assignee') {
            const assigneeId = groupId.replace(ASSIGNEE_GROUP_PREFIX, '');
            projectName = assigneeNameById.get(assigneeId) || (i18n.t('label_unassigned') || 'Unassigned');
        } else {
            const projectNode = nodeMap.get(roots[0] ?? '');
            if (projectNode?.task.projectName) {
                projectName = projectNode.task.projectName;
            } else {
                for (const node of nodeMap.values()) {
                    if (node.task.projectId === groupId && node.task.projectName) {
                        projectName = node.task.projectName;
                        break;
                    }
                }
            }


            if (!projectName) {
                const t = allTasks.find(t => t.projectId === groupId && t.projectName);
                if (t && t.projectName) projectName = t.projectName;
            }

            if (!projectName) projectName = groupId === 'default_project' ? '' : groupId;
        }

        const expanded = projectExpansion[groupId] ?? true;
        const shouldShowVersions = showVersions;
        const shouldGroupByGroup = groupingMode !== 'none';

        if (shouldGroupByGroup) {
            let pStart: number | undefined;
            let pDue: number | undefined;

            nodeMap.forEach(node => {
                if (toGroupKey(node.task) === groupId) {
                    const ts = node.task.startDate;
                    const td = node.task.dueDate;
                    if (ts !== undefined && Number.isFinite(ts)) {
                        pStart = pStart === undefined ? ts : Math.min(pStart, ts);
                    }
                    if (td !== undefined && Number.isFinite(td)) {
                        pDue = pDue === undefined ? td : Math.max(pDue, td);
                    }
                }
            });

            layoutRows.push({
                type: 'header',
                projectId: groupId,
                projectName,
                groupKind: toHeaderKind(),
                rowIndex,
                startDate: pStart,
                dueDate: pDue
            });
            rowIndex += 1;
        }

        const hideDescendants = (shouldGroupByGroup && !expanded) ? true : false;

        if (shouldShowVersions) {
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
                            if (t && t.startDate !== undefined && Number.isFinite(t.startDate)) minS = Math.min(minS, t.startDate);
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
                        projectId: groupId
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
            remainingEntries.forEach(([, vRoots], entryIdx) => {
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
    const hasSubprojectFilter = !showSubprojects && currentProjectId !== null && !hasProjectFilter;

    if (!hasTextFilter && !hasAssigneeFilter && !hasProjectFilter && !hasVersionFilter && !hasSubprojectFilter) {
        return tasks;
    }

    const matched = tasks.filter(t => {
        const matchesText = !hasTextFilter || t.subject.toLowerCase().includes(lowerText);
        const taskAssignee = t.assignedToId === undefined ? null : t.assignedToId;
        const matchesAssignee = !hasAssigneeFilter || selectedAssigneeIds.includes(taskAssignee);
        const matchesProject = !hasProjectFilter || (t.projectId && selectedProjectIds.includes(t.projectId));
        const matchesVersion = !hasVersionFilter || (
            (selectedVersionIds.includes('_none') && !t.fixedVersionId) ||
            (t.fixedVersionId && selectedVersionIds.includes(t.fixedVersionId))
        );
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

const resolveLayoutState = (state: TaskState, overrides: Partial<LayoutState> = {}): LayoutState => ({
    allTasks: overrides.allTasks ?? state.allTasks,
    relations: overrides.relations ?? state.relations,
    versions: overrides.versions ?? state.versions,
    groupByProject: overrides.groupByProject ?? state.groupByProject,
    groupByAssignee: overrides.groupByAssignee ?? state.groupByAssignee,
    showVersions: overrides.showVersions ?? state.showVersions,
    organizeByDependency: overrides.organizeByDependency ?? state.organizeByDependency,
    projectExpansion: overrides.projectExpansion ?? state.projectExpansion,
    versionExpansion: overrides.versionExpansion ?? state.versionExpansion,
    taskExpansion: overrides.taskExpansion ?? state.taskExpansion,
    selectedVersionIds: overrides.selectedVersionIds ?? state.selectedVersionIds,
    selectedProjectIds: overrides.selectedProjectIds ?? state.selectedProjectIds,
    sortConfig: overrides.sortConfig ?? state.sortConfig,
    filterText: overrides.filterText ?? state.filterText,
    selectedAssigneeIds: overrides.selectedAssigneeIds ?? state.selectedAssigneeIds,
    showSubprojects: overrides.showSubprojects ?? state.showSubprojects,
    currentProjectId: overrides.currentProjectId ?? state.currentProjectId
});

const buildLayoutFromState = (state: TaskState, overrides: Partial<LayoutState> = {}) => {
    const layoutState = resolveLayoutState(state, overrides);
    const filteredTasks = applyFilters(
        layoutState.allTasks,
        layoutState.filterText,
        layoutState.selectedAssigneeIds,
        layoutState.selectedProjectIds,
        layoutState.selectedVersionIds,
        layoutState.showSubprojects,
        layoutState.currentProjectId
    );

    return buildLayout(
        filteredTasks,
        layoutState.relations,
        layoutState.versions,
        layoutState.groupByProject,
        layoutState.groupByAssignee,
        layoutState.showVersions,
        layoutState.organizeByDependency,
        layoutState.projectExpansion,
        layoutState.versionExpansion,
        layoutState.taskExpansion,
        layoutState.selectedVersionIds,
        layoutState.selectedProjectIds,
        layoutState.sortConfig,
        layoutState.allTasks
    );
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

export const useTaskStore = create<TaskState>((set, get) => ({
    allTasks: [],
    tasks: [],
    relations: [],
    versions: [],
    taskStatuses: [],
    selectedStatusIds: preferences.selectedStatusIds ?? [],
    viewport: DEFAULT_VIEWPORT,
    viewMode: preferences.viewMode ?? 'Week',
    zoomLevel: preferences.zoomLevel ?? 1,
    layoutRows: [],
    rowCount: 0,
    groupByProject: preferences.groupByProject ?? true,
    groupByAssignee: preferences.groupByAssignee ?? false,
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
    selectedProjectIds: preferences.selectedProjectIds ?? [],
    selectedVersionIds: preferences.selectedVersionIds ?? [],
    sortConfig: preferences.sortConfig !== undefined ? preferences.sortConfig : { key: 'startDate', direction: 'asc' },
    customScales: preferences.customScales ?? {},
    currentProjectId: window.RedmineCanvasGantt?.projectId?.toString() || null,
    showSubprojects: preferences.groupByProject ?? true,
    isSortingSuspended: false,
    modifiedTaskIds: new Set(),
    autoSave: false,

    setAutoSave: (enabled) => set({ autoSave: enabled }),

    setTasks: (tasks) => set((state) => {
        const projectExpansion = { ...state.projectExpansion };
        const taskExpansion = { ...state.taskExpansion };
        const versionExpansion = { ...state.versionExpansion };

        tasks.forEach((task) => {
            const projectId = task.projectId ?? 'default_project';
            if (projectExpansion[projectId] === undefined) projectExpansion[projectId] = true;
            const assigneeId = task.assignedToId === undefined || task.assignedToId === null ? 'none' : String(task.assignedToId);
            const assigneeGroupKey = `assignee:${assigneeId}`;
            if (projectExpansion[assigneeGroupKey] === undefined) projectExpansion[assigneeGroupKey] = true;
            if (taskExpansion[task.id] === undefined) taskExpansion[task.id] = true;
            if (task.fixedVersionId && versionExpansion[task.fixedVersionId] === undefined) versionExpansion[task.fixedVersionId] = true;
        });

        const layout = buildLayoutFromState(state, {
            allTasks: tasks,
            projectExpansion,
            versionExpansion,
            taskExpansion
        });

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
        const layout = buildLayoutFromState(state, { relations });
        return {
            relations,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    setVersions: (versions) => set((state) => {
        const layout = buildLayoutFromState(state, { versions });
        return {
            versions,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    setTaskStatuses: (statuses) => set(() => ({ taskStatuses: statuses })),
    setSelectedStatusFromServer: (ids) => {
        set({ selectedStatusIds: ids });
        get().refreshData();
    },
    setShowVersions: (show) => set((state) => {
        const layout = buildLayoutFromState(state, { showVersions: show });
        savePreferences({ showVersions: show });
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
        const layout = buildLayoutFromState(state, { relations: nextRelations });
        return {
            relations: nextRelations,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    removeRelation: (relationId) => set((state) => {
        const nextRelations = state.relations.filter(r => r.id !== relationId);
        const layout = buildLayoutFromState(state, { relations: nextRelations });
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
    setSortingSuspended: (suspended) => set((state) => {
        if (!suspended && state.isSortingSuspended) {
            // Turning it off -> trigger re-layout
            const layout = buildLayoutFromState(state);
            return {
                isSortingSuspended: false,
                tasks: layout.tasks,
                layoutRows: layout.layoutRows,
                rowCount: layout.rowCount
            };
        }
        return { isSortingSuspended: suspended };
    }),

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

        if (updates.startDate !== undefined || updates.dueDate !== undefined) {
            const depUpdates = TaskLogicService.checkDependencies(
                currentTasks,
                state.relations,
                id,
                updatedTask.startDate!,
                updatedTask.dueDate!
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



        // Add modified task IDs
        const newModifiedIds = new Set(state.modifiedTaskIds);
        newModifiedIds.add(id);
        pendingUpdates.forEach((_, key) => newModifiedIds.add(key));

        if (state.isSortingSuspended) {
            // Just update the view 'tasks' without re-layout (preserving order)
            const newViewTasks = state.tasks.map(t => {
                const updated = finalTasks.find(ft => ft.id === t.id);
                if (updated) {
                    // Keep layout-specific props from 't', update data from 'updated'
                    return {
                        ...updated,
                        rowIndex: t.rowIndex,
                        indentLevel: t.indentLevel,
                        treeLevelGuides: t.treeLevelGuides,
                        isLastChild: t.isLastChild,
                        hasChildren: t.hasChildren
                    };
                }
                return t;
            });

            return {
                allTasks: finalTasks,
                tasks: newViewTasks,
                modifiedTaskIds: newModifiedIds // Add here for suspended case
            };
        }

        const layout = buildLayoutFromState(state, { allTasks: finalTasks });

        return {
            allTasks: finalTasks,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount,
            modifiedTaskIds: newModifiedIds // Add here for normal case
        };
    }),



    removeTask: (id) => set((state) => {
        const finalTasks = state.allTasks.filter(t => t.id !== id);
        const layout = buildLayoutFromState(state, { allTasks: finalTasks });
        return {
            allTasks: finalTasks,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    updateViewport: (updates) => set((state) => {
        const nextViewport = { ...state.viewport, ...updates };

        // Must match BOTTOM_PADDING_PX in GanttContainer.tsx
        const BOTTOM_PADDING_PX = 40;
        const totalHeight = Math.max(0, state.rowCount * nextViewport.rowHeight + BOTTOM_PADDING_PX);
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
    setRowHeight: (height) => set((state) => ({
        viewport: { ...state.viewport, rowHeight: height }
    })),

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
        const nextShowSubprojects = grouped;
        const nextGroupByAssignee = grouped ? false : state.groupByAssignee;
        const layout = buildLayoutFromState(state, {
            groupByProject: grouped,
            groupByAssignee: nextGroupByAssignee,
            showSubprojects: nextShowSubprojects
        });
        return {
            groupByProject: grouped,
            groupByAssignee: nextGroupByAssignee,
            showSubprojects: nextShowSubprojects,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    setGroupByAssignee: (grouped) => set((state) => {
        const nextGroupByProject = grouped ? false : state.groupByProject;
        const nextShowSubprojects = state.showSubprojects;
        const layout = buildLayoutFromState(state, {
            groupByAssignee: grouped,
            groupByProject: nextGroupByProject,
            showSubprojects: nextShowSubprojects
        });
        return {
            groupByAssignee: grouped,
            groupByProject: nextGroupByProject,
            showSubprojects: nextShowSubprojects,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    setOrganizeByDependency: (enabled) => set((state) => {
        const layout = buildLayoutFromState(state, { organizeByDependency: enabled });
        return {
            organizeByDependency: enabled,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),


    setCurrentProjectId: (id) => set((state) => {
        if (state.currentProjectId === id) return state;
        const layout = buildLayoutFromState(state, { currentProjectId: id });
        return {
            currentProjectId: id,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    toggleProjectExpansion: (projectId) => set((state) => {
        const projectExpansion = { ...state.projectExpansion, [projectId]: !(state.projectExpansion[projectId] ?? true) };
        const layout = buildLayoutFromState(state, { projectExpansion });
        return {
            projectExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    toggleVersionExpansion: (versionId) => set((state) => {
        const versionExpansion = { ...state.versionExpansion, [versionId]: !(state.versionExpansion[versionId] ?? true) };
        const layout = buildLayoutFromState(state, { versionExpansion });
        return {
            versionExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    toggleTaskExpansion: (taskId: string) => set((state) => {
        const taskExpansion = { ...state.taskExpansion, [taskId]: !(state.taskExpansion[taskId] ?? true) };
        const layout = buildLayoutFromState(state, { taskExpansion });
        return {
            taskExpansion,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    toggleAllExpansion: () => set((state) => {
        // Check if anything is collapsed. If so, expand all. Otherwise, collapse all.
        const anyProjectCollapsed = (state.groupByProject || state.groupByAssignee) &&
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
            const assigneeId = task.assignedToId === undefined || task.assignedToId === null ? 'none' : String(task.assignedToId);
            projectExpansion[`assignee:${assigneeId}`] = shouldExpand;
            taskExpansion[task.id] = shouldExpand;
            if (task.fixedVersionId) versionExpansion[task.fixedVersionId] = shouldExpand;
        });

        const layout = buildLayoutFromState(state, { projectExpansion, versionExpansion, taskExpansion });

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
            const assigneeId = task.assignedToId === undefined || task.assignedToId === null ? 'none' : String(task.assignedToId);
            projectExpansion[`assignee:${assigneeId}`] = true;
            taskExpansion[task.id] = true;
            if (task.fixedVersionId) versionExpansion[task.fixedVersionId] = true;
        });

        const layout = buildLayoutFromState(state, { projectExpansion, versionExpansion, taskExpansion });

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
            const assigneeId = task.assignedToId === undefined || task.assignedToId === null ? 'none' : String(task.assignedToId);
            projectExpansion[`assignee:${assigneeId}`] = false;
            taskExpansion[task.id] = false;
            if (task.fixedVersionId) versionExpansion[task.fixedVersionId] = false;
        });

        const layout = buildLayoutFromState(state, { projectExpansion, versionExpansion, taskExpansion });

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
        const layout = buildLayoutFromState(state, { filterText: text });
        return {
            filterText: text,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    setSelectedAssigneeIds: (ids) => set((state) => {
        const layout = buildLayoutFromState(state, { selectedAssigneeIds: ids });
        return {
            selectedAssigneeIds: ids,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),

    setSelectedProjectIds: (ids) => set((state) => {
        const layout = buildLayoutFromState(state, { selectedProjectIds: ids });
        return {
            selectedProjectIds: ids,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    setSelectedVersionIds: (ids) => set((state) => {
        const layout = buildLayoutFromState(state, { selectedVersionIds: ids });
        savePreferences({ selectedVersionIds: ids });
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

        const layout = buildLayoutFromState(state, { sortConfig: newSort });

        savePreferences({ sortConfig: newSort });
        return {
            sortConfig: newSort,
            tasks: layout.tasks,
            layoutRows: layout.layoutRows,
            rowCount: layout.rowCount
        };
    }),
    refreshData: async () => {
        const { apiClient } = await import('../api/client');
        const state = get();
        const data = await apiClient.fetchData({ statusIds: state.selectedStatusIds });
        const { setTasks, setRelations, setVersions, setTaskStatuses } = state;
        setTasks(data.tasks);
        setRelations(data.relations);
        setVersions(data.versions);
        setTaskStatuses(data.statuses);
        set({ modifiedTaskIds: new Set() });
    },

    saveChanges: async () => {
        const { apiClient } = await import('../api/client');
        const state = get();
        const taskById = new Map(state.allTasks.map(task => [task.id, task]));
        const depthCache = new Map<string, number>();
        const calcDepth = (taskId: string): number => {
            if (depthCache.has(taskId)) return depthCache.get(taskId)!;
            let depth = 0;
            let current = taskById.get(taskId);
            const seen = new Set<string>([taskId]);
            while (current?.parentId) {
                if (seen.has(current.parentId)) break;
                seen.add(current.parentId);
                depth += 1;
                current = taskById.get(current.parentId);
            }
            depthCache.set(taskId, depth);
            return depth;
        };

        // Update parents first so Redmine child-date validation does not reject child updates.
        const tasksToUpdate = state.allTasks
            .filter(t => state.modifiedTaskIds.has(t.id))
            .sort((a, b) => calcDepth(a.id) - calcDepth(b.id));

        const failures: string[] = [];
        for (const task of tasksToUpdate) {
            const result = await apiClient.updateTask(task);
            if (result.status !== 'ok') {
                failures.push(`#${task.id}: ${result.error || 'Unknown error'}`);
            }
        }

        await state.refreshData();

        if (failures.length > 0) {
            useUIStore.getState().addNotification(
                `${i18n.t('label_failed_to_save') || 'Failed to save'} (${failures[0]})`,
                'error'
            );
        }
    },

    discardChanges: async () => {
        const state = get();
        await state.refreshData();
    }
}));
