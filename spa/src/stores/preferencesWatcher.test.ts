import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as preferences from '../utils/preferences';
import { useTaskStore } from './TaskStore';
import { useUIStore } from './UIStore';
import { syncSharedQueryState } from './taskStore/querySync';
import './preferencesWatcher';

vi.mock('../utils/preferences', async () => {
    const actual = await vi.importActual<typeof import('../utils/preferences')>('../utils/preferences');
    return {
        ...actual,
        saveDisplayPreferences: vi.fn(),
        saveGlobalDisplayPreferences: vi.fn(),
        savePreferences: vi.fn()
    };
});

vi.mock('./taskStore/querySync', async () => {
    const actual = await vi.importActual<typeof import('./taskStore/querySync')>('./taskStore/querySync');
    return { ...actual, syncSharedQueryState: vi.fn() };
});

describe('preferencesWatcher', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useTaskStore.setState({ initialDataLoaded: true });
        useUIStore.setState(useUIStore.getInitialState(), true);
        vi.clearAllMocks();
    });

    it.each([true, false])('persists effective Auto Save only after save success=%s', async (success) => {
        let complete!: (failures: Map<string, string>) => void;
        const pending = new Promise<Map<string, string>>(resolve => { complete = resolve; });
        useTaskStore.setState({ autoSave: false, modifiedTaskIds: new Set(['task-1']), saveChanges: () => pending });
        vi.mocked(preferences.savePreferences).mockClear();

        const enabling = useTaskStore.getState().requestAutoSaveChange(true);
        expect(preferences.savePreferences).not.toHaveBeenCalled();
        if (success) useTaskStore.setState({ modifiedTaskIds: new Set() });
        complete(success ? new Map() : new Map([['task-1', 'failed']]));
        await enabling;

        expect(useTaskStore.getState().autoSave).toBe(success);
        if (success) {
            expect(preferences.savePreferences).toHaveBeenCalledWith(expect.objectContaining({ autoSave: true }));
        } else {
            expect(preferences.savePreferences).not.toHaveBeenCalled();
        }
    });

    it('persists a font-size change only as Display Preferences', () => {
        useUIStore.getState().setSidebarFontSize(15);

        expect(preferences.saveDisplayPreferences).toHaveBeenCalledTimes(1);
        expect(preferences.saveGlobalDisplayPreferences).not.toHaveBeenCalled();
        expect(preferences.savePreferences).not.toHaveBeenCalled();
        expect(syncSharedQueryState).not.toHaveBeenCalled();
    });

    it('persists a row-height change only as Display Preferences', () => {
        useTaskStore.getState().setRowHeight(44);

        expect(preferences.saveDisplayPreferences).toHaveBeenCalledTimes(1);
        expect(preferences.savePreferences).not.toHaveBeenCalled();
        expect(syncSharedQueryState).not.toHaveBeenCalled();
    });

    it('does not sync Query State for viewport scrolling', () => {
        useTaskStore.getState().updateViewport({ scrollX: 24 });

        expect(preferences.saveDisplayPreferences).toHaveBeenCalledTimes(1);
        expect(preferences.savePreferences).not.toHaveBeenCalled();
        expect(syncSharedQueryState).not.toHaveBeenCalled();
    });

    it('persists General Preferences without Display or Query writes', () => {
        useUIStore.getState().setDefaultRelationType('blocks');

        expect(preferences.saveDisplayPreferences).not.toHaveBeenCalled();
        expect(preferences.savePreferences).toHaveBeenCalledTimes(1);
        expect(syncSharedQueryState).not.toHaveBeenCalled();
    });

    it('syncs Query State without persisting unrelated preference groups', () => {
        useTaskStore.setState({ selectedStatusIds: [1] });

        expect(preferences.saveDisplayPreferences).not.toHaveBeenCalled();
        expect(preferences.savePreferences).not.toHaveBeenCalled();
        expect(syncSharedQueryState).toHaveBeenCalledTimes(1);
    });
});
