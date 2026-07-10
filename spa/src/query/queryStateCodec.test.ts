import { describe, expect, it } from 'vitest';
import {
    parseQueryContextFromUrl,
    buildQueryParamsFromQueryContext,
    serializeQueryContext,
    deserializeQueryContext
} from './queryStateCodec';
import type { QueryContext } from './types';

describe('QueryContext URL Codec Round-trip', () => {
    it('handles inherit -> URL -> inherit', () => {
        const context: QueryContext = {
            baseQueryId: null,
            overrides: {}
        };
        const params = buildQueryParamsFromQueryContext(context);
        expect(params.toString()).toBe('');

        const parsed = parseQueryContextFromUrl('?' + params.toString());
        expect(parsed.baseQueryId).toBeNull();
        expect(parsed.overrides.project).toBeUndefined();
    });

    it('handles all -> URL -> all', () => {
        const context: QueryContext = {
            baseQueryId: 42,
            overrides: {
                project: { mode: 'all' }
            }
        };
        const params = buildQueryParamsFromQueryContext(context);
        expect(params.get('query_id')).toBe('42');
        expect(params.get('set_filter')).toBe('1');
        expect(params.get('op[project_id]')).toBe('*');

        const parsed = parseQueryContextFromUrl('?' + params.toString());
        expect(parsed.baseQueryId).toBe(42);
        expect(parsed.overrides.project).toEqual({ mode: 'all' });
    });

    it('handles subset -> URL -> subset', () => {
        const context: QueryContext = {
            baseQueryId: null,
            overrides: {
                project: { mode: 'subset', values: ['p1', 'p2'] }
            }
        };
        const params = buildQueryParamsFromQueryContext(context);
        expect(params.getAll('project_ids[]')).toEqual(['p1', 'p2']);

        const parsed = parseQueryContextFromUrl('?' + params.toString());
        expect(parsed.baseQueryId).toBeNull();
        expect(parsed.overrides.project).toEqual({ mode: 'subset', values: ['p1', 'p2'] });
    });

    it('handles none -> URL -> none', () => {
        const context: QueryContext = {
            baseQueryId: null,
            overrides: {
                project: { mode: 'none' }
            }
        };
        const params = buildQueryParamsFromQueryContext(context);
        expect(params.getAll('project_ids[]')).toEqual(['none']);

        const parsed = parseQueryContextFromUrl('?' + params.toString());
        expect(parsed.baseQueryId).toBeNull();
        expect(parsed.overrides.project).toEqual({ mode: 'none' });
    });
});

describe('QueryContext Storage Codec Round-trip', () => {
    it('handles all -> Storage -> all', () => {
        const context: QueryContext = {
            baseQueryId: 100,
            overrides: {
                project: { mode: 'all' }
            }
        };
        const serialized = serializeQueryContext(context);
        const deserialized = deserializeQueryContext(serialized);
        expect(deserialized).toEqual(context);
    });

    it('handles none -> Storage -> none', () => {
        const context: QueryContext = {
            baseQueryId: null,
            overrides: {
                project: { mode: 'none' }
            }
        };
        const serialized = serializeQueryContext(context);
        const deserialized = deserializeQueryContext(serialized);
        expect(deserialized).toEqual(context);
    });

    it('handles subset -> Storage -> subset', () => {
        const context: QueryContext = {
            baseQueryId: null,
            overrides: {
                project: { mode: 'subset', values: ['p3'] }
            }
        };
        const serialized = serializeQueryContext(context);
        const deserialized = deserializeQueryContext(serialized);
        expect(deserialized).toEqual(context);
    });
});
