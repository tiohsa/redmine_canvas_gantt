const PORTAL_ROOT_ID = 'redmine-canvas-gantt-portal-root';

export const getPortalRoot = (): HTMLDivElement => {
    const existingRoot = document.getElementById(PORTAL_ROOT_ID);
    if (existingRoot instanceof HTMLDivElement) {
        return existingRoot;
    }

    const portalRoot = document.createElement('div');
    portalRoot.id = PORTAL_ROOT_ID;
    portalRoot.className = 'rcg-theme';
    document.body.appendChild(portalRoot);
    return portalRoot;
};
