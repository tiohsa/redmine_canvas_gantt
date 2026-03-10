import type { Task } from '../../types';

export const applyFilters = (
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
