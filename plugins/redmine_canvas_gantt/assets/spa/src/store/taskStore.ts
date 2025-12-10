import { create } from 'zustand';
import { Task } from '../types';
import { generateMockTasks } from '../utils/mockData';

interface TaskState {
  tasks: Task[];
  visibleTasks: Task[];
  rowHeight: number;
  headerHeight: number;
  toggleExpand: (taskId: number) => void;
  initialize: () => void;
}

const getVisibleTasks = (tasks: Task[]): Task[] => {
    const collapsedIds = new Set<number>();
    const result: Task[] = [];

    for (const task of tasks) {
        if (task.parentId !== null && collapsedIds.has(task.parentId)) {
            collapsedIds.add(task.id);
            continue;
        }

        result.push(task);

        if (!task.isExpanded) {
            collapsedIds.add(task.id);
        }
    }

    return result;
};

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  visibleTasks: [],
  rowHeight: 40,
  headerHeight: 40,

  initialize: () => {
    const tasks = generateMockTasks();
    set({ tasks, visibleTasks: getVisibleTasks(tasks) });
  },

  toggleExpand: (taskId: number) => {
    const { tasks } = get();
    const newTasks = tasks.map(t =>
      t.id === taskId ? { ...t, isExpanded: !t.isExpanded } : t
    );
    set({ tasks: newTasks, visibleTasks: getVisibleTasks(newTasks) });
  }
}));
