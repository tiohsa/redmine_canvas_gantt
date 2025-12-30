import { describe, expect, it } from 'vitest';
import { applyIssueDialogStyles, findIssueDialogErrorElement, getIssueDialogErrorMessage, ISSUE_DIALOG_STYLE_ID } from './iframeStyles';

describe('iframeStyles', () => {
    it('injects dialog styles once', () => {
        const doc = document.implementation.createHTMLDocument('iframe');

        applyIssueDialogStyles(doc);
        applyIssueDialogStyles(doc);

        const styleTags = doc.querySelectorAll(`#${ISSUE_DIALOG_STYLE_ID}`);
        expect(styleTags.length).toBe(1);
        expect(styleTags[0]?.textContent).toContain('#top-menu');
        expect(styleTags[0]?.textContent).toContain('#content > .tabs > ul');
    });

    it('detects error message from standard error elements', () => {
        const doc = document.implementation.createHTMLDocument('iframe');
        const error = doc.createElement('div');
        error.id = 'errorExplanation';
        error.textContent = 'Permission denied';
        doc.body.appendChild(error);

        expect(findIssueDialogErrorElement(doc)).toBe(error);
        expect(getIssueDialogErrorMessage(doc)).toBe('Permission denied');
    });
});
