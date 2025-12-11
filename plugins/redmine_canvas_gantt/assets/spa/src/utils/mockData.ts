import { Task } from '../types';

export const generateMockTasks = (): Task[] => {
  const tasks: Task[] = [];
  const now = new Date();

  const addDays = (d: Date, days: number) => {
    const res = new Date(d);
    res.setDate(res.getDate() + days);
    return res.toISOString().split('T')[0];
  };

  let idCounter = 1;

  const createNode = (parentId: number | null, depth: number): Task => {
    const id = idCounter++;
    const startOffset = Math.floor(Math.random() * 30) - 15;
    const duration = Math.floor(Math.random() * 10) + 1;
    const start = addDays(now, startOffset);
    const end = addDays(now, startOffset + duration);

    return {
      id,
      parentId,
      subject: `Task ${id} - ${parentId ? 'Subtask' : 'Epic'}`,
      startDate: start,
      dueDate: end,
      doneRatio: Math.floor(Math.random() * 11) * 10,
      status: Math.random() > 0.5 ? 'New' : 'In Progress',
      assignee: 'User ' + (Math.floor(Math.random() * 5) + 1),
      isExpanded: true,
      depth,
      index: 0, // will be set later
      hasChildren: false // will be set later
    };
  };

  // Create tasks in DFS order
  const buildTree = (parentId: number | null, depth: number) => {
      // 5 roots, random children
      const count = parentId === null ? 5 : (depth < 2 ? Math.floor(Math.random() * 5) + 1 : 0);

      for(let i=0; i<count; i++) {
          const task = createNode(parentId, depth);
          tasks.push(task);
          buildTree(task.id, depth + 1);
      }
  };

  buildTree(null, 0);

  // Assign indices and compute hasChildren
  const parentIds = new Set(tasks.map(t => t.parentId).filter(id => id !== null));
  tasks.forEach((t, i) => {
      t.index = i;
      t.hasChildren = parentIds.has(t.id);
  });

  return tasks;
};
