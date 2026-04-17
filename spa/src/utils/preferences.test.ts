import { describe, it, expect, beforeEach } from 'vitest';
import {
    loadDisplayPreferencesWithSource,
    loadPreferences,
    saveDisplayPreferences,
    saveGlobalDisplayPreferences,
    savePreferences
} from './preferences';

describe('Preferences storage', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.RedmineCanvasGantt = {
            ...(window.RedmineCanvasGantt ?? {
                apiBase: '',
                redmineBase: '',
                authToken: '',
                apiKey: '',
                nonWorkingWeekDays: [],
                i18n: {},
                settings: {}
            }),
            projectId: 1
        };
    });

    it('does not load shared query state keys from stored payload', () => {
        window.localStorage.setItem('canvasGantt:preferences', JSON.stringify({
            version: 2,
            projects: {
                'project:1': {
                    selectedProjectIds: ['p1', 'p2'],
                    selectedStatusIds: [1, 2]
                }
            }
        }));

        const loaded = loadPreferences(1) as Record<string, unknown>;
        expect(loaded.selectedProjectIds).toBeUndefined();
        expect(loaded.selectedStatusIds).toBeUndefined();
    });

    it('merges with existing preferences in same project', () => {
        saveDisplayPreferences({ zoomLevel: 2 }, 1);
        saveDisplayPreferences({ showProgressLine: true }, 1);

        const loaded = loadPreferences(1);
        expect(loaded.zoomLevel).toBe(2);
        expect(loaded.showProgressLine).toBe(true);
    });

    it('saves and loads autoSave', () => {
        savePreferences({ autoSave: true }, 1);
        expect(loadPreferences(1).autoSave).toBe(true);
        expect(loadPreferences(2).autoSave).toBeUndefined();
    });

    it('migrates V1 shared preferences to current project only', () => {
        window.localStorage.setItem('canvasGantt:preferences', JSON.stringify({
            zoomLevel: 2,
            selectedProjectIds: ['legacy-project']
        }));

        const loadedProject1 = loadPreferences(1);
        const loadedProject2 = loadPreferences(2);

        expect(loadedProject1.zoomLevel).toBe(2);
        expect((loadedProject1 as Record<string, unknown>).selectedProjectIds).toBeUndefined();
        expect(loadedProject2.zoomLevel).toBeUndefined();
        expect((loadedProject2 as Record<string, unknown>).selectedProjectIds).toBeUndefined();

        const raw = window.localStorage.getItem('canvasGantt:preferences');
        const parsed = raw ? JSON.parse(raw) : null;
        expect(parsed?.version).toBe(4);
        expect(parsed?.display?.projects?.['project:1']?.selectedProjectIds).toBeUndefined();
        expect(parsed?.display?.global?.enabled).toBe(false);
    });

    it('saves and loads relation preferences', () => {
        savePreferences({
            defaultRelationType: 'blocks',
            autoCalculateDelay: false,
            autoApplyDefaultRelation: false,
            autoScheduleMoveMode: 'off'
        }, 1);

        const loaded = loadPreferences(1);
        expect(loaded.defaultRelationType).toBe('blocks');
        expect(loaded.autoCalculateDelay).toBe(false);
        expect(loaded.autoApplyDefaultRelation).toBe(false);
        expect(loaded.autoScheduleMoveMode).toBe('off');
    });

    it('saves and loads baseline visibility preference', () => {
        saveDisplayPreferences({ showBaseline: true }, 1);

        expect(loadPreferences(1).showBaseline).toBe(true);
        expect(loadPreferences(2).showBaseline).toBeUndefined();
    });

    it('saves and loads task title visibility preference', () => {
        saveDisplayPreferences({ showTaskTitles: false }, 1);

        const loaded = loadPreferences(1) as Record<string, unknown>;
        expect(loaded.showTaskTitles).toBe(false);
        expect(loadPreferences(2).showTaskTitles).toBeUndefined();
    });

    it('saves and loads hierarchy line visibility preference', () => {
        saveDisplayPreferences({ showHierarchyLines: false }, 1);

        const loaded = loadPreferences(1) as Record<string, unknown>;
        expect(loaded.showHierarchyLines).toBe(false);
        expect(loadPreferences(2).showHierarchyLines).toBeUndefined();
    });

    it('uses shared display preferences when sharing is enabled', () => {
        saveGlobalDisplayPreferences({ showTaskTitles: false, sidebarWidth: 460 }, true);
        saveDisplayPreferences({ showBaseline: true, sidebarWidth: 520, sidebarFontSize: 15 }, 1);

        const projectLoaded = loadDisplayPreferencesWithSource(1);
        expect(projectLoaded.source).toBe('global');
        expect(projectLoaded.globalEnabled).toBe(true);
        expect(projectLoaded.preferences.showTaskTitles).toBe(false);
        expect(projectLoaded.preferences.sidebarWidth).toBe(460);

        const globalLoaded = loadDisplayPreferencesWithSource(2);
        expect(globalLoaded.source).toBe('global');
        expect(globalLoaded.globalEnabled).toBe(true);
        expect(globalLoaded.preferences.showTaskTitles).toBe(false);
        expect(globalLoaded.preferences.sidebarWidth).toBe(460);

        saveGlobalDisplayPreferences({ showTaskTitles: true }, false);

        const disabledLoaded = loadDisplayPreferencesWithSource(2);
        expect(disabledLoaded.source).toBe('default');
        expect(disabledLoaded.globalEnabled).toBe(false);
        expect(disabledLoaded.preferences).toEqual({});

        saveGlobalDisplayPreferences({}, true);

        const reenabledLoaded = loadDisplayPreferencesWithSource(2);
        expect(reenabledLoaded.source).toBe('global');
        expect(reenabledLoaded.globalEnabled).toBe(true);
        expect(reenabledLoaded.preferences.showTaskTitles).toBe(true);
        expect(reenabledLoaded.preferences.sidebarWidth).toBe(460);
    });

    it('treats a project copy that matches the shared settings as shared source', () => {
        saveGlobalDisplayPreferences({
            showTaskTitles: false,
            sidebarWidth: 460,
            showProgressLine: true
        }, true);
        saveDisplayPreferences({
            showTaskTitles: false,
            sidebarWidth: 460,
            showProgressLine: true
        }, 1);

        const loaded = loadDisplayPreferencesWithSource(1);

        expect(loaded.source).toBe('global');
        expect(loaded.globalEnabled).toBe(true);
        expect(loaded.preferences.showTaskTitles).toBe(false);
        expect(loaded.preferences.sidebarWidth).toBe(460);
        expect(loaded.preferences.showProgressLine).toBe(true);
    });

    it('store modules restore persisted filter preferences on reload', async () => {
        saveDisplayPreferences({
            showProgressLine: true,
            showTaskTitles: false,
            showHierarchyLines: false,
            showBaseline: true,
            showPointsOrphans: false,
            visibleColumns: ['id', 'category'],
            columnSettings: [
                { key: 'id', visible: true },
                { key: 'subject', visible: false },
                { key: 'category', visible: true }
            ],
            showVersions: false,
            organizeByDependency: true
        }, 1);

        const { vi } = await import('vitest');
        vi.resetModules();

        const [{ useUIStore }, { useTaskStore }] = await Promise.all([
            import('../stores/UIStore'),
            import('../stores/TaskStore')
        ]);
        type UIStoreState = ReturnType<typeof useUIStore.getState> & { showTaskTitles: boolean; showHierarchyLines: boolean };

        expect(useUIStore.getState().showProgressLine).toBe(true);
        expect((useUIStore.getState() as UIStoreState).showTaskTitles).toBe(false);
        expect((useUIStore.getState() as UIStoreState).showHierarchyLines).toBe(false);
        expect(useUIStore.getState().showBaseline).toBe(true);
        expect(useUIStore.getState().showPointsOrphans).toBe(false);
        expect(useUIStore.getState().visibleColumns).toEqual(['id', 'category']);
        expect(useUIStore.getState().columnSettings.find((entry) => entry.key === 'category')?.visible).toBe(true);

        expect(useTaskStore.getState().showVersions).toBe(false);
        expect(useTaskStore.getState().organizeByDependency).toBe(true);
    });

});
