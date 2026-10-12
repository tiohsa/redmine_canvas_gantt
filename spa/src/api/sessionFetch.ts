import { i18n } from '../utils/i18n';

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
    }).catch((error: unknown) => {
        // Cancellation remains distinguishable to existing async guards.
        if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') throw error;
        throw new Error(i18n.t('label_network_error') || 'Could not connect to Redmine. Check your connection and try again.', { cause: error });
    });
};
