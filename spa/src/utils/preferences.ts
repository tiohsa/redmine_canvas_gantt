import type { ViewMode, Viewport, ZoomLevel } from '../types';
import type { AutoScheduleMoveMode } from '../types/constraints';
import type { ColumnConfig } from '../components/sidebar/sidebarColumnSettings';

type StoredViewport = Pick<Viewport, 'startDate' | 'scrollX' | 'scrollY' | 'scale'>;

export interface StoredPreferences {
    zoomLevel?: ZoomLevel;
    viewMode?: ViewMode;
    viewport?: Partial<StoredViewport>;
    showProgressLine?: boolean;
    showTaskTitles?: boolean;
    showHierarchyLines?: boolean;
    showPointsOrphans?: boolean;
    showVersions?: boolean;
    showBaseline?: boolean;
    selectedStatusIds?: number[];
    selectedProjectIds?: string[];
    visibleColumns?: string[];
    columnSettings?: ColumnConfig[];
    organizeByDependency?: boolean;
    columnWidths?: Record<string, number>;
    sidebarWidth?: number;
    customScales?: Record<number, number>;
    rowHeight?: number;
    autoSave?: boolean;
    defaultRelationType?: 'precedes' | 'relates' | 'blocks';
    autoCalculateDelay?: boolean;
    autoApplyDefaultRelation?: boolean;
    autoScheduleMoveMode?: AutoScheduleMoveMode;
    capacityThreshold?: number;
    leafIssuesOnly?: boolean;
    includeClosedIssues?: boolean;
    todayOnwardOnly?: boolean;
    sidebarFontSize?: number;
}

export type DisplayPreferencesSource = 'project' | 'global' | 'default';

export interface StoredDisplayPreferences {
    zoomLevel?: ZoomLevel;
    viewMode?: ViewMode;
    viewport?: Partial<StoredViewport>;
    showProgressLine?: boolean;
    showTaskTitles?: boolean;
    showHierarchyLines?: boolean;
    showPointsOrphans?: boolean;
    showVersions?: boolean;
    showBaseline?: boolean;
    visibleColumns?: string[];
    columnSettings?: ColumnConfig[];
    organizeByDependency?: boolean;
    columnWidths?: Record<string, number>;
    sidebarWidth?: number;
    customScales?: Record<number, number>;
    rowHeight?: number;
    sidebarFontSize?: number;
}

export interface StoredGeneralPreferences {
    autoSave?: boolean;
    defaultRelationType?: 'precedes' | 'relates' | 'blocks';
    autoCalculateDelay?: boolean;
    autoApplyDefaultRelation?: boolean;
    autoScheduleMoveMode?: AutoScheduleMoveMode;
    capacityThreshold?: number;
    leafIssuesOnly?: boolean;
    includeClosedIssues?: boolean;
    todayOnwardOnly?: boolean;
}

export interface LoadedDisplayPreferences {
    source: DisplayPreferencesSource;
    preferences: StoredDisplayPreferences;
    globalEnabled: boolean;
}

export type DisplayPreferencesSnapshot = Pick<
    StoredPreferences,
    | 'zoomLevel'
    | 'viewMode'
    | 'viewport'
    | 'showProgressLine'
    | 'showTaskTitles'
    | 'showHierarchyLines'
    | 'showPointsOrphans'
    | 'showVersions'
    | 'showBaseline'
    | 'visibleColumns'
    | 'columnSettings'
    | 'organizeByDependency'
    | 'columnWidths'
    | 'sidebarWidth'
    | 'customScales'
    | 'rowHeight'
    | 'sidebarFontSize'
>;

export type GeneralPreferencesSnapshot = Pick<
    StoredPreferences,
    | 'autoSave'
    | 'defaultRelationType'
    | 'autoCalculateDelay'
    | 'autoApplyDefaultRelation'
    | 'autoScheduleMoveMode'
    | 'capacityThreshold'
    | 'leafIssuesOnly'
    | 'includeClosedIssues'
    | 'todayOnwardOnly'
>;

const sanitizePreferences = (prefs: StoredPreferences): StoredPreferences => Object.fromEntries(
    Object.entries({
        zoomLevel: prefs.zoomLevel,
        viewMode: prefs.viewMode,
        viewport: prefs.viewport,
        showProgressLine: prefs.showProgressLine,
        showTaskTitles: prefs.showTaskTitles,
        showHierarchyLines: prefs.showHierarchyLines,
        showPointsOrphans: prefs.showPointsOrphans,
        showVersions: prefs.showVersions,
        showBaseline: prefs.showBaseline,
        visibleColumns: prefs.visibleColumns,
        columnSettings: prefs.columnSettings,
        columnWidths: prefs.columnWidths,
        sidebarWidth: prefs.sidebarWidth,
        customScales: prefs.customScales,
        rowHeight: prefs.rowHeight,
        autoSave: prefs.autoSave,
        defaultRelationType: prefs.defaultRelationType,
        autoCalculateDelay: prefs.autoCalculateDelay,
        autoApplyDefaultRelation: prefs.autoApplyDefaultRelation,
        autoScheduleMoveMode: prefs.autoScheduleMoveMode,
        capacityThreshold: prefs.capacityThreshold,
        leafIssuesOnly: prefs.leafIssuesOnly,
        includeClosedIssues: prefs.includeClosedIssues,
        todayOnwardOnly: prefs.todayOnwardOnly,
        organizeByDependency: prefs.organizeByDependency,
        sidebarFontSize: prefs.sidebarFontSize
    }).filter(([, value]) => value !== undefined)
) as StoredPreferences;

const sanitizeDisplayPreferences = (prefs: StoredPreferences): StoredDisplayPreferences => Object.fromEntries(
    Object.entries({
        zoomLevel: prefs.zoomLevel,
        viewMode: prefs.viewMode,
        viewport: prefs.viewport,
        showProgressLine: prefs.showProgressLine,
        showTaskTitles: prefs.showTaskTitles,
        showHierarchyLines: prefs.showHierarchyLines,
        showPointsOrphans: prefs.showPointsOrphans,
        showVersions: prefs.showVersions,
        showBaseline: prefs.showBaseline,
        visibleColumns: prefs.visibleColumns,
        columnSettings: prefs.columnSettings,
        organizeByDependency: prefs.organizeByDependency,
        columnWidths: prefs.columnWidths,
        sidebarWidth: prefs.sidebarWidth,
        customScales: prefs.customScales,
        rowHeight: prefs.rowHeight,
        sidebarFontSize: prefs.sidebarFontSize
    }).filter(([, value]) => value !== undefined)
) as StoredDisplayPreferences;

const sanitizeGeneralPreferences = (prefs: StoredPreferences): StoredGeneralPreferences => Object.fromEntries(
    Object.entries({
        autoSave: prefs.autoSave,
        defaultRelationType: prefs.defaultRelationType,
        autoCalculateDelay: prefs.autoCalculateDelay,
        autoApplyDefaultRelation: prefs.autoApplyDefaultRelation,
        autoScheduleMoveMode: prefs.autoScheduleMoveMode,
        capacityThreshold: prefs.capacityThreshold,
        leafIssuesOnly: prefs.leafIssuesOnly,
        includeClosedIssues: prefs.includeClosedIssues,
        todayOnwardOnly: prefs.todayOnwardOnly
    }).filter(([, value]) => value !== undefined)
) as StoredGeneralPreferences;

export const buildStoredDisplayPreferences = (
    prefs: DisplayPreferencesSnapshot
): StoredDisplayPreferences => sanitizeDisplayPreferences(prefs);

export const buildStoredGeneralPreferences = (
    prefs: GeneralPreferencesSnapshot
): StoredGeneralPreferences => sanitizeGeneralPreferences(prefs);

const STORAGE_KEY = 'canvasGantt:preferences';
const STORAGE_VERSION = 4;
const GLOBAL_PROJECT_KEY = 'project:global';

const isBrowser = typeof window !== 'undefined';

type PreferencesEnvelopeV4 = {
    version: 4;
    general: Record<string, StoredGeneralPreferences>;
    display: {
        projects: Record<string, StoredDisplayPreferences>;
        global: {
            enabled: boolean;
            preferences: StoredDisplayPreferences;
        };
    };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isPreferencesEnvelopeV4 = (value: unknown): value is PreferencesEnvelopeV4 => {
    if (!isRecord(value)) return false;
    if (value.version !== STORAGE_VERSION) return false;
    if (!isRecord(value.general)) return false;
    if (!isRecord(value.display)) return false;
    if (!isRecord(value.display.projects)) return false;
    if (!isRecord(value.display.global)) return false;
    if (typeof value.display.global.enabled !== 'boolean') return false;
    if (!isRecord(value.display.global.preferences)) return false;
    return true;
};

const resolveProjectKey = (projectId?: string | number | null): string => {
    const id = projectId ?? window.RedmineCanvasGantt?.projectId;
    if (id === undefined || id === null || String(id) === '') return GLOBAL_PROJECT_KEY;
    return `project:${String(id)}`;
};

const persistEnvelope = (envelope: PreferencesEnvelopeV4) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
};

const createEmptyEnvelope = (): PreferencesEnvelopeV4 => ({
    version: STORAGE_VERSION,
    general: {},
    display: {
        projects: {},
        global: {
            enabled: false,
            preferences: {}
        }
    }
});

const buildLegacyEnvelope = (prefs: StoredPreferences, projectKey: string): PreferencesEnvelopeV4 => ({
    version: STORAGE_VERSION,
    general: {
        [projectKey]: sanitizeGeneralPreferences(prefs)
    },
    display: {
        projects: {
            [projectKey]: sanitizeDisplayPreferences(prefs)
        },
        global: {
            enabled: false,
            preferences: {}
        }
    }
});

const splitLegacyProjects = (projects: Record<string, unknown>): PreferencesEnvelopeV4 => {
    const envelope = createEmptyEnvelope();

    Object.entries(projects).forEach(([projectKey, value]) => {
        if (!isRecord(value)) return;
        const prefs = sanitizePreferences(value as StoredPreferences);
        envelope.general[projectKey] = sanitizeGeneralPreferences(prefs);
        envelope.display.projects[projectKey] = sanitizeDisplayPreferences(prefs);

        if (projectKey === GLOBAL_PROJECT_KEY) {
            envelope.display.global = {
                enabled: true,
                preferences: sanitizeDisplayPreferences(prefs)
            };
        }
    });

    return envelope;
};

const normalizeEnvelope = (
    parsed: unknown,
    projectKey: string
): { envelope: PreferencesEnvelopeV4; migrated: boolean } => {
    if (isPreferencesEnvelopeV4(parsed)) {
        return { envelope: parsed, migrated: false };
    }

    if (isRecord(parsed) && isRecord(parsed.projects)) {
        return {
            envelope: splitLegacyProjects(parsed.projects),
            migrated: true
        };
    }

    if (isRecord(parsed)) {
        return {
            envelope: buildLegacyEnvelope(parsed as StoredPreferences, projectKey),
            migrated: true
        };
    }

    return {
        envelope: createEmptyEnvelope(),
        migrated: false
    };
};

const readEnvelope = (projectId?: string | number | null): PreferencesEnvelopeV4 => {
    const projectKey = resolveProjectKey(projectId);
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
        return createEmptyEnvelope();
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        const { envelope, migrated } = normalizeEnvelope(parsed, projectKey);
        if (migrated) {
            persistEnvelope(envelope);
        }
        return envelope;
    } catch (e) {
        console.warn('Failed to parse stored preferences', e);
        return createEmptyEnvelope();
    }
};

const loadGeneralPreferences = (projectId?: string | number | null): StoredGeneralPreferences => {
    if (!isBrowser) return {};
    const envelope = readEnvelope(projectId);
    const projectKey = resolveProjectKey(projectId);
    return sanitizeGeneralPreferences(envelope.general[projectKey] ?? {});
};

export const loadDisplayPreferencesWithSource = (
    projectId?: string | number | null
): LoadedDisplayPreferences => {
    if (!isBrowser) {
        return { source: 'default', preferences: {}, globalEnabled: false };
    }

    const envelope = readEnvelope(projectId);
    const projectKey = resolveProjectKey(projectId);
    const projectPreferences = sanitizeDisplayPreferences(envelope.display.projects[projectKey] ?? {});
    const globalPreferences = sanitizeDisplayPreferences(envelope.display.global.preferences);

    if (envelope.display.global.enabled) {
        return {
            source: 'global',
            preferences: globalPreferences,
            globalEnabled: true
        };
    }

    if (Object.keys(projectPreferences).length > 0) {
        return {
            source: 'project',
            preferences: projectPreferences,
            globalEnabled: false
        };
    }

    return {
        source: 'default',
        preferences: {},
        globalEnabled: false
    };
};

export const loadDisplayPreferences = (projectId?: string | number | null): StoredDisplayPreferences =>
    loadDisplayPreferencesWithSource(projectId).preferences;

export const loadPreferences = (projectId?: string | number | null): StoredPreferences => sanitizePreferences({
    ...loadDisplayPreferences(projectId),
    ...loadGeneralPreferences(projectId)
});

export const savePreferences = (prefs: StoredPreferences, projectId?: string | number | null) => {
    if (!isBrowser) return;

    const projectKey = resolveProjectKey(projectId);
    const envelope = readEnvelope(projectId);
    const currentGeneralPreferences = sanitizeGeneralPreferences(envelope.general[projectKey] ?? {});
    envelope.general[projectKey] = {
        ...currentGeneralPreferences,
        ...sanitizeGeneralPreferences(prefs)
    };
    persistEnvelope(envelope);
};

export const saveDisplayPreferences = (
    prefs: StoredDisplayPreferences,
    projectId?: string | number | null
) => {
    if (!isBrowser) return;

    const projectKey = resolveProjectKey(projectId);
    const envelope = readEnvelope(projectId);
    const currentDisplayPreferences = sanitizeDisplayPreferences(envelope.display.projects[projectKey] ?? {});
    envelope.display.projects[projectKey] = {
        ...currentDisplayPreferences,
        ...sanitizeDisplayPreferences(prefs)
    };
    persistEnvelope(envelope);
};

export const saveGlobalDisplayPreferences = (
    prefs: StoredDisplayPreferences,
    enabled = true
) => {
    if (!isBrowser) return;

    const envelope = readEnvelope();
    envelope.display.global = {
        enabled,
        preferences: sanitizeDisplayPreferences({
            ...envelope.display.global.preferences,
            ...prefs
        })
    };
    persistEnvelope(envelope);
};
