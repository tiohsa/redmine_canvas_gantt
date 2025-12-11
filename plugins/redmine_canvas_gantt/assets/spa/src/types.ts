export interface Task {
  id: number;
  parentId: number | null;
  subject: string;
  startDate: string; // ISO Date string
  dueDate: string; // ISO Date string
  doneRatio: number; // 0-100
  status: string;
  assignee: string;
  isExpanded: boolean;
  depth: number;
  index: number; // Global index in flattened list
  hasChildren: boolean;
}
