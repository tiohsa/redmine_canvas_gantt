import { describe, expect, it } from 'vitest';
import { applyIssueDialogStyles, findIssueDialogErrorElement, getIssueDialogErrorMessage, ISSUE_DIALOG_STYLE_ID } from './iframeStyles';

describe('iframeStyles', () => {
    it('injects dialog styles once', () => {
        const doc = document.implementation.createHTMLDocument('iframe');

        applyIssueDialogStyles(doc);
        applyIssueDialogStyles(doc);

        const styleTags = doc.querySelectorAll(`#${ISSUE_DIALOG_STYLE_ID}`);
        expect(styleTags.length).toBe(1);
        const css = styleTags[0]?.textContent || '';
        expect(css).toContain('#top-menu');
        expect(css).toContain('#content > h2');
        expect(css).toContain('#issue-form > p.buttons');
        expect(css).toContain('#issue-form > .buttons');
        expect(css).toContain('html, body, #wrapper, #main');
        expect(css).toContain('overflow-y: auto');
        expect(css).not.toContain(', p.buttons,');
        expect(css).not.toContain(', .buttons,');
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

    it('detects conflict warning block as an error signal', () => {
        const doc = document.implementation.createHTMLDocument('iframe');
        const conflict = doc.createElement('div');
        conflict.className = 'conflict';
        conflict.textContent = 'Update conflict';
        doc.body.appendChild(conflict);

        expect(findIssueDialogErrorElement(doc)).toBe(conflict);
        expect(getIssueDialogErrorMessage(doc)).toBe('Update conflict');
    });
});
