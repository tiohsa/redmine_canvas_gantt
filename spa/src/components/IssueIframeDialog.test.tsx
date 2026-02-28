import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IssueIframeDialog } from './IssueIframeDialog';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';
import { applyIssueDialogStyles, findIssueDialogErrorElement, getIssueDialogErrorMessage } from '../utils/iframeStyles';

vi.mock('../utils/iframeStyles', () => ({
    applyIssueDialogStyles: vi.fn(),
    findIssueDialogErrorElement: vi.fn(),
    getIssueDialogErrorMessage: vi.fn()
}));

describe('IssueIframeDialog', () => {
    beforeEach(() => {
        useUIStore.setState({ issueDialogUrl: '/issues/123/edit' });
        useTaskStore.setState({ refreshData: vi.fn() as unknown as () => Promise<void> });
        vi.mocked(applyIssueDialogStyles).mockReset();
        vi.mocked(findIssueDialogErrorElement).mockReset();
        vi.mocked(getIssueDialogErrorMessage).mockReset();
    });

    it('applies iframe styles on load', () => {
        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');

        const iframeWindow = { location: { href: 'http://example.com/issues/123/edit' }, document: doc };
        Object.defineProperty(iframe, 'contentWindow', {
            value: iframeWindow,
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc });

        fireEvent.load(iframe);

        expect(applyIssueDialogStyles).toHaveBeenCalledWith(doc);
    });

    it('shows error message when iframe contains an error', () => {
        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        const errorElement = doc.createElement('div');

        vi.mocked(findIssueDialogErrorElement).mockReturnValue(errorElement);
        vi.mocked(getIssueDialogErrorMessage).mockReturnValue('Permission denied');

        const iframeWindow = { location: { href: 'http://example.com/issues/123/edit' }, document: doc };
        Object.defineProperty(iframe, 'contentWindow', {
            value: iframeWindow,
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc });

        fireEvent.load(iframe);

        expect(screen.getByTestId('issue-dialog-error')).toHaveTextContent('Permission denied');
    });

    it('closes the dialog when Escape key is pressed', () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        useTaskStore.setState({ refreshData: refreshData as unknown as () => Promise<void> });

        render(<IssueIframeDialog />);
        fireEvent.keyDown(window, { key: 'Escape' });

        expect(useUIStore.getState().issueDialogUrl).toBeNull();
        expect(refreshData).toHaveBeenCalledTimes(1);
    });

    it('closes dialog when save transitions to issue show even if issue-form remains', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        useTaskStore.setState({ refreshData: refreshData as unknown as () => Promise<void> });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="issue-form">
              <input name="commit" type="submit" value="Save" />
            </form>
        `;

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);

        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123' }, document: doc }
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc });

        fireEvent.load(iframe);
        const saveButton = screen.getByRole('button', { name: 'Save' });
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        // URL is /issues/:id and no error block -> treat as successful save.
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(useUIStore.getState().issueDialogUrl).toBeNull();
            expect(refreshData).toHaveBeenCalledTimes(1);
        });
    });

    it('closes dialog when save transitions to issue show without issue-form', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        useTaskStore.setState({ refreshData: refreshData as unknown as () => Promise<void> });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="issue-form">
              <input name="commit" type="submit" value="Save" />
            </form>
        `;

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);

        const iframeWindow = { location: { href: 'http://example.com/issues/123/edit' }, document: doc };
        Object.defineProperty(iframe, 'contentWindow', {
            value: iframeWindow,
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc });

        fireEvent.load(iframe);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        // Simulate successful transition to show page content (no edit form).
        doc.body.innerHTML = `<div id="content"><p>Issue detail</p></div>`;
        iframeWindow.location.href = 'http://example.com/issues/123';
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(useUIStore.getState().issueDialogUrl).toBeNull();
            expect(refreshData).toHaveBeenCalledTimes(1);
        });
    });

    it('keeps dialog open on issue show path when save result has error', async () => {
        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="issue-form">
              <input name="commit" type="submit" value="Save" />
            </form>
        `;

        const iframeWindow = { location: { href: 'http://example.com/issues/123/edit' }, document: doc };
        Object.defineProperty(iframe, 'contentWindow', {
            value: iframeWindow,
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc });

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
        fireEvent.load(iframe);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        iframeWindow.location.href = 'http://example.com/issues/123';
        vi.mocked(getIssueDialogErrorMessage).mockReturnValue('Validation failed');
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
            expect(useUIStore.getState().issueDialogUrl).toBe('/issues/123/edit');
        });
    });

    it('closes dialog when saving from new issue page to issue show', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        useTaskStore.setState({ refreshData: refreshData as unknown as () => Promise<void> });
        useUIStore.setState({ issueDialogUrl: '/projects/p1/issues/new' });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="issue-form">
              <input name="commit" type="submit" value="Save" />
            </form>
        `;

        const iframeWindow = { location: { href: 'http://example.com/projects/p1/issues/new' }, document: doc };
        Object.defineProperty(iframe, 'contentWindow', {
            value: iframeWindow,
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc });

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
        fireEvent.load(iframe);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        iframeWindow.location.href = 'http://example.com/issues/456';
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(useUIStore.getState().issueDialogUrl).toBeNull();
            expect(refreshData).toHaveBeenCalledTimes(1);
        });
    });

    it('resets saving state when dialog is reopened', async () => {
        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="issue-form">
              <input name="commit" type="submit" value="Save" />
            </form>
        `;

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);

        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123/edit' }, document: doc }
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc });

        fireEvent.load(iframe);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        act(() => {
            useUIStore.setState({ issueDialogUrl: null });
            useUIStore.setState({ issueDialogUrl: '/issues/999/edit' });
        });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
        });
    });
});
