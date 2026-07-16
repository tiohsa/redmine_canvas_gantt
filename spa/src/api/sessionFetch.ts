type SessionFetchWindow = Window & {
    __redmineCanvasGanttSessionFetchInstalled?: boolean;
};

/**
 * Canvas Gantt runs in the authenticated Redmine page. Use the same-origin
 * session and strip personal REST API keys from every browser request.
 */
export const installSameOriginSessionFetch = (): void => {
    const sessionWindow = window as SessionFetchWindow;
    if (sessionWindow.__redmineCanvasGanttSessionFetchInstalled) return;

    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
        const headers = new Headers(init.headers || {});
        headers.delete('X-Redmine-API-Key');

        return nativeFetch(input, {
            ...init,
            headers,
            credentials: 'same-origin'
        });
    };

    sessionWindow.__redmineCanvasGanttSessionFetchInstalled = true;
};
