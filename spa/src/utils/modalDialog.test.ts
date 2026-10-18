import { afterEach, describe, expect, it } from 'vitest';
import { getActiveModalDialog } from './modalDialog';

describe('getActiveModalDialog', () => {
    afterEach(() => document.body.replaceChildren());

    it('returns the last modal dialog or alertdialog in DOM order', () => {
        const background = document.createElement('div');
        background.setAttribute('role', 'dialog');
        background.setAttribute('aria-modal', 'true');
        const active = document.createElement('div');
        active.setAttribute('role', 'alertdialog');
        active.setAttribute('aria-modal', 'true');
        document.body.append(background, active);

        expect(getActiveModalDialog()).toBe(active);
    });

    it('ignores nonmodal dialogs and alertdialogs', () => {
        const background = document.createElement('div');
        background.setAttribute('role', 'dialog');
        const alert = document.createElement('div');
        alert.setAttribute('role', 'alertdialog');
        document.body.append(background, alert);

        expect(getActiveModalDialog()).toBeUndefined();
    });
});
