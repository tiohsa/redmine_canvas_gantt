import { describe, it, expect, beforeEach } from 'vitest';
import { loadPreferences, savePreferences } from './preferences';

describe('Preferences storage', () => {
    beforeEach(() => {
        window.localStorage.clear();
        if (window.RedmineCanvasGantt) {
            window.RedmineCanvasGantt.projectId = 1;
        }
    });

    it('saves and loads selectedProjectIds per project', () => {
        const prefs = {
            selectedProjectIds: ['p1', 'p2']
        };

        savePreferences(prefs, 1);
        const loaded = loadPreferences(1);
        const notLoadedInAnotherProject = loadPreferences(2);

        expect(loaded.selectedProjectIds).toEqual(['p1', 'p2']);
        expect(notLoadedInAnotherProject.selectedProjectIds).toBeUndefined();
    });

    it('merges with existing preferences in same project', () => {
        savePreferences({ zoomLevel: 2 }, 1);
        savePreferences({ selectedProjectIds: ['p1'] }, 1);

        const loaded = loadPreferences(1);
        expect(loaded.zoomLevel).toBe(2);
        expect(loaded.selectedProjectIds).toEqual(['p1']);
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
        expect(loadedProject1.selectedProjectIds).toEqual(['legacy-project']);
        expect(loadedProject2.zoomLevel).toBeUndefined();
        expect(loadedProject2.selectedProjectIds).toBeUndefined();

        const raw = window.localStorage.getItem('canvasGantt:preferences');
        const parsed = raw ? JSON.parse(raw) : null;
        expect(parsed?.version).toBe(2);
        expect(parsed?.projects?.['project:1']?.selectedProjectIds).toEqual(['legacy-project']);
    });
});
