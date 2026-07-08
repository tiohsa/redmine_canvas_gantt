export type FilterMode = 'inherit' | 'all' | 'subset' | 'none';

type InheritFilterOverride = { mode: 'inherit' };
type AllFilterOverride = { mode: 'all' };
type NoneFilterOverride = { mode: 'none' };
type SubsetFilterOverride<T> = { mode: 'subset'; values: T[] };

export type ProjectFilterOverride =
    | InheritFilterOverride
    | AllFilterOverride
    | SubsetFilterOverride<string>
    | NoneFilterOverride;

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

export interface QueryOverrides {
    project?: ProjectFilterOverride;
    status?: StatusFilterOverride;
    assignee?: AssigneeFilterOverride;
    version?: VersionFilterOverride;
}

export interface QueryContext {
    baseQueryId: number | null;
    overrides: QueryOverrides;
}

export interface SharedViewState {
    groupBy: 'project' | 'assignee' | null;
    sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
    visibleColumns?: string[];
}
