import { describe, expect, it, vi } from 'vitest';

describe('sessionFetch', () => {

    it('removes the Redmine API key and uses same-origin credentials', async () => {
        const response = new Response('{}', { status: 200 });
        const nativeFetch = vi.fn().mockResolvedValue(response);
        window.fetch = nativeFetch;

        const { sessionFetch } = await import('./sessionFetch');

        await sessionFetch('/projects/demo/canvas_gantt/data.json', {
            headers: {
                'Content-Type': 'application/json',
                'X-Redmine-API-Key': 'secret'
            }
        });

        expect(nativeFetch).toHaveBeenCalledTimes(1);
        const [, init] = nativeFetch.mock.calls[0];
        const headers = new Headers(init.headers);
        expect(headers.get('X-Redmine-API-Key')).toBeNull();
        expect(headers.get('Content-Type')).toBe('application/json');
        expect(init.credentials).toBe('same-origin');
    });

    it('does not replace the global fetch', async () => {
        const nativeFetch = vi.fn().mockResolvedValue(new Response('{}'));
        window.fetch = nativeFetch;

        const { sessionFetch } = await import('./sessionFetch');
        await sessionFetch('/projects/demo/canvas_gantt/data.json');

        expect(window.fetch).toBe(nativeFetch);
    });
});
