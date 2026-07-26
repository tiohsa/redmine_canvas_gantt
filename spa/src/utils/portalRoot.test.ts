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

    it('rejects an element with the reserved id when it is not a div', () => {
        const conflictingElement = document.createElement('span');
        conflictingElement.id = 'redmine-canvas-gantt-portal-root';
        document.body.appendChild(conflictingElement);

        expect(() => getPortalRoot()).toThrow('must be a div');
        expect(document.body.querySelectorAll('#redmine-canvas-gantt-portal-root')).toHaveLength(1);
    });
});
