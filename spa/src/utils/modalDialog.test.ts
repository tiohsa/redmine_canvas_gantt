import { describe, expect, it } from 'vitest';

import { getActiveModalDialog } from './modalDialog';

describe('getActiveModalDialog', () => {
    it('treats the topmost modal alertdialog as active', () => {
        document.body.innerHTML = `
            <div role="dialog" aria-modal="true" data-testid="first-dialog"></div>
            <div role="alertdialog" aria-modal="true" data-testid="active-alert"></div>
        `;
        try {
            expect(getActiveModalDialog()).toBe(document.querySelector('[data-testid="active-alert"]'));
        } finally {
            document.body.innerHTML = '';
        }
    });
});
