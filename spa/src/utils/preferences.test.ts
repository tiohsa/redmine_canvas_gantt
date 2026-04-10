import { describe, it, expect, beforeEach } from 'vitest';
import { loadPreferences, savePreferences } from './preferences';

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
        savePreferences({ zoomLevel: 2 }, 1);
        savePreferences({ showProgressLine: true }, 1);

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
        expect(parsed?.version).toBe(3);
        expect(parsed?.projects?.['project:1']?.selectedProjectIds).toBeUndefined();
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
        savePreferences({ showBaseline: true }, 1);

        expect(loadPreferences(1).showBaseline).toBe(true);
        expect(loadPreferences(2).showBaseline).toBeUndefined();
    });

    it('saves and loads task title visibility preference', () => {
        savePreferences({ showTaskTitles: false } as Parameters<typeof savePreferences>[0], 1);

        const loaded = loadPreferences(1) as Record<string, unknown>;
        expect(loaded.showTaskTitles).toBe(false);
        expect(loadPreferences(2).showTaskTitles).toBeUndefined();
    });

    it('store modules restore persisted filter preferences on reload', async () => {
        savePreferences({
            showProgressLine: true,
            showTaskTitles: false,
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
        type UIStoreState = ReturnType<typeof useUIStore.getState> & { showTaskTitles: boolean };

        expect(useUIStore.getState().showProgressLine).toBe(true);
        expect((useUIStore.getState() as UIStoreState).showTaskTitles).toBe(false);
        expect(useUIStore.getState().showBaseline).toBe(true);
        expect(useUIStore.getState().showPointsOrphans).toBe(false);
        expect(useUIStore.getState().visibleColumns).toEqual(['id', 'category']);
        expect(useUIStore.getState().columnSettings.find((entry) => entry.key === 'category')?.visible).toBe(true);

        expect(useTaskStore.getState().showVersions).toBe(false);
        expect(useTaskStore.getState().organizeByDependency).toBe(true);
    });

});
