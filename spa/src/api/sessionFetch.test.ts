import { afterEach, describe, expect, it, vi } from 'vitest';

describe('sessionFetch', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        if (window.RedmineCanvasGantt) window.RedmineCanvasGantt.i18n = {};
    });

    it.each([
        ['接続できませんでした', 'ja'],
        ['Could not connect', 'en']
    ])('localizes network errors: %s', async (message, language) => {
        window.RedmineCanvasGantt = { projectId: 1, apiBase: '/canvas_gantt', redmineBase: '', authToken: '', language,
            i18n: { label_network_error: message } };
        const cause = new TypeError('Failed to fetch');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause));
        const { sessionFetch } = await import('./sessionFetch');
        await expect(sessionFetch('/canvas_gantt')).rejects.toMatchObject({ message, cause });
    });

    it('preserves abort errors for cancellation guards', async () => {
        const abort = new DOMException('Aborted', 'AbortError');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
        const { sessionFetch } = await import('./sessionFetch');
        await expect(sessionFetch('/canvas_gantt')).rejects.toBe(abort);
    });

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
