/**
 * Build a request for Canvas Gantt's authenticated same-origin API without
 * changing the browser's global fetch implementation.
 */
export const sessionFetch = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    const headers = new Headers(init.headers || {});
    headers.delete('X-Redmine-API-Key');

    return nativeFetch(input, {
        ...init,
        headers,
        credentials: 'same-origin'
    });
};
