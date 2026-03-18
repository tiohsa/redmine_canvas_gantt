import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IssueIframeDialog } from './IssueIframeDialog';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';
import { applyIssueDialogStyles, findIssueDialogErrorElement, getIssueDialogErrorMessage } from '../utils/iframeStyles';

vi.mock('../utils/iframeStyles', () => ({
    applyIssueDialogStyles: vi.fn(),
    findIssueDialogErrorElement: vi.fn(),
    getIssueDialogErrorMessage: vi.fn()
}));

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

const setElementHeight = (element: HTMLElement, height: number) => {
    Object.defineProperty(element, 'scrollHeight', {
        configurable: true,
        value: height
    });
    Object.defineProperty(element, 'clientHeight', {
        configurable: true,
        value: height
    });
    Object.defineProperty(element, 'offsetHeight', {
        configurable: true,
        value: height
    });
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            width: 0,
            height,
            top: 0,
            left: 0,
            right: 0,
            bottom: height,
            x: 0,
            y: 0,
            toJSON: () => ({})
        })
    });
};

describe('IssueIframeDialog', () => {
    beforeEach(() => {
        window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
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

    it('hides iframe until load completes', () => {
        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');

        expect(iframe).toHaveClass('issue-iframe-loading');

        const iframeWindow = { location: { href: 'http://example.com/issues/123/edit' }, document: doc };
        Object.defineProperty(iframe, 'contentWindow', {
            value: iframeWindow,
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc });

        fireEvent.load(iframe);

        expect(iframe).not.toHaveClass('issue-iframe-loading');
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

    it('renders compact chrome with left-aligned footer actions', () => {
        render(<IssueIframeDialog />);

        const header = screen.getByTestId('issue-dialog-header');
        const footer = screen.getByTestId('issue-dialog-footer');
        const title = screen.getByText('Issue #123');
        const openInNewTabLink = screen.getByRole('link', { name: 'Open issue in new tab' });
        const closeButton = screen.getByRole('button', { name: 'Close issue dialog' });
        const footerButtons = within(footer).getAllByRole('button');

        expect(header.style.paddingTop).toBe('2px');
        expect(header.style.paddingRight).toBe('12px');
        expect(header.style.paddingBottom).toBe('2px');
        expect(header.style.paddingLeft).toBe('12px');
        expect(title.style.fontSize).toBe('14px');
        expect(openInNewTabLink.style.width).toBe('24px');
        expect(openInNewTabLink.style.height).toBe('24px');
        expect(closeButton.style.width).toBe('24px');
        expect(closeButton.style.height).toBe('24px');

        expect(footer.style.justifyContent).toBe('flex-start');
        expect(footer.style.gap).toBe('6px');
        expect(footer.style.paddingTop).toBe('2px');
        expect(footer.style.paddingRight).toBe('12px');
        expect(footer.style.paddingBottom).toBe('4px');
        expect(footer.style.paddingLeft).toBe('12px');
        expect(footerButtons).toHaveLength(2);
        expect(footerButtons[0]).toHaveTextContent('Cancel');
        expect(footerButtons[1]).toHaveTextContent('Save');
        expect(footerButtons[0].style.height).toBe('28px');
        expect(footerButtons[1].style.height).toBe('28px');
        expect(footerButtons[0].style.minWidth).toBe('88px');
        expect(footerButtons[1].style.minWidth).toBe('88px');
    });

    it('shrinks dialog height for short iframe content', async () => {
        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        const content = doc.createElement('div');
        content.id = 'content';
        doc.body.appendChild(content);

        setElementHeight(content, 120);
        setElementHeight(doc.body, 120);
        setElementHeight(doc.documentElement, 120);

        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123/edit' }, document: doc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc, configurable: true });

        fireEvent.load(iframe);

        await waitFor(() => {
            const dialog = screen.getByTestId('issue-dialog-header').parentElement as HTMLDivElement;
            expect(dialog.style.height).toBe('320px');
        });
    });

    it('clamps dialog height for tall iframe content', async () => {
        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        const content = doc.createElement('div');
        content.id = 'content';
        doc.body.appendChild(content);

        setElementHeight(content, 2000);
        setElementHeight(doc.body, 2000);
        setElementHeight(doc.documentElement, 2000);

        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123/edit' }, document: doc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc, configurable: true });

        fireEvent.load(iframe);

        await waitFor(() => {
            const dialog = screen.getByTestId('issue-dialog-header').parentElement as HTMLDivElement;
            expect(dialog.style.height).toBe(`${Math.floor(window.innerHeight * 0.9)}px`);
        });
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
        useUIStore.setState({ issueDialogUrl: '/redmine/issues/123/edit' });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="issue-form">
              <input name="commit" type="submit" value="Save" />
            </form>
        `;

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);

        const iframeWindow = { location: { href: 'http://example.com/redmine/issues/123/edit' }, document: doc };
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
        iframeWindow.location.href = 'http://example.com/redmine/issues/123';
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
        useUIStore.setState({ issueDialogUrl: '/redmine/projects/p1/issues/new' });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="issue-form">
              <input name="commit" type="submit" value="Save" />
            </form>
        `;

        const iframeWindow = { location: { href: 'http://example.com/redmine/projects/p1/issues/new' }, document: doc };
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

        iframeWindow.location.href = 'http://example.com/redmine/issues/456';
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
