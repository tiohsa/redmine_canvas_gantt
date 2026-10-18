import { afterEach, describe, expect, it } from 'vitest';

import { useBaselineStore } from './BaselineStore';
import type { BaselineSnapshot } from '../types/baseline';

const snapshot = (snapshotId: string): BaselineSnapshot => ({
    snapshotId,
    projectId: '1',
    capturedAt: '2026-10-17T00:00:00.000Z',
    scope: 'filtered',
    tasksByIssueId: {}
});

describe('BaselineStore', () => {
    afterEach(() => useBaselineStore.getState().reset());

    it('preserves saving and deleting status when a full read supplies a snapshot', () => {
        const store = useBaselineStore.getState();
        store.setSnapshot(snapshot('snapshot-1'));
        store.setSaveStatus('deleting');

        useBaselineStore.getState().setSnapshot(snapshot('snapshot-2'), ['new warning']);

        expect(useBaselineStore.getState()).toMatchObject({
            snapshot: snapshot('snapshot-2'),
            hasBaseline: true,
            saveStatus: 'deleting',
            warnings: ['new warning'],
            lastError: null
        });
    });

    it('clears a previous error before entering the next deletion state', () => {
        const store = useBaselineStore.getState();
        store.setLastError('previous failure');
        useBaselineStore.getState().setLastError(null);
        useBaselineStore.getState().setSaveStatus('deleting');

        expect(useBaselineStore.getState()).toMatchObject({ lastError: null, saveStatus: 'deleting' });
    });
});
