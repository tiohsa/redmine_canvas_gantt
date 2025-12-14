import type { Task } from '../types';

/**
 * Processes tasks for display:
 * 1. Groups by Project (if enabled)
 * 2. Sorts by Tree/Hierarchy
 * 3. Assigns rowIndex
 */
export const processTasksForDisplay = (tasks: Task[], groupByProject: boolean): Task[] => {
    // Clone to avoid mutation
    const inputTasks = [...tasks];

    // Map tasks by ID for easy lookup
    const taskMap = new Map<string, Task>();
    inputTasks.forEach(t => taskMap.set(t.id, t));

    // If grouping by project, we first sort by Project Name/ID
    // Then we treat each project as a separate tree root context

    let rootTasks: Task[] = [];

    // Helper to find root of a task (to check project consistency if needed, but Redmine usually keeps subtasks in same project.
    // However, cross-project subtasks exist.
    // If we group by Project, we break the visual tree if a child is in a different project.
    // We will follow the rule: Group by the task's project.

    // 1. Buckets by Project
    const projectBuckets = new Map<string, Task[]>(); // projectId -> tasks
    const projectNames = new Map<string, string>();
    const noProjectTasks: Task[] = [];

    if (groupByProject) {
        inputTasks.forEach(t => {
            const pid = t.projectId ? String(t.projectId) : 'none';
            if (pid === 'none') {
                noProjectTasks.push(t);
            } else {
                if (!projectBuckets.has(pid)) {
                    projectBuckets.set(pid, []);
                    if (t.projectName) projectNames.set(pid, t.projectName);
                }
                projectBuckets.get(pid)?.push(t);
            }
        });
    } else {
        // Just one big bucket
        projectBuckets.set('all', inputTasks);
    }

    // 2. Process each bucket (build tree and flatten)
    const result: Task[] = [];

    // Sort project buckets (by name usually)
    const sortedProjectIds = Array.from(projectBuckets.keys()).sort((a, b) => {
        if (a === 'all') return 0;
        if (a === 'none') return 1;
        if (b === 'none') return -1;
        const nameA = projectNames.get(a) || '';
        const nameB = projectNames.get(b) || '';
        return nameA.localeCompare(nameB);
    });

    let currentRowIndex = 0;

    sortedProjectIds.forEach(pid => {
        const bucketTasks = projectBuckets.get(pid) || [];

        // If Grouping, insert Header
        if (groupByProject && pid !== 'all' && pid !== 'none') {
            const pName = projectNames.get(pid) || `Project ${pid}`;
            // Find min/max dates for the project header?
            // For now just a label row.
            const headerTask: Task = {
                id: `proj-header-${pid}`,
                subject: pName,
                startDate: 0, // Placeholder
                dueDate: 0,
                ratioDone: 0,
                statusId: 0,
                lockVersion: 0,
                editable: false,
                rowIndex: currentRowIndex,
                hasChildren: true, // Acts like a parent
                isGroupHeader: true
            };
            result.push(headerTask);
            currentRowIndex++;
        }

        // Build Tree for this bucket
        // Identify roots WITHIN this bucket
        // A task is a root in this bucket if its parent is NOT in this bucket
        const bucketIds = new Set(bucketTasks.map(t => t.id));
        const roots = bucketTasks.filter(t => !t.parentId || !bucketIds.has(t.parentId));

        // Sort roots by start date or subject? Standard Redmine is by ID or specialized sort.
        // Let's sort roots by start date.
        roots.sort((a, b) => (a.startDate || 0) - (b.startDate || 0));

        const processNode = (node: Task, level: number) => {
            // Add to result with new rowIndex
            const processedNode = { ...node, rowIndex: currentRowIndex };
            result.push(processedNode);
            currentRowIndex++;

            // Find children in this bucket
            const children = bucketTasks.filter(t => t.parentId === node.id);
            children.sort((a, b) => (a.startDate || 0) - (b.startDate || 0));

            children.forEach(child => processNode(child, level + 1));
        };

        roots.forEach(root => processNode(root, 0));
    });

    if (groupByProject && noProjectTasks.length > 0) {
        // Handle no project tasks
         const roots = noProjectTasks.filter(t => !t.parentId || !noProjectTasks.find(pt => pt.id === t.parentId));
         roots.sort((a, b) => (a.startDate || 0) - (b.startDate || 0));

         const processNode = (node: Task) => {
            const processedNode = { ...node, rowIndex: currentRowIndex };
            result.push(processedNode);
            currentRowIndex++;
            const children = noProjectTasks.filter(t => t.parentId === node.id);
            children.sort((a, b) => (a.startDate || 0) - (b.startDate || 0));
            children.forEach(child => processNode(child));
         };
         roots.forEach(r => processNode(r));
    }

    return result;
};
