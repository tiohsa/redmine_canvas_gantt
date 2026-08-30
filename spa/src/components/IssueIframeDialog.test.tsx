import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IssueIframeDialog } from './IssueIframeDialog';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';
import { useTimerStore } from '../stores/TimerStore';
import { applyIssueDialogStyles, findIssueDialogErrorElement, getIssueDialogErrorMessage } from '../utils/iframeStyles';
import { persistTimerSession } from '../services/timerStorage';

type RefreshData = ReturnType<typeof useTaskStore.getState>['refreshData'];

vi.mock('../utils/iframeStyles', () => ({
    applyIssueDialogStyles: vi.fn(),
    applyLinkTargetBlank: vi.fn(),
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
        window.localStorage.clear();
        window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
        useUIStore.setState({ issueDialogUrl: '/issues/123/edit', issueDialogContext: null, queryDialogUrl: null });
        useTimerStore.setState({ session: null });
        useTaskStore.setState({ refreshData: vi.fn() as unknown as RefreshData });
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

        expect(applyIssueDialogStyles).toHaveBeenCalledWith(doc, false, false);
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
        expect(applyIssueDialogStyles).toHaveBeenCalledWith(doc, false, false);
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
        useTaskStore.setState({ refreshData: refreshData as unknown as RefreshData });

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
        expect(footer.style.gap).toBe('8px');
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

    it('offers bulk child creation for an issue show dialog', () => {
        useUIStore.setState({ issueDialogUrl: '/issues/123', queryDialogUrl: null });

        render(<IssueIframeDialog />);

        fireEvent.click(screen.getByText('Bulk Ticket Creation'));

        expect(screen.getByTestId('bulk-subtask-subjects')).toBeInTheDocument();
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
            expect(dialog.style.height).toBe('600px');
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


    it('shows issue detail actions without a save button on issue show pages', () => {
        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = '<div id="content"><p>Issue detail</p></div>';

        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123' }, document: doc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc, configurable: true });

        fireEvent.load(iframe);

        expect(applyIssueDialogStyles).toHaveBeenCalledWith(doc, false, true);
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Edit issue' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save issue' })).not.toBeInTheDocument();
    });

    it('changes the issue-show primary action to Save and auto-submits the parent exactly once', async () => {
        useUIStore.setState({ issueDialogUrl: '/issues/123', queryDialogUrl: null });
        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = '<div id="content"><p>Issue detail</p></div>';
        const iframeWindow = { location: { href: 'http://example.com/issues/123' }, document: doc };
        Object.defineProperty(iframe, 'contentWindow', { value: iframeWindow, configurable: true });
        Object.defineProperty(iframe, 'contentDocument', { value: doc, configurable: true });
        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);

        fireEvent.load(iframe);
        fireEvent.click(screen.getByText('Bulk Ticket Creation'));
        fireEvent.change(screen.getByTestId('bulk-subtask-subjects'), {
            target: { value: 'Child A' }
        });

        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(iframeWindow.location.href).toBe('/issues/123/edit');
        expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();

        doc.body.innerHTML = '<form id="issue-form"><input type="submit" value="Save" /></form>';
        const submit = doc.querySelector('input[type="submit"]') as HTMLInputElement;
        const submitClick = vi.spyOn(submit, 'click');
        iframeWindow.location.href = 'http://example.com/issues/123/edit';
        fireEvent.load(iframe);
        expect(submitClick).toHaveBeenCalledTimes(1);

        fireEvent.load(iframe);
        expect(submitClick).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
    });

    it('shows Save comment and submits the active journal edit form', () => {
        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="journal-7-form" action="/journals/7">
              <textarea name="journal[notes]"></textarea>
              <input name="commit" type="submit" value="Save" />
            </form>
        `;

        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123' }, document: doc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc, configurable: true });
        const journalSubmit = doc.querySelector('input[type="submit"]') as HTMLInputElement;
        const journalClick = vi.spyOn(journalSubmit, 'click');

        fireEvent.load(iframe);

        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save comment' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Edit issue' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));

        expect(journalClick).toHaveBeenCalledTimes(1);
    });

    it('returns to issue detail actions and refreshes data after comment save success', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        useTaskStore.setState({ refreshData: refreshData as unknown as RefreshData });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="journal-7-form" action="/journals/7">
              <textarea name="journal[notes]"></textarea>
              <input name="commit" type="submit" value="Save" />
            </form>
        `;
        const iframeWindow = { location: { href: 'http://example.com/issues/123' }, document: doc };
        Object.defineProperty(iframe, 'contentWindow', { value: iframeWindow, configurable: true });
        Object.defineProperty(iframe, 'contentDocument', { value: doc, configurable: true });

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
        fireEvent.load(iframe);
        fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Saving comment|loading|saving/i })).toBeDisabled();
        });

        doc.body.innerHTML = '<div id="content"><p>Issue detail</p></div>';
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(refreshData).toHaveBeenCalledTimes(1);
            expect(screen.getByRole('button', { name: 'Edit issue' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Save comment' })).not.toBeInTheDocument();
        });
    });

    it('keeps Save comment visible when comment save returns an error', async () => {
        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="journal-7-form" action="/journals/7">
              <textarea name="journal[notes]"></textarea>
              <input name="commit" type="submit" value="Save" />
            </form>
        `;
        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123' }, document: doc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc, configurable: true });

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
        fireEvent.load(iframe);
        fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue('Comment error');
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Save comment' })).not.toBeDisabled();
            expect(screen.queryByRole('button', { name: 'Edit issue' })).not.toBeInTheDocument();
        });
    });

    it('finishes comment save when the journal form disappears without an iframe reload', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        useTaskStore.setState({ refreshData: refreshData as unknown as RefreshData });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="journal-7-form" action="/journals/7">
              <textarea name="journal[notes]"></textarea>
              <input name="commit" type="submit" value="Save" />
            </form>
        `;

        const iframeWindow = { location: { href: 'http://example.com/issues/123' }, document: doc };
        Object.defineProperty(iframe, 'contentWindow', {
            value: iframeWindow,
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc, configurable: true });

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
        fireEvent.load(iframe);
        fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Saving comment|loading|saving/i })).toBeDisabled();
        });

        doc.body.innerHTML = '<div id="content"><p>Issue detail</p></div>';

        await waitFor(() => {
            expect(refreshData).toHaveBeenCalledTimes(1);
            expect(screen.getByRole('button', { name: 'Edit issue' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Save comment' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
        });
    });

    it('keeps dialog open in issue detail mode when save transitions to issue show even if issue-form remains', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        useTaskStore.setState({ refreshData: refreshData as unknown as RefreshData });

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
            value: iframeWindow
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc });

        fireEvent.load(iframe);
        const saveButton = screen.getByRole('button', { name: 'Save issue' });
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        // URL is /issues/:id and no error block -> treat as successful save.
        iframeWindow.location.href = 'http://example.com/issues/123';
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(useUIStore.getState().issueDialogUrl).toBe('/issues/123/edit');
            expect(refreshData).toHaveBeenCalledTimes(1);
            expect(screen.queryByRole('button', { name: 'Save issue' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Edit|Edit again/ })).toBeInTheDocument();
        });
    });

    it('keeps dialog open in issue detail mode when save transitions to issue show without issue-form', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        useTaskStore.setState({ refreshData: refreshData as unknown as RefreshData });
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
        fireEvent.click(screen.getByRole('button', { name: 'Save issue' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        // Simulate successful transition to show page content (no edit form).
        doc.body.innerHTML = `<div id="content"><p>Issue detail</p></div>`;
        iframeWindow.location.href = 'http://example.com/redmine/issues/123';
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(useUIStore.getState().issueDialogUrl).toBe('/redmine/issues/123/edit');
            expect(refreshData).toHaveBeenCalledTimes(1);
            expect(screen.queryByRole('button', { name: 'Save issue' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Edit|Edit again/ })).toBeInTheDocument();
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
        fireEvent.click(screen.getByRole('button', { name: 'Save issue' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        iframeWindow.location.href = 'http://example.com/issues/123';
        vi.mocked(getIssueDialogErrorMessage).mockReturnValue('Validation failed');
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Save|Save issue/ })).not.toBeDisabled();
            expect(useUIStore.getState().issueDialogUrl).toBe('/issues/123/edit');
        });
    });

    it('keeps dialog open and updates header/link when saving from new issue page to issue show', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        useTaskStore.setState({ refreshData: refreshData as unknown as RefreshData });
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
        fireEvent.click(screen.getByRole('button', { name: 'Create issue' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        iframeWindow.location.href = 'http://example.com/redmine/issues/456';
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(useUIStore.getState().issueDialogUrl).toBe('/redmine/projects/p1/issues/new');
            expect(refreshData).toHaveBeenCalledTimes(1);
            expect(screen.getByText('Issue #456')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Save issue' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Edit|Edit again/ })).toBeInTheDocument();
            expect(screen.getByRole('link', { name: 'Open issue in new tab' })).toHaveAttribute('href', expect.stringContaining('/issues/456'));
        });
    });


    it('shows query Save only after the iframe reaches a savable query form', async () => {
        useUIStore.setState({ issueDialogUrl: null, queryDialogUrl: '/projects/demo/issues' });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = '<form id="query_form"><input type="submit" value="Apply" /></form>';
        const iframeWindow = {
            location: { href: 'http://example.com/projects/demo/issues' },
            document: doc
        };
        Object.defineProperty(iframe, 'contentWindow', {
            value: iframeWindow,
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', {
            value: doc,
            configurable: true
        });

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
        fireEvent.load(iframe);

        const footer = screen.getByTestId('issue-dialog-footer');
        expect(within(footer).getAllByRole('button')).toHaveLength(1);
        expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        expect(within(footer).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

        doc.body.innerHTML = '<form id="query-form"><input type="submit" value="Save" /></form>';
        iframeWindow.location.href = 'http://example.com/queries/new';
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(within(footer).getAllByRole('button')).toHaveLength(2);
            expect(within(footer).getByRole('button', { name: 'Save' })).toBeInTheDocument();
        });
    });

    it('submits the iframe query form from the footer and closes after success', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        useTaskStore.setState({ refreshData: refreshData as unknown as RefreshData });
        useUIStore.setState({ issueDialogUrl: null, queryDialogUrl: '/queries/1/edit' });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="query-form">
              <input name="commit" type="submit" value="Save" />
            </form>
        `;

        const iframeWindow = { location: { href: 'http://example.com/queries/1/edit' }, document: doc };
        Object.defineProperty(iframe, 'contentWindow', {
            value: iframeWindow,
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc });

        const querySubmit = doc.querySelector('input[type="submit"]') as HTMLInputElement;
        const querySubmitClick = vi.spyOn(querySubmit, 'click');
        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
        fireEvent.load(iframe);

        const footer = screen.getByTestId('issue-dialog-footer');
        expect(within(footer).getAllByRole('button')).toHaveLength(2);
        expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        const saveButton = within(footer).getByRole('button', { name: 'Save' });

        fireEvent.click(saveButton);
        await act(async () => {
            doc.body.innerHTML = '<p>Saving query...</p>';
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(querySubmitClick).toHaveBeenCalledTimes(1);
            expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeDisabled();
            expect(within(footer).getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        iframeWindow.location.href = 'http://example.com/queries/1';
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(useUIStore.getState().queryDialogUrl).toBeNull();
            expect(refreshData).toHaveBeenCalledTimes(1);
        });
    });

    it('allows the iframe query form to be submitted again after a validation error', async () => {
        useUIStore.setState({ issueDialogUrl: null, queryDialogUrl: '/queries/1/edit' });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = '<form id="query-form"><input type="submit" value="Save" /></form>';
        const iframeWindow = { location: { href: 'http://example.com/queries/1/edit' }, document: doc };
        Object.defineProperty(iframe, 'contentWindow', {
            value: iframeWindow,
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', {
            value: doc,
            configurable: true
        });

        const querySubmit = doc.querySelector('input[type="submit"]') as HTMLInputElement;
        const querySubmitClick = vi.spyOn(querySubmit, 'click');
        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
        fireEvent.load(iframe);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(querySubmitClick).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue('Validation failed');
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(screen.getByTestId('issue-dialog-error')).toHaveTextContent('Validation failed');
            expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
        });

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(querySubmitClick).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    it('navigates back to the edit form from issue detail mode', async () => {
        const refreshData = vi.fn().mockResolvedValue(undefined);
        useTaskStore.setState({ refreshData: refreshData as unknown as RefreshData });

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
        fireEvent.click(screen.getByRole('button', { name: 'Save issue' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        iframeWindow.location.href = 'http://example.com/issues/123';
        fireEvent.load(iframe);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Edit|Edit again/ })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Edit|Edit again/ }));

        expect(iframeWindow.location.href).toBe('/issues/123/edit');
        expect(screen.getByRole('button', { name: /Save|Save issue/ })).toBeInTheDocument();
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
        fireEvent.click(screen.getByRole('button', { name: 'Save issue' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /loading|saving/i })).toBeDisabled();
        });

        act(() => {
            useUIStore.setState({ issueDialogUrl: null });
            useUIStore.setState({ issueDialogUrl: '/issues/999/edit' });
        });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Save|Save issue/ })).not.toBeDisabled();
        });
    });

    it('submits the issue form instead of the related-issue form when both are present', async () => {
        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="new-relation-form">
              <input name="commit" type="submit" value="Add" />
            </form>
            <form id="issue-form">
              <input name="commit" type="submit" value="Save" />
            </form>
        `;

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);

        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123/edit' }, document: doc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc, configurable: true });

        const relationForm = doc.querySelector('#new-relation-form') as HTMLFormElement;
        const issueForm = doc.querySelector('#issue-form') as HTMLFormElement;
        const relationSubmit = doc.querySelector('#new-relation-form input[name="commit"]') as HTMLInputElement;
        const relationClick = vi.spyOn(relationSubmit, 'click');
        const issueSubmit = doc.querySelector('#issue-form input[name="commit"]') as HTMLInputElement;
        const issueSubmitClick = vi.spyOn(issueSubmit, 'click');
        const issueRequestSubmit = vi.fn();
        Object.defineProperty(issueForm, 'requestSubmit', {
            configurable: true,
            value: issueRequestSubmit
        });
        Object.defineProperty(relationForm, 'requestSubmit', {
            configurable: true,
            value: vi.fn()
        });

        fireEvent.load(iframe);
        fireEvent.click(screen.getByRole('button', { name: 'Save issue' }));

        expect(issueSubmitClick).toHaveBeenCalledTimes(1);
        expect(issueRequestSubmit).not.toHaveBeenCalled();
        expect(relationClick).not.toHaveBeenCalled();
    });

    it('submits time entry form and clears timer session on successful redirect', async () => {
        const clearSpy = vi.spyOn(useTimerStore.getState(), 'completeTimerRecording');
        useTimerStore.setState({
            session: {
                version: 4,
                revision: 1,
                sessionId: 's1',
                issueId: 123,
                subject: 'Task 123',
                autoStop: false,
                state: 'stopped_pending_record',
                recordingAttempt: { id: 'attempt-1', ownerTabId: 'test-tab', openedAt: Date.now(), phase: 'editing' as const },
                createdAt: Date.now(),
                updatedAt: Date.now(),
                segments: [{ startedAt: Date.now() - 1800000, stoppedAt: Date.now() }]
            }
        });
        persistTimerSession(useTimerStore.getState().session);

        const recordingContext = { origin: 'timer' as const, sessionId: 's1', issueId: 123, attemptId: 'attempt-1' };
        useUIStore.setState({
            issueDialogUrl: '/issues/123/time_entries/new?time_entry[hours]=0.5',
            issueDialogContext: { timerRecording: recordingContext }
        });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="new_time_entry" action="/time_entries" method="post">
              <input name="time_entry[hours]" type="text" value="0.5" />
              <input name="commit" type="submit" value="Create" />
            </form>
        `;

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);

        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123/time_entries/new?time_entry[hours]=0.5' }, document: doc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc, configurable: true });

        fireEvent.load(iframe);

        const footer = screen.getByTestId('issue-dialog-footer');
        const saveButton = within(footer).getByRole('button', { name: /Log time|Save|button_log_time/i });
        fireEvent.click(saveButton);

        // Simulate Redmine redirect to /projects/ecookbook/time_entries
        const successDoc = document.implementation.createHTMLDocument('iframe');
        successDoc.body.innerHTML = `<div class="flash notice">Successful creation.</div>`;
        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/projects/ecookbook/time_entries' }, document: successDoc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: successDoc, configurable: true });

        fireEvent.load(iframe);

        await waitFor(() => {
            expect(clearSpy).toHaveBeenCalledWith(recordingContext);
            expect(useTimerStore.getState().session).toBeNull();
            expect(useUIStore.getState().issueDialogUrl).toBeNull();
        });
    });

    it('clears the matching timer when Redmine redirects back to Canvas Gantt with a success notice', async () => {
        const completeSpy = vi.spyOn(useTimerStore.getState(), 'completeTimerRecording');
        const session = {
            version: 4 as const,
            revision: 1,
            sessionId: 'canvas-redirect',
            issueId: 123,
            subject: 'Task 123',
            autoStop: false,
            state: 'stopped_pending_record' as const,
            recordingAttempt: { id: 'canvas-attempt', ownerTabId: 'test-tab', openedAt: Date.now(), phase: 'editing' as const },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            segments: [{ startedAt: Date.now() - 1800000, stoppedAt: Date.now() }]
        };
        const recordingContext = {
            origin: 'timer' as const,
            sessionId: session.sessionId,
            issueId: session.issueId,
            attemptId: session.recordingAttempt!.id
        };
        useTimerStore.setState({ session });
        persistTimerSession(session);
        useUIStore.setState({
            issueDialogUrl: '/issues/123/time_entries/new',
            issueDialogContext: { timerRecording: recordingContext }
        });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const formDoc = document.implementation.createHTMLDocument('iframe');
        formDoc.body.innerHTML = '<form id="new_time_entry" action="/time_entries"><input name="commit" type="submit" value="Create" /></form>';
        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123/time_entries/new' }, document: formDoc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: formDoc, configurable: true });
        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
        fireEvent.load(iframe);
        fireEvent.click(within(screen.getByTestId('issue-dialog-footer')).getByRole('button', { name: /Log time|Save|button_log_time/i }));

        const successDoc = document.implementation.createHTMLDocument('iframe');
        successDoc.body.innerHTML = '<div class="flash notice">Successful creation.</div>';
        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/projects/ecookbook/canvas_gantt' }, document: successDoc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: successDoc, configurable: true });
        fireEvent.load(iframe);

        await waitFor(() => expect(completeSpy).toHaveBeenCalledWith(recordingContext));
        expect(useTimerStore.getState().session).toBeNull();
        expect(useUIStore.getState().issueDialogUrl).toBeNull();
    });

    it.each(['running', 'stopped_pending_record'] as const)(
        'does not clear a %s timer after a normal TimeEntry save',
        async (timerState) => {
            const completeSpy = vi.spyOn(useTimerStore.getState(), 'completeTimerRecording');
            const sessionId = `${timerState}-normal-entry`;
            useTimerStore.setState({
                session: {
                    version: 4,
                    revision: 1,
                    sessionId,
                    issueId: 123,
                    subject: 'Task 123',
                    autoStop: false,
                    state: timerState,
                    ...(timerState === 'stopped_pending_record' ? { recordingAttempt: { id: 'attempt-2', ownerTabId: 'test-tab', openedAt: Date.now(), phase: 'editing' as const } } : {}),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    segments: [{
                        startedAt: Date.now() - 1800000,
                        ...(timerState === 'stopped_pending_record' ? { stoppedAt: Date.now() } : {})
                    }]
                }
            });
            persistTimerSession(useTimerStore.getState().session);
            useUIStore.setState({
                issueDialogUrl: '/issues/123/time_entries/new?time_entry[hours]=0.5',
                issueDialogContext: null
            });

            const { container } = render(<IssueIframeDialog />);
            const iframe = container.querySelector('iframe') as HTMLIFrameElement;
            const formDoc = document.implementation.createHTMLDocument('iframe');
            formDoc.body.innerHTML = '<form id="new_time_entry" action="/time_entries"><input name="commit" type="submit" value="Create" /></form>';
            vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
            Object.defineProperty(iframe, 'contentWindow', {
                value: { location: { href: 'http://example.com/issues/123/time_entries/new' }, document: formDoc },
                configurable: true
            });
            Object.defineProperty(iframe, 'contentDocument', { value: formDoc, configurable: true });
            fireEvent.load(iframe);
            fireEvent.click(within(screen.getByTestId('issue-dialog-footer')).getByRole('button', { name: /Log time|Save|button_log_time/i }));

            const successDoc = document.implementation.createHTMLDocument('iframe');
            successDoc.body.innerHTML = '<div class="flash notice">Successful creation.</div>';
            Object.defineProperty(iframe, 'contentWindow', {
                value: { location: { href: 'http://example.com/issues/123' }, document: successDoc },
                configurable: true
            });
            Object.defineProperty(iframe, 'contentDocument', { value: successDoc, configurable: true });
            fireEvent.load(iframe);

            await waitFor(() => expect(useUIStore.getState().issueDialogUrl).toBeNull());
            expect(completeSpy).not.toHaveBeenCalled();
            expect(useTimerStore.getState().session?.sessionId).toBe(sessionId);
        }
    );

    it('keeps the pending timer when a timer-origin TimeEntry dialog is cancelled', () => {
        const completeSpy = vi.spyOn(useTimerStore.getState(), 'completeTimerRecording');
        const session = {
            version: 4 as const,
            revision: 1,
            sessionId: 'cancelled-recording',
            issueId: 123,
            subject: 'Task 123',
            autoStop: false,
            state: 'stopped_pending_record' as const,
            recordingAttempt: { id: 'cancel-attempt', ownerTabId: 'test-tab', openedAt: Date.now(), phase: 'editing' as const },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            segments: [{ startedAt: Date.now() - 1800000, stoppedAt: Date.now() }]
        };
        useTimerStore.setState({ session });
        persistTimerSession(session);
        useUIStore.setState({
            issueDialogUrl: '/issues/123/time_entries/new',
            issueDialogContext: {
                timerRecording: {
                    origin: 'timer',
                    sessionId: session.sessionId,
                    issueId: session.issueId,
                    attemptId: session.recordingAttempt!.id
                }
            }
        });

        render(<IssueIframeDialog />);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(completeSpy).not.toHaveBeenCalled();
        expect(useTimerStore.getState().session?.sessionId).toBe(session.sessionId);
        expect(useUIStore.getState().issueDialogContext).toBeNull();
    });

    it.each([
        ['validation error', 'Hours is invalid'],
        ['permission error', 'You are not authorized to access this page'],
        ['iframe error', 'The embedded form failed to load']
    ])('keeps the pending timer after a TimeEntry %s', async (_caseName, errorMessage) => {
        const completeSpy = vi.spyOn(useTimerStore.getState(), 'completeTimerRecording');
        const session = {
            version: 4 as const,
            revision: 1,
            sessionId: `failed-recording-${errorMessage}`,
            issueId: 123,
            subject: 'Task 123',
            autoStop: false,
            state: 'stopped_pending_record' as const,
            recordingAttempt: { id: 'failed-attempt', ownerTabId: 'test-tab', openedAt: Date.now(), phase: 'editing' as const },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            segments: [{ startedAt: Date.now() - 1800000, stoppedAt: Date.now() }]
        };
        useTimerStore.setState({ session });
        persistTimerSession(session);
        useUIStore.setState({
            issueDialogUrl: '/issues/123/time_entries/new',
            issueDialogContext: {
                timerRecording: {
                    origin: 'timer',
                    sessionId: session.sessionId,
                    issueId: session.issueId,
                    attemptId: session.recordingAttempt!.id
                }
            }
        });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = '<form id="new_time_entry" action="/time_entries"><input name="commit" type="submit" value="Create" /></form>';
        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/time_entries' }, document: doc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc, configurable: true });
        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
        fireEvent.load(iframe);
        fireEvent.click(within(screen.getByTestId('issue-dialog-footer')).getByRole('button', { name: /Log time|Save|button_log_time/i }));

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(errorMessage);
        fireEvent.load(iframe);

        await waitFor(() => expect(screen.getByTestId('issue-dialog-error')).toHaveTextContent(errorMessage));
        expect(completeSpy).not.toHaveBeenCalled();
        expect(useTimerStore.getState().session?.sessionId).toBe(session.sessionId);
    });

    it('keeps the pending timer after an unexpected TimeEntry redirect', async () => {
        const completeSpy = vi.spyOn(useTimerStore.getState(), 'completeTimerRecording');
        const session = {
            version: 4 as const,
            revision: 1,
            sessionId: 'unexpected-redirect',
            issueId: 123,
            subject: 'Task 123',
            autoStop: false,
            state: 'stopped_pending_record' as const,
            recordingAttempt: { id: 'redirect-attempt', ownerTabId: 'test-tab', openedAt: Date.now(), phase: 'editing' as const },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            segments: [{ startedAt: Date.now() - 1800000, stoppedAt: Date.now() }]
        };
        useTimerStore.setState({ session });
        persistTimerSession(session);
        useUIStore.setState({
            issueDialogUrl: '/issues/123/time_entries/new',
            issueDialogContext: {
                timerRecording: {
                    origin: 'timer',
                    sessionId: session.sessionId,
                    issueId: session.issueId,
                    attemptId: session.recordingAttempt!.id
                }
            }
        });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const formDoc = document.implementation.createHTMLDocument('iframe');
        formDoc.body.innerHTML = '<form id="new_time_entry" action="/time_entries"><input name="commit" type="submit" value="Create" /></form>';
        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/123/time_entries/new' }, document: formDoc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: formDoc, configurable: true });
        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);
        fireEvent.load(iframe);
        fireEvent.click(within(screen.getByTestId('issue-dialog-footer')).getByRole('button', { name: /Log time|Save|button_log_time/i }));

        const redirectDoc = document.implementation.createHTMLDocument('iframe');
        redirectDoc.body.innerHTML = '<div class="issue">Different issue</div>';
        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/999' }, document: redirectDoc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: redirectDoc, configurable: true });
        fireEvent.load(iframe);

        await waitFor(() => expect(screen.getByTestId('issue-dialog-error')).toBeInTheDocument());
        expect(completeSpy).not.toHaveBeenCalled();
        expect(useTimerStore.getState().session?.sessionId).toBe(session.sessionId);
        expect(useTimerStore.getState().session?.recordingAttempt?.phase).toBe('unknown');
    });

    it('handles direct form submission inside iframe and clears timer session on redirect to issue show', async () => {
        const clearSpy = vi.spyOn(useTimerStore.getState(), 'completeTimerRecording');
        useTimerStore.setState({
            session: {
                version: 4,
                revision: 1,
                sessionId: 's2',
                issueId: 456,
                subject: 'Task 456',
                autoStop: false,
                state: 'stopped_pending_record',
                recordingAttempt: { id: 'attempt-2', ownerTabId: 'test-tab', openedAt: Date.now(), phase: 'editing' as const },
                createdAt: Date.now(),
                updatedAt: Date.now(),
                segments: [{ startedAt: Date.now() - 900000, stoppedAt: Date.now() }]
            }
        });
        persistTimerSession(useTimerStore.getState().session);

        const recordingContext = { origin: 'timer' as const, sessionId: 's2', issueId: 456, attemptId: 'attempt-2' };
        useUIStore.setState({
            issueDialogUrl: '/issues/456/time_entries/new?time_entry[hours]=0.25',
            issueDialogContext: { timerRecording: recordingContext }
        });

        const { container } = render(<IssueIframeDialog />);
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        const doc = document.implementation.createHTMLDocument('iframe');
        doc.body.innerHTML = `
            <form id="new_time_entry" action="/time_entries" method="post">
              <input name="time_entry[hours]" type="text" value="0.25" />
              <input name="commit" type="submit" value="Create" />
            </form>
        `;

        vi.mocked(getIssueDialogErrorMessage).mockReturnValue(null);

        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/456/time_entries/new?time_entry[hours]=0.25' }, document: doc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: doc, configurable: true });

        fireEvent.load(iframe);

        // Submit form natively inside iframe
        doc.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        // Simulate Redmine redirect to /issues/456
        const redirectDoc = document.implementation.createHTMLDocument('iframe');
        redirectDoc.body.innerHTML = `<div class="flash notice">Successful creation.</div><div class="issue">Issue details</div>`;
        Object.defineProperty(iframe, 'contentWindow', {
            value: { location: { href: 'http://example.com/issues/456' }, document: redirectDoc },
            configurable: true
        });
        Object.defineProperty(iframe, 'contentDocument', { value: redirectDoc, configurable: true });

        fireEvent.load(iframe);

        await waitFor(() => {
            expect(clearSpy).toHaveBeenCalledWith(recordingContext);
            expect(useUIStore.getState().issueDialogUrl).toBeNull();
        });
    });
});
