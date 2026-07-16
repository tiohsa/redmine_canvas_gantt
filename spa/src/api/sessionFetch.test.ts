import { beforeEach, describe, expect, it, vi } from 'vitest';

type SessionFetchWindow = Window & {
    __redmineCanvasGanttSessionFetchInstalled?: boolean;
};

describe('installSameOriginSessionFetch', () => {
    beforeEach(() => {
        vi.resetModules();
        delete (window as SessionFetchWindow).__redmineCanvasGanttSessionFetchInstalled;
    });

    it('removes the Redmine API key and uses same-origin credentials', async () => {
        const response = new Response('{}', { status: 200 });
        const nativeFetch = vi.fn().mockResolvedValue(response);
        window.fetch = nativeFetch;

        const { installSameOriginSessionFetch } = await import('./sessionFetch');
        installSameOriginSessionFetch();

        await window.fetch('/projects/demo/canvas_gantt/data.json', {
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

    it('is installed only once', async () => {
        const nativeFetch = vi.fn().mockResolvedValue(new Response('{}'));
        window.fetch = nativeFetch;

        const { installSameOriginSessionFetch } = await import('./sessionFetch');
        installSameOriginSessionFetch();
        const installedFetch = window.fetch;
        installSameOriginSessionFetch();

        expect(window.fetch).toBe(installedFetch);
    });
});
