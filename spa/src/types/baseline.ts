export type BaselineSaveScope = 'filtered' | 'project';

export interface BaselineTaskState {
    issueId: string;
    baselineStartDate: number | null;
    baselineDueDate: number | null;
}

export interface BaselineSnapshot {
    snapshotId: string;
    projectId: string;
    capturedAt: string;
    capturedById?: number | null;
    capturedByName?: string | null;
    scope: BaselineSaveScope;
    tasksByIssueId: Record<string, BaselineTaskState>;
}
