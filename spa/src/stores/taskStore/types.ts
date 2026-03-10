import type { LayoutRow, Relation, Task, Version } from '../../types';
import type { CustomFieldMeta } from '../../types/editMeta';

export type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

export type LayoutState = {
    allTasks: Task[];
    relations: Relation[];
    versions: Version[];
    customFields: CustomFieldMeta[];
    groupByProject: boolean;
    groupByAssignee: boolean;
    showVersions: boolean;
    organizeByDependency: boolean;
    projectExpansion: Record<string, boolean>;
    versionExpansion: Record<string, boolean>;
    taskExpansion: Record<string, boolean>;
    selectedVersionIds: string[];
    selectedProjectIds: string[];
    sortConfig: SortConfig;
    filterText: string;
    selectedAssigneeIds: (number | null)[];
    showSubprojects: boolean;
    currentProjectId: string | null;
};

export type TaskLayoutSnapshot = {
    allTasks: Task[];
    tasks: Task[];
    layoutRows: LayoutRow[];
    rowCount: number;
};
