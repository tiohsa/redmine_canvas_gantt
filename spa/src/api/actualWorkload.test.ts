import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';

const params = { query: { canvasProjectIds: ['1'] }, queryContext: { baseQueryId: 12, overrides: {} },
    from: '2026-09-05', to: '2026-09-07', leafOnly: true, includeClosed: false };

describe('actual workload API contract', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('preserves calendar date strings and sends bounded query parameters with session credentials', async () => {
        const entry = { id: '1:2026-09-05:2', issueId: '2', userId: 1, userName: 'Worker', spentOn: '2026-09-05', hours: 3 };
        const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ entries: [entry] })));
        vi.stubGlobal('fetch', fetch);
        expect(await apiClient.fetchActualWorkload(params)).toEqual([entry]);
        const [url, init] = fetch.mock.calls[0];
        const query = new URL(url).searchParams;
        expect(query.get('from')).toBe('2026-09-05');
        expect(query.get('to')).toBe('2026-09-07');
        expect(query.get('query_id')).toBe('12');
        expect(query.get('leaf_only')).toBe('1');
        expect(query.get('include_closed')).toBe('0');
        expect(init.credentials).toBe('same-origin');
        expect(init.headers.has('X-Redmine-API-Key')).toBe(false);
    });
    it.each([{}, { entries: null }, { entries: [{ spentOn: '2026-02-30' }] }])('rejects malformed data instead of returning an empty workload', async payload => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
        await expect(apiClient.fetchActualWorkload(params)).rejects.toThrow('Invalid actual workload');
    });
    it('distinguishes an empty successful response from an HTTP failure', async () => {
        const fetch = vi.fn().mockResolvedValueOnce(new Response('{"entries":[]}'))
            .mockResolvedValueOnce(new Response('{"error":"Forbidden"}', { status: 403 }));
        vi.stubGlobal('fetch', fetch);
        expect(await apiClient.fetchActualWorkload(params)).toEqual([]);
        await expect(apiClient.fetchActualWorkload(params)).rejects.toThrow();
    });
});
