export interface Task {
    id: string; // Redmine ID is usually int, but using string for safety in JS
    subject: string;
    startDate: number; // Timestamp
    dueDate: number; // Timestamp
    ratioDone: number;
    statusId: number;
    assignedToId?: number;
    assignedToName?: string;
    parentId?: string;
    lockVersion: number;
    editable: boolean;

    // Computed for layout (cached)
    rowIndex: number;
}

export interface Relation {
    id: string;
    from: string;
    to: string;
    type: string; // "precedes" etc.
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
