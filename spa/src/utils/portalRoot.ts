const PORTAL_ROOT_ID = 'redmine-canvas-gantt-portal-root';

export const getPortalRoot = (): HTMLDivElement => {
    const existingRoot = document.getElementById(PORTAL_ROOT_ID);
    if (existingRoot) {
        if (!(existingRoot instanceof HTMLDivElement)) {
            throw new Error(`Element #${PORTAL_ROOT_ID} must be a div`);
        }

        existingRoot.classList.add('rcg-theme');
        return existingRoot;
    }

    const portalRoot = document.createElement('div');
    portalRoot.id = PORTAL_ROOT_ID;
    portalRoot.className = 'rcg-theme';
    document.body.appendChild(portalRoot);
    return portalRoot;
};
