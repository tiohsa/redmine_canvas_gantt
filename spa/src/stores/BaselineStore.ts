import { create } from 'zustand';
import type { BaselineSnapshot } from '../types/baseline';

type BaselineSaveStatus = 'idle' | 'saving' | 'deleting' | 'ready' | 'error';

interface BaselineState {
    snapshot: BaselineSnapshot | null;
    hasBaseline: boolean;
    saveStatus: BaselineSaveStatus;
    warnings: string[];
    lastError: string | null;
    setSnapshot: (snapshot: BaselineSnapshot | null, warnings?: string[]) => void;
    setSaveStatus: (status: BaselineSaveStatus) => void;
    setWarnings: (warnings: string[]) => void;
    setLastError: (message: string | null) => void;
    reset: () => void;
}

export const useBaselineStore = create<BaselineState>((set) => ({
    snapshot: null,
    hasBaseline: false,
    saveStatus: 'idle',
    warnings: [],
    lastError: null,
    setSnapshot: (snapshot, warnings = []) => set((state) => ({
        snapshot,
        hasBaseline: Boolean(snapshot),
        warnings,
        lastError: null,
        saveStatus: state.saveStatus === 'saving' || state.saveStatus === 'deleting'
            ? state.saveStatus
            : snapshot ? 'ready' : 'idle'
    })),
    setSaveStatus: (status) => set(() => ({ saveStatus: status })),
    setWarnings: (warnings) => set(() => ({ warnings })),
    setLastError: (message) => set(() => ({ lastError: message, saveStatus: message ? 'error' : 'idle' })),
    reset: () => set(() => ({
        snapshot: null,
        hasBaseline: false,
        saveStatus: 'idle',
        warnings: [],
        lastError: null
    }))
}));
