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

        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123/edit' }, document: doc }
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

        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123/edit' }, document: doc }
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

    it('re-enables Save after non-success load while saving', async () => {
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
        const saveButton = screen.getByRole('button', { name: 'Save' });
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        // Still on edit URL and no detected success transition: must unlock retry.
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
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
