export type FilterMode = 'inherit' | 'all' | 'subset' | 'none';

type InheritFilterOverride = { mode: 'inherit' };
type AllFilterOverride = { mode: 'all' };
type SubsetFilterOverride<T> = { mode: 'subset'; values: T[] };

export type StatusFilterOverride =
    | InheritFilterOverride
    | AllFilterOverride
    | SubsetFilterOverride<number>;

export type AssigneeFilterOverride =
    | InheritFilterOverride
    | AllFilterOverride
    | SubsetFilterOverride<number | null>;

export type VersionFilterOverride =
    | InheritFilterOverride
    | AllFilterOverride
    | SubsetFilterOverride<string>;

export type TrackerFilterOverride =
    | InheritFilterOverride
    | AllFilterOverride
    | SubsetFilterOverride<number>;

export interface QueryOverrides {
    status?: StatusFilterOverride;
    assignee?: AssigneeFilterOverride;
    version?: VersionFilterOverride;
    tracker?: TrackerFilterOverride;
}

export interface QueryContext {
    baseQueryId: number | null;
    overrides: QueryOverrides;
}

export interface ScopeState {
    rootProjectId: string;
    showSubprojects: boolean;
}

export interface SharedViewState {
    groupBy: 'project' | 'assignee' | null;
    sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
    visibleColumns?: string[];
}
