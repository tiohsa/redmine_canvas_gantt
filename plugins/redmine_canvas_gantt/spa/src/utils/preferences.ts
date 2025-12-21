import type { ViewMode, Viewport, ZoomLevel } from '../types';

type StoredViewport = Pick<Viewport, 'startDate' | 'scrollX' | 'scrollY' | 'scale'>;

export interface StoredPreferences {
    zoomLevel?: ZoomLevel;
    viewMode?: ViewMode;
    viewport?: Partial<StoredViewport>;
    showProgressLine?: boolean;
    showVersions?: boolean;
    visibleColumns?: string[];
    groupByProject?: boolean;
    organizeByDependency?: boolean;
    columnWidths?: Record<string, number>;
    sidebarWidth?: number;
    selectedAssigneeIds?: (number | null)[];
    customScales?: Record<number, number>;
}

const STORAGE_KEY = 'canvasGantt:preferences';

const isBrowser = typeof window !== 'undefined';

export const loadPreferences = (): StoredPreferences => {
    if (!isBrowser) return {};

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw) as StoredPreferences;
        return parsed ?? {};
    } catch (e) {
        console.warn('Failed to parse stored preferences', e);
        return {};
    }
};

export const savePreferences = (prefs: StoredPreferences) => {
    if (!isBrowser) return;

    const next = { ...loadPreferences(), ...prefs };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};
