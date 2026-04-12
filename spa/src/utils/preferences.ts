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

const STORAGE_KEY = 'canvasGantt:preferences';
const STORAGE_VERSION = 3;
const GLOBAL_PROJECT_KEY = 'project:global';

const isBrowser = typeof window !== 'undefined';

type PreferencesEnvelopeV3 = {
    version: 3;
    projects: Record<string, StoredPreferences>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isPreferencesEnvelopeV3 = (value: unknown): value is PreferencesEnvelopeV3 => {
    if (!isRecord(value)) return false;
    if (value.version !== STORAGE_VERSION) return false;
    if (!isRecord(value.projects)) return false;
    return true;
};

const resolveProjectKey = (projectId?: string | number | null): string => {
    const id = projectId ?? window.RedmineCanvasGantt?.projectId;
    if (id === undefined || id === null || String(id) === '') return GLOBAL_PROJECT_KEY;
    return `project:${String(id)}`;
};

const persistEnvelope = (envelope: PreferencesEnvelopeV3) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
};

const toEnvelope = (value: StoredPreferences, projectKey: string): PreferencesEnvelopeV3 => ({
    version: STORAGE_VERSION,
    projects: {
        [projectKey]: value
    }
});

export const loadPreferences = (projectId?: string | number | null): StoredPreferences => {
    if (!isBrowser) return {};

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw) as unknown;
        const projectKey = resolveProjectKey(projectId);

        if (isPreferencesEnvelopeV3(parsed)) {
            return sanitizePreferences(parsed.projects[projectKey] ?? {});
        }

        // Legacy shared payload migration: apply old preferences to the current project only.
        if (isRecord(parsed)) {
            const migrated = toEnvelope(sanitizePreferences(parsed as StoredPreferences), projectKey);
            persistEnvelope(migrated);
            return sanitizePreferences(migrated.projects[projectKey] ?? {});
        }

        return {};
    } catch (e) {
        console.warn('Failed to parse stored preferences', e);
        return {};
    }
};

export const savePreferences = (prefs: StoredPreferences, projectId?: string | number | null) => {
    if (!isBrowser) return;

    const projectKey = resolveProjectKey(projectId);
    const currentProjectPrefs = loadPreferences(projectId);
    const nextProjectPrefs = { ...currentProjectPrefs, ...sanitizePreferences(prefs) };

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        persistEnvelope(toEnvelope(nextProjectPrefs, projectKey));
        return;
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        const baseEnvelope = isPreferencesEnvelopeV3(parsed)
            ? parsed
            : toEnvelope(sanitizePreferences(parsed as StoredPreferences), projectKey);
        const nextEnvelope: PreferencesEnvelopeV3 = {
            version: STORAGE_VERSION,
            projects: {
                ...baseEnvelope.projects,
                [projectKey]: nextProjectPrefs
            }
        };
        persistEnvelope(nextEnvelope);
    } catch (e) {
        console.warn('Failed to parse stored preferences for save', e);
        persistEnvelope(toEnvelope(nextProjectPrefs, projectKey));
    }
};
