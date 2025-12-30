import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
});
