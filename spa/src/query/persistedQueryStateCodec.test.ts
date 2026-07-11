import { describe, expect, it } from 'vitest';
import {
    decodeSharedQueryEnvelope,
    encodeSharedQueryEnvelope,
    STORAGE_VERSION
} from './persistedQueryStateCodec';

describe('persisted query state codec', () => {
    it('decodes and migrates legacy envelopes without browser APIs', () => {
        const decoded = decodeSharedQueryEnvelope({
            version: 2,
            projects: {
                'project:1': {
                    queryContext: { baseQueryId: 12, overrides: {} },
                    sharedViewState: { groupBy: 'assignee', showSubprojects: false }
                }
            }
        });

        expect(decoded).toEqual({
            version: STORAGE_VERSION,
            projects: {
                'project:1': {
                    scopeState: { showSubprojects: false },
                    queryContext: { baseQueryId: 12, overrides: {} },
                    sharedViewState: { groupBy: 'assignee' }
                }
            }
        });
    });

    it('encodes the current envelope shape as a pure value', () => {
        const projectState = {
            scopeState: { showSubprojects: true },
            queryContext: { baseQueryId: null, overrides: {} },
            sharedViewState: {}
        };

        expect(encodeSharedQueryEnvelope({ 'project:global': projectState })).toEqual({
            version: STORAGE_VERSION,
            projects: { 'project:global': projectState }
        });
    });
});
