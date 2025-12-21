export interface Task {
    id: string; // Redmine ID is usually int, but using string for safety in JS
    subject: string;
    projectId?: string;
    projectName?: string;
    displayOrder?: number;
    startDate: number; // Timestamp
    dueDate: number; // Timestamp
    ratioDone: number;
    statusId: number;
    assignedToId?: number;
    assignedToName?: string;
    parentId?: string;
    lockVersion: number;
    editable: boolean;
    trackerId?: number;
    trackerName?: string;

    // Computed for layout (cached)
    rowIndex: number;
    hasChildren: boolean;
    indentLevel?: number;
    treeLevelGuides?: boolean[];
    isLastChild?: boolean;
}

export interface Relation {
    id: string;
    from: string;
    to: string;
    type: string; // "precedes" etc.
    delay?: number; // Delay in days (Redmine supports this)
}

export interface Version {
    id: string;
    name: string;
    startDate?: number;
    dueDate: number;
    completedPercent?: number;
    projectId?: string;
    status?: string;
}

export interface Project {
    id: string;
    name: string;
    startDate?: string;
    dueDate?: string;
}

export interface Viewport {
    startDate: number; // Timestamp of left edge
    scrollX: number; // Horizontal scroll offset (pixels)
    scrollY: number; // Vertical scroll offset (pixels)
    scale: number; // Pixels per millisecond (or day)
    width: number; // Canvas width
    height: number; // Canvas height
    rowHeight: number;
}

export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type LayoutRow =
    | { type: 'header'; projectId: string; projectName?: string; rowIndex: number; startDate?: number; dueDate?: number }
    | { type: 'task'; taskId: string; rowIndex: number };

export type ZoomLevel = 0 | 1 | 2;
export type ViewMode = 'Day' | 'Week' | 'Month' | 'Quarter'; // Keeping for potential backward compact, but aim to use ZoomLevel
