import { afterEach, describe, expect, it } from 'vitest';

import { getPortalRoot } from './portalRoot';

describe('getPortalRoot', () => {
    afterEach(() => {
        document.getElementById('redmine-canvas-gantt-portal-root')?.remove();
    });

    it('creates one shared, scoped root', () => {
        const first = getPortalRoot();
        const second = getPortalRoot();

        expect(first).toBe(second);
        expect(first).toHaveAttribute('id', 'redmine-canvas-gantt-portal-root');
        expect(first).toHaveClass('rcg-theme');
        expect(document.body.querySelectorAll('#redmine-canvas-gantt-portal-root')).toHaveLength(1);
    });
});
