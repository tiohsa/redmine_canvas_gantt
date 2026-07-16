let installed = false;

/**
 * Canvas Gantt runs in the authenticated Redmine page. Use the same-origin
 * session and strip personal REST API keys from every browser request.
 */
export const installSameOriginSessionFetch = (): void => {
    if (installed) return;

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

    installed = true;
};
