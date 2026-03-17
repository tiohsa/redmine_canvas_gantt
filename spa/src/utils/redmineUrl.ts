const ABSOLUTE_URL_RE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

const normalizeBase = (base: string | undefined): string => {
    if (!base) return '';
    const trimmed = base.trim();
    if (!trimmed) return '';

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.replace(/\/+$/, '');
};

export const buildRedmineUrl = (path: string): string => {
    if (!path || ABSOLUTE_URL_RE.test(path)) {
        return path;
    }

    const base = normalizeBase(window.RedmineCanvasGantt?.redmineBase);
    if (!base || !path.startsWith('/')) {
        return path;
    }

    if (path === base || path.startsWith(`${base}/`)) {
        return path;
    }

    return `${base}${path}`;
};
