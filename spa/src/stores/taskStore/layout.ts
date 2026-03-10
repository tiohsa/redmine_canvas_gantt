import type { LayoutRow, Relation, Task, Version } from '../../types';
import { i18n } from '../../utils/i18n';
import type { CustomFieldMeta } from '../../types/editMeta';
import type { SortConfig } from './types';

export const buildDependencyComponents = (tasks: Task[], relations: Relation[]): Map<string, string> => {
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

export const buildLayout = (
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
    selectedVersionIds: string[],
    selectedProjectIds: string[],
    sortConfig: SortConfig,
    allTasks: Task[],
    customFields: CustomFieldMeta[]
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

    if (groupingMode === 'project') {
        selectedProjectIds.forEach(pid => {
            if (!groupRoots.has(pid)) {
                groupRoots.set(pid, []);
                if (!groupOrder.has(pid)) {
                    const originalTask = allTasks.find(t => t.projectId === pid);
                    if (originalTask) {
                        groupOrder.set(pid, Number.MAX_SAFE_INTEGER);
                    } else {
                        groupOrder.set(pid, Number.MAX_SAFE_INTEGER);
                    }
                }
            }
        });
    }

    const customFieldMetaById = new Map(customFields.map((cf) => [String(cf.id), cf]));

    const getSortValue = (task: Task, sortKey: string): string | number | null | undefined => {
        if (sortKey.startsWith('cf:')) {
            const customFieldId = sortKey.slice(3);
            const raw = task.customFieldValues?.[customFieldId];
            if (raw === undefined || raw === null || raw === '') return raw;
            const meta = customFieldMetaById.get(customFieldId);
            if (!meta) return raw;

            if (meta.fieldFormat === 'int' || meta.fieldFormat === 'float') {
                const parsed = Number(raw);
                return Number.isFinite(parsed) ? parsed : raw;
            }
            if (meta.fieldFormat === 'bool') {
                if (raw === '1') return 1;
                if (raw === '0') return 0;
                return raw;
            }
            if (meta.fieldFormat === 'date') {
                const ts = new Date(raw).getTime();
                return Number.isFinite(ts) ? ts : raw;
            }
            return raw;
        }

        return (task as unknown as Record<string, unknown>)[sortKey] as string | number | null | undefined;
    };

    const compareSortValues = (a: string | number | null | undefined, b: string | number | null | undefined): number => {
        if (a === b) return 0;
        if (a === null || a === undefined || a === '') return 1;
        if (b === null || b === undefined || b === '') return -1;

        if (typeof a === 'number' && typeof b === 'number') {
            return a < b ? -1 : 1;
        }

        return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    };

    const sortTaskIds = (ids: string[]) => {
        ids.sort((a, b) => {
            const taskA = nodeMap.get(a)?.task;
            const taskB = nodeMap.get(b)?.task;
            if (!taskA || !taskB) return 0;

            if (sortConfig) {
                const valA = getSortValue(taskA, sortConfig.key);
                const valB = getSortValue(taskB, sortConfig.key);
                const compare = compareSortValues(valA, valB);
                return sortConfig.direction === 'asc' ? compare : -compare;
            }

            return (taskA.displayOrder ?? 0) - (taskB.displayOrder ?? 0);
        });
    };

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

    if (groupingMode === 'none' && sortConfig) {
        const allRoots: string[] = [];
        groupRoots.forEach((roots) => {
            allRoots.push(...roots);
        });
        sortTaskIds(allRoots);
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
                const task = allTasks.find((currentTask) => currentTask.projectId === groupId && currentTask.projectName);
                if (task?.projectName) projectName = task.projectName;
            }

            if (!projectName) projectName = groupId === 'default_project' ? '' : groupId;
        }

        const expanded = projectExpansion[groupId] ?? true;
        const shouldShowVersions = showVersions;
        const shouldGroupByGroup = groupingMode !== 'none';

        if (shouldGroupByGroup) {
            let projectStart: number | undefined;
            let projectDue: number | undefined;

            nodeMap.forEach(node => {
                if (toGroupKey(node.task) === groupId) {
                    const taskStart = node.task.startDate;
                    const taskDue = node.task.dueDate;
                    if (taskStart !== undefined && Number.isFinite(taskStart)) {
                        projectStart = projectStart === undefined ? taskStart : Math.min(projectStart, taskStart);
                    }
                    if (taskDue !== undefined && Number.isFinite(taskDue)) {
                        projectDue = projectDue === undefined ? taskDue : Math.max(projectDue, taskDue);
                    }
                }
            });

            layoutRows.push({
                type: 'header',
                projectId: groupId,
                projectName,
                groupKind: toHeaderKind(),
                rowIndex,
                startDate: projectStart,
                dueDate: projectDue
            });
            rowIndex += 1;
        }

        const hideDescendants = shouldGroupByGroup && !expanded;

        if (shouldShowVersions) {
            const versionMap = new Map<string | undefined, string[]>();
            roots.forEach(rootId => {
                const task = nodeMap.get(rootId)?.task;
                const versionId = task?.fixedVersionId;
                const key = versionId || undefined;
                if (!versionMap.has(key)) versionMap.set(key, []);
                versionMap.get(key)?.push(rootId);
            });

            const usedVersionIds = new Set<string>();
            versionMap.forEach((_, versionId) => {
                if (versionId) usedVersionIds.add(String(versionId));
            });

            const projectVersions = versions.filter(version => {
                if (usedVersionIds.has(version.id)) return true;
                if (selectedVersionIds.includes(version.id) && version.projectId === groupId) return true;
                return false;
            });
            projectVersions.sort((a, b) => {
                const aDate = a.effectiveDate ?? Infinity;
                const bDate = b.effectiveDate ?? Infinity;
                return aDate - bDate;
            });

            projectVersions.forEach(version => {
                const versionRoots = versionMap.get(version.id) || [];
                const versionExpanded = versionExpansion[version.id] ?? true;

                let versionStart = version.startDate;
                if (!Number.isFinite(versionStart)) {
                    if (versionRoots.length > 0) {
                        let minStart = Infinity;
                        versionRoots.forEach(rootId => {
                            const task = nodeMap.get(rootId)?.task;
                            if (task && task.startDate !== undefined && Number.isFinite(task.startDate)) minStart = Math.min(minStart, task.startDate);
                        });
                        if (minStart !== Infinity) versionStart = minStart;
                        else versionStart = version.effectiveDate;
                    } else {
                        versionStart = version.effectiveDate;
                    }
                }

                if (version.effectiveDate !== undefined && !hideDescendants) {
                    layoutRows.push({
                        type: 'version',
                        id: version.id,
                        name: version.name,
                        rowIndex,
                        startDate: versionStart,
                        dueDate: version.effectiveDate,
                        ratioDone: version.ratioDone,
                        projectId: groupId
                    });
                    rowIndex += 1;
                }

                const hideVersionChildren = hideDescendants || !versionExpanded;
                versionRoots.forEach((rootId, idx) => {
                    const isLast = idx === versionRoots.length - 1;
                    traverse(rootId, 0, hideVersionChildren, [], isLast);
                });

                versionMap.delete(version.id);
            });

            const remainingEntries = Array.from(versionMap.entries());
            remainingEntries.forEach(([, versionRoots], entryIdx) => {
                const isLastEntry = entryIdx === remainingEntries.length - 1;
                versionRoots.forEach((rootId, idx) => {
                    const isLast = isLastEntry && (idx === versionRoots.length - 1);
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
