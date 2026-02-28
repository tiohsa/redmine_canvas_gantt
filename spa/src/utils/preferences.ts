import type { ViewMode, Viewport, ZoomLevel } from '../types';

type StoredViewport = Pick<Viewport, 'startDate' | 'scrollX' | 'scrollY' | 'scale'>;

export interface StoredPreferences {
    zoomLevel?: ZoomLevel;
    viewMode?: ViewMode;
    viewport?: Partial<StoredViewport>;
    showProgressLine?: boolean;
    showPointsOrphans?: boolean;
    showVersions?: boolean;
    visibleColumns?: string[];
    groupByProject?: boolean;
    groupByAssignee?: boolean;
    organizeByDependency?: boolean;
    columnWidths?: Record<string, number>;
    sidebarWidth?: number;
    selectedAssigneeIds?: (number | null)[];
    selectedProjectIds?: string[];
    customScales?: Record<number, number>;
    rowHeight?: number;
    selectedStatusIds?: number[];
    sortConfig?: { key: string; direction: 'asc' | 'desc' } | null;
    selectedVersionIds?: string[];
    autoSave?: boolean;
}

const STORAGE_KEY = 'canvasGantt:preferences';
const STORAGE_VERSION = 2;
const GLOBAL_PROJECT_KEY = 'project:global';

const isBrowser = typeof window !== 'undefined';

type PreferencesEnvelopeV2 = {
    version: 2;
    projects: Record<string, StoredPreferences>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isPreferencesEnvelopeV2 = (value: unknown): value is PreferencesEnvelopeV2 => {
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

const persistEnvelope = (envelope: PreferencesEnvelopeV2) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
};

const toEnvelope = (value: StoredPreferences, projectKey: string): PreferencesEnvelopeV2 => ({
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

        if (isPreferencesEnvelopeV2(parsed)) {
            return parsed.projects[projectKey] ?? {};
        }

        // V1 migration: apply old shared preferences to current project only.
        if (isRecord(parsed)) {
            const migrated = toEnvelope(parsed as StoredPreferences, projectKey);
            persistEnvelope(migrated);
            return migrated.projects[projectKey] ?? {};
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
    const nextProjectPrefs = { ...currentProjectPrefs, ...prefs };

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        persistEnvelope(toEnvelope(nextProjectPrefs, projectKey));
        return;
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        const baseEnvelope = isPreferencesEnvelopeV2(parsed)
            ? parsed
            : toEnvelope(parsed as StoredPreferences, projectKey);
        const nextEnvelope: PreferencesEnvelopeV2 = {
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
