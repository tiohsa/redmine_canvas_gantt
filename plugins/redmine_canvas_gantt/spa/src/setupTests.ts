import '@testing-library/jest-dom';

if (typeof window !== 'undefined') {
    const storage = (window as any).localStorage;
    if (!storage || typeof storage.getItem !== 'function') {
        const store = new Map<string, string>();
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: (key: string) => store.get(key) ?? null,
                setItem: (key: string, value: string) => {
                    store.set(key, String(value));
                },
                removeItem: (key: string) => {
                    store.delete(key);
                },
                clear: () => {
                    store.clear();
                }
            },
            configurable: true
        });
    }
}
