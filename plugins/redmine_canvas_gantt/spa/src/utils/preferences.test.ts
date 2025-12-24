import { describe, it, expect, beforeEach } from 'vitest';
import { loadPreferences, savePreferences } from './preferences';

describe('Preferences storage', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('saves and loads selectedProjectIds', () => {
        const prefs = {
            selectedProjectIds: ['p1', 'p2']
        };

        savePreferences(prefs);
        const loaded = loadPreferences();

        expect(loaded.selectedProjectIds).toEqual(['p1', 'p2']);
    });

    it('merges with existing preferences', () => {
        savePreferences({ zoomLevel: 2 });
        savePreferences({ selectedProjectIds: ['p1'] });

        const loaded = loadPreferences();
        expect(loaded.zoomLevel).toBe(2);
        expect(loaded.selectedProjectIds).toEqual(['p1']);
    });
});
