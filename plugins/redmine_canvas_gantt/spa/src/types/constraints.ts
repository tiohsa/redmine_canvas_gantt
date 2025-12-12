export const RelationType = {
    Precedes: 'precedes',
    Follows: 'follows',
    Blocks: 'blocks',
    Blocked: 'blocked',
    Relates: 'relates',
    Duplicates: 'duplicates',
    Duplicated: 'duplicated',
    CopiedTo: 'copied_to',
    CopiedFrom: 'copied_from'
} as const;

export type RelationType = typeof RelationType[keyof typeof RelationType];

export const GANTT_RELATIONS = [
    RelationType.Precedes,
    RelationType.Follows,
    RelationType.Blocks,
    RelationType.Blocked
];

export interface ConstraintViolation {
    taskId: string;
    type: 'date_order' | 'parent_bounds' | 'dependency' | 'version_date';
    message: string;
}

export const DEFAULT_TASK_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day
