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
        expect(css).toContain('#content > .contextual');
        expect(css).toContain('#issue-form > p.buttons');
        expect(css).toContain('#issue-form > .buttons');
        expect(css).toContain('html, body, #wrapper, #main');
        expect(css).toContain('overflow-y: auto');
        expect(css).not.toContain(', p.buttons,');
        expect(css).not.toContain(', .buttons,');
    });

    it('preserves issue contextual actions on issue show pages', () => {
        const doc = document.implementation.createHTMLDocument('iframe');

        applyIssueDialogStyles(doc, false, true);

        const styleTag = doc.querySelector(`#${ISSUE_DIALOG_STYLE_ID}`);
        const css = styleTag?.textContent || '';

        expect(css).not.toContain('#content > .contextual');
        expect(css).toContain('#top-menu');
        expect(css).toContain('#issue-form > p.buttons');
    });


    it('keeps issue form buttons hidden while leaving journal edit buttons available', () => {
        const doc = document.implementation.createHTMLDocument('iframe');

        applyIssueDialogStyles(doc, false, true);

        const css = doc.querySelector(`#${ISSUE_DIALOG_STYLE_ID}`)?.textContent || '';
        expect(css).toContain('#issue-form > p.buttons');
        expect(css).not.toContain('form[action*="/journals/"] { display: none');
        expect(css).not.toContain('form[id^="journal-"][id$="-form"] { display: none');
    });

    it('adds issue detail safe area styles only on issue show pages', () => {
        const formDoc = document.implementation.createHTMLDocument('form iframe');
        const showDoc = document.implementation.createHTMLDocument('show iframe');

        applyIssueDialogStyles(formDoc, false, false);
        applyIssueDialogStyles(showDoc, false, true);

        const formCss = formDoc.querySelector(`#${ISSUE_DIALOG_STYLE_ID}`)?.textContent || '';
        const showCss = showDoc.querySelector(`#${ISSUE_DIALOG_STYLE_ID}`)?.textContent || '';

        expect(formCss).not.toContain('padding-bottom: 96px');
        expect(showCss).toContain('#content { padding-bottom: 96px !important; }');
        expect(showCss).toContain('scroll-margin-bottom: 96px');
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
