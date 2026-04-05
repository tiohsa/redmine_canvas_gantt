import React from 'react';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';
import { applyIssueDialogStyles, getIssueDialogErrorMessage } from '../utils/iframeStyles';
import { BulkSubtaskCreator } from './BulkSubtaskCreator';
import type { BulkSubtaskCreatorHandle } from './BulkSubtaskCreator';

const MAX_DIALOG_VIEWPORT_HEIGHT_RATIO = 0.9;
const MIN_DIALOG_HEIGHT_PX = 600;
const DEFAULT_DIALOG_WIDTH_PX = 1200;
const MIN_DIALOG_WIDTH_PX = 800;

type ObserverWindow = Window & {
    ResizeObserver?: typeof ResizeObserver;
    MutationObserver?: typeof MutationObserver;
};

const getElementOuterHeight = (element: HTMLElement | null): number => {
    if (!element) {
        return 0;
    }

    return Math.ceil(element.getBoundingClientRect().height);
};

const getDocumentScrollHeight = (element: HTMLElement): number => {
    return Math.max(
        element.scrollHeight,
        element.clientHeight,
        element.offsetHeight,
        Math.ceil(element.getBoundingClientRect().height)
    );
};

const getIssueDialogContentHeight = (doc: Document): number => {
    const candidates = [
        doc.querySelector<HTMLElement>('#content'),
        doc.querySelector<HTMLElement>('#main'),
        doc.body,
        doc.documentElement
    ];

    for (const element of candidates) {
        if (!element) {
            continue;
        }

        const height = getDocumentScrollHeight(element);
        if (height > 0) {
            return height;
        }
    }

    return 0;
};

export const IssueIframeDialog: React.FC = () => {
    const issueDialogUrl = useUIStore(state => state.issueDialogUrl);
    const queryDialogUrl = useUIStore(state => state.queryDialogUrl);
    const closeIssueDialog = useUIStore(state => state.closeIssueDialog);
    const closeQueryDialog = useUIStore(state => state.closeQueryDialog);
    const refreshData = useTaskStore(state => state.refreshData);
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    const bulkRef = React.useRef<BulkSubtaskCreatorHandle>(null);
    const headerRef = React.useRef<HTMLDivElement>(null);
    const bulkSectionRef = React.useRef<HTMLDivElement>(null);
    const footerRef = React.useRef<HTMLDivElement>(null);
    const errorRef = React.useRef<HTMLDivElement>(null);
    const iframeEscapeCleanupRef = React.useRef<(() => void) | null>(null);
    const iframeSizeObserverCleanupRef = React.useRef<(() => void) | null>(null);
    const dialogResizeCleanupRef = React.useRef<(() => void) | null>(null);
    const [iframeError, setIframeError] = React.useState<string | null>(null);
    const [isSaving, setIsSaving] = React.useState(false);
    const [dialogHeightPx, setDialogHeightPx] = React.useState<number | null>(null);
    const activeDialogUrl = queryDialogUrl || issueDialogUrl;
    const isQueryDialog = Boolean(queryDialogUrl);

    const handleClose = React.useCallback(() => {
        if (queryDialogUrl) {
            closeQueryDialog();
        } else {
            closeIssueDialog();
        }
        void refreshData();
    }, [closeIssueDialog, closeQueryDialog, queryDialogUrl, refreshData]);

    const measureDialogHeight = React.useCallback(() => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) {
            setDialogHeightPx(Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO));
            return;
        }

        const maxHeightPx = Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO);
        const chromeHeight =
            getElementOuterHeight(headerRef.current) +
            getElementOuterHeight(errorRef.current) +
            getElementOuterHeight(bulkSectionRef.current) +
            getElementOuterHeight(footerRef.current);
        const iframeContentHeight = getIssueDialogContentHeight(doc);
        const nextHeight = Math.min(
            maxHeightPx,
            Math.max(MIN_DIALOG_HEIGHT_PX, chromeHeight + iframeContentHeight)
        );

        setDialogHeightPx(nextHeight);
    }, []);

    const bindIframeSizeObservers = React.useCallback((doc: Document) => {
        iframeSizeObserverCleanupRef.current?.();

        const cleanupCallbacks: Array<() => void> = [];
        const iframeWindow = iframeRef.current?.contentWindow as ObserverWindow | null;
        const resizeObserverCtor = iframeWindow?.ResizeObserver ?? window.ResizeObserver;
        const mutationObserverCtor = iframeWindow?.MutationObserver ?? window.MutationObserver;

        if (typeof resizeObserverCtor !== 'undefined') {
            const resizeObserver = new resizeObserverCtor(() => {
                measureDialogHeight();
            });
            const resizeTargets = [
                doc.querySelector<HTMLElement>('#content'),
                doc.querySelector<HTMLElement>('#main'),
                doc.body,
                doc.documentElement
            ].filter((element): element is HTMLElement => Boolean(element));

            resizeTargets.forEach((element) => resizeObserver.observe(element));
            cleanupCallbacks.push(() => resizeObserver.disconnect());
        }

        if (typeof mutationObserverCtor !== 'undefined') {
            const mutationObserver = new mutationObserverCtor(() => {
                measureDialogHeight();
            });
            mutationObserver.observe(doc.body, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true
            });
            cleanupCallbacks.push(() => mutationObserver.disconnect());
        }

        iframeSizeObserverCleanupRef.current = () => {
            cleanupCallbacks.forEach((cleanup) => cleanup());
        };
    }, [measureDialogHeight]);

    const handleIframeLoad = React.useCallback(async () => {
        try {
            const iframe = iframeRef.current;
            if (!iframe) return;

            const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
            if (!doc) return;

            applyIssueDialogStyles(doc, isQueryDialog);
            bindIframeSizeObservers(doc);

            iframe.classList.remove('issue-iframe-loading');

            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && typeof iframeWindow.addEventListener === 'function') {
                iframeEscapeCleanupRef.current?.();
                const handleIframeEscape = (event: KeyboardEvent) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        handleClose();
                    }
                };
                iframeWindow.addEventListener('keydown', handleIframeEscape, true);
                iframeEscapeCleanupRef.current = () => {
                    iframeWindow.removeEventListener('keydown', handleIframeEscape, true);
                };
            }

            const currentUrl = iframeWindow?.location.href || '';

            const error = getIssueDialogErrorMessage(doc);
            setIframeError(error);
            window.requestAnimationFrame(() => {
                measureDialogHeight();
            });

            // If we were saving, close when we transition to issue show page without error.
            // Validation failures usually remain on /edit or /new and keep error blocks in DOM.
            if (isSaving) {
                const urlParsed = new URL(currentUrl, window.location.origin);
                const path = urlParsed.pathname;
                const issueMatch = path.match(/\/issues\/(\d+)(?:\?|$)/);
                const isIssueShow = Boolean(issueMatch) && !path.includes('/edit') && !path.includes('/new');

                const isQuerySuccess = isQueryDialog && !error && (
                    path.endsWith('/issues') ||
                    path.includes('/projects/') && path.endsWith('/issues') ||
                    path.match(/\/queries\/\d+$/) // some plugins redirect here
                );

                if (!error && (isIssueShow || isQuerySuccess)) {
                    const newIssueId = issueMatch?.[1];

                    if (newIssueId && bulkRef.current?.hasSubjects()) {
                        await bulkRef.current.createSubtasks(newIssueId);
                    }

                    setIsSaving(false);
                    handleClose();
                    return;
                }

                setIsSaving(false);
            }
        } catch (e) {
            console.debug("Could not verify iframe URL", e);
            if (isSaving) {
                setIsSaving(false);
            }
            setDialogHeightPx(Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO));
        }
    }, [bindIframeSizeObservers, handleClose, isQueryDialog, isSaving, measureDialogHeight]);

    const handleSave = React.useCallback(() => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;

        const issueForm = doc.querySelector('#issue-form') as HTMLFormElement;
        const queryForm = doc.querySelector('#query-form') as HTMLFormElement;
        const form = issueForm || queryForm;

        if (form) {
            setIsSaving(true);
            const submitBtn = doc.querySelector('input[name="commit"]') as HTMLElement;
            if (submitBtn) {
                submitBtn.click();
            } else {
                form.submit();
            }
        }
    }, []);

    const { issueLabel, issueSubject } = React.useMemo(() => {
        if (!activeDialogUrl) return { issueLabel: '', issueSubject: '' };
        if (isQueryDialog) {
            return {
                issueLabel: i18n.t('label_saved_query_editor') || 'Saved Query Editor',
                issueSubject: ''
            };
        }

        const url = activeDialogUrl.split('?')[0];

        // 1. Try to extract issue ID from /issues/123 or /issues/123/edit
        const issueMatch = url.match(/\/issues\/(\d+)(?:\/edit)?/);
        if (issueMatch) {
            const issueId = issueMatch[1];
            // Try to find the task in the store to get more info (Tracker, etc.)
            const task = useTaskStore.getState().tasks.find(t => String(t.id) === issueId);
            if (task) {
                const label = `${task.trackerName || i18n.t('label_issue') || 'Issue'} #${task.id}`;
                return { issueLabel: label, issueSubject: task.subject || '' };
            }
            const label = `${i18n.t('label_issue') || 'Issue'} #${issueId}`;
            return { issueLabel: label, issueSubject: '' };
        }

        // 2. Handle new issue
        if (url.includes('/issues/new')) {
            const label = i18n.t('label_issue_new') || (i18n.t('label_new') ? `${i18n.t('label_new')} ${i18n.t('label_issue')}` : 'New Issue');
            return { issueLabel: label, issueSubject: '' };
        }

        // 3. General "Edit" fallback
        const label = i18n.t('button_edit') || 'Edit';
        return { issueLabel: label, issueSubject: '' };
    }, [activeDialogUrl, isQueryDialog]);

    const parentId = React.useMemo(() => {
        if (!activeDialogUrl || isQueryDialog) return undefined;

        try {
            const urlParsed = new URL(activeDialogUrl, window.location.origin);
            const path = urlParsed.pathname;
            const params = urlParsed.searchParams;

            let paId = params.get('issue[parent_issue_id]') || params.get('parent_issue_id') || undefined;

            // Extract issue ID from /issues/123/edit to use as parentId for subtasks
            const issueMatch = path.match(/\/issues\/(\d+)(?:\/edit)?/);
            if (issueMatch) {
                const issueId = issueMatch[1];
                // If it's an edit page, the issue itself is the parent for new subtasks
                if (path.includes('/edit')) {
                    paId = issueId;
                }
            }

            return paId;
        } catch (e) {
            console.error("Failed to parse issue dialog URL", e);
            return undefined;
        }
    }, [activeDialogUrl, isQueryDialog]);

    React.useEffect(() => {
        iframeEscapeCleanupRef.current?.();
        iframeEscapeCleanupRef.current = null;
        iframeSizeObserverCleanupRef.current?.();
        iframeSizeObserverCleanupRef.current = null;
        setIframeError(null);
        setIsSaving(false);
        setDialogHeightPx(null);
    }, [activeDialogUrl]);

    React.useEffect(() => {
        if (!activeDialogUrl) {
            return;
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            handleClose();
        };

        window.addEventListener('keydown', handleEscape, true);
        return () => {
            window.removeEventListener('keydown', handleEscape, true);
        };
    }, [activeDialogUrl, handleClose]);

    React.useEffect(() => () => {
        iframeEscapeCleanupRef.current?.();
        iframeEscapeCleanupRef.current = null;
        iframeSizeObserverCleanupRef.current?.();
        iframeSizeObserverCleanupRef.current = null;
        dialogResizeCleanupRef.current?.();
        dialogResizeCleanupRef.current = null;
    }, []);

    React.useEffect(() => {
        if (!activeDialogUrl) {
            return;
        }

        const handleResize = () => {
            measureDialogHeight();
        };

        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => {
                measureDialogHeight();
            })
            : null;

        [headerRef.current, bulkSectionRef.current, footerRef.current, errorRef.current]
            .filter((element): element is HTMLDivElement => Boolean(element))
            .forEach((element) => resizeObserver?.observe(element));

        window.addEventListener('resize', handleResize);
        dialogResizeCleanupRef.current = () => {
            window.removeEventListener('resize', handleResize);
            resizeObserver?.disconnect();
        };

        measureDialogHeight();

        return () => {
            dialogResizeCleanupRef.current?.();
            dialogResizeCleanupRef.current = null;
        };
    }, [activeDialogUrl, iframeError, measureDialogHeight]);

    if (!activeDialogUrl) return null;

    const compactHeaderPadding = '2px 12px';
    const compactFooterPadding = '2px 12px 4px 12px';
    const compactIconButtonSize = 24;
    const compactActionButtonHeight = 28;
    const compactActionButtonMinWidth = 88;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2400
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    handleClose();
                }
            }}
        >
            <div
                style={{
                    width: `${DEFAULT_DIALOG_WIDTH_PX}px`,
                    maxWidth: '98vw',
                    minWidth: `${MIN_DIALOG_WIDTH_PX}px`,
                    height: dialogHeightPx ? `${dialogHeightPx}px` : `${Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO)}px`,
                    maxHeight: `${Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO)}px`,
                    backgroundColor: 'white',
                    borderRadius: '6px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxSizing: 'border-box'
                }}
            >
                {/* Header - Fixed Height */}
                <div
                    data-testid="issue-dialog-header"
                    ref={headerRef}
                    style={{
                        flex: '0 0 auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: compactHeaderPadding,
                        backgroundColor: '#ffffff',
                        borderBottom: '1px solid #e0e0e0'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1, paddingRight: '12px' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px', color: '#333', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {issueLabel}
                        </span>
                        {issueSubject && (
                            <span style={{ fontSize: '14px', color: '#5f6368', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {issueSubject}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <a
                            href={activeDialogUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open issue in new tab"
                            onClick={() => handleClose()}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: `${compactIconButtonSize}px`,
                                height: `${compactIconButtonSize}px`,
                                borderRadius: '6px',
                                border: '1px solid #e0e0e0',
                                backgroundColor: '#fff',
                                color: '#333'
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </a>
                        <button
                            type="button"
                            onClick={handleClose}
                            aria-label="Close issue dialog"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: `${compactIconButtonSize}px`,
                                height: `${compactIconButtonSize}px`,
                                borderRadius: '6px',
                                border: '1px solid #e0e0e0',
                                backgroundColor: '#fff',
                                color: '#333',
                                cursor: 'pointer'
                            }}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Body Content - Scrollable if Iframe is big (though Iframe has internal scroll) */}
                <div style={{ flex: '1 1 auto', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    {iframeError ? (
                        <div
                            data-testid="issue-dialog-error"
                            ref={errorRef}
                            style={{
                                flex: '0 0 auto',
                                padding: '12px 16px',
                                backgroundColor: '#fdecea',
                                color: '#b71c1c',
                                borderBottom: '1px solid #f5c6cb',
                                fontSize: 13
                            }}
                        >
                            {iframeError}
                        </div>
                    ) : null}
                    <iframe
                        ref={iframeRef}
                        src={activeDialogUrl}
                        onLoad={handleIframeLoad}
                        style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            flex: 1
                        }}
                        className="issue-iframe-loading"
                    />
                </div>

                {/* Bulk Creation Section - Only for Issues */}
                {!isQueryDialog && (
                    <div ref={bulkSectionRef} style={{ flex: '0 0 auto', padding: '8px 12px 0 12px', backgroundColor: '#fff', borderTop: '1px solid #e0e0e0' }}>
                        <BulkSubtaskCreator
                            ref={bulkRef}
                            parentId={parentId}
                            hideStandaloneButton={true}
                            showTopBorder={false}
                            onTasksCreated={() => {
                                void refreshData();
                            }}
                        />
                    </div>
                )}

                {/* Footer Buttons - Fixed Height */}
                <div
                    data-testid="issue-dialog-footer"
                    ref={footerRef}
                    style={{
                        flex: '0 0 auto',
                        padding: compactFooterPadding,
                        display: 'flex',
                        justifyContent: 'flex-start',
                        gap: '6px',
                        backgroundColor: '#fff'
                    }}
                >
                    <button
                        onClick={handleClose}
                        disabled={isSaving}
                        style={{
                            height: `${compactActionButtonHeight}px`,
                            padding: '0 12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#fff',
                            color: '#333',
                            border: '1px solid #ccc',
                            borderRadius: 4,
                            fontSize: 13,
                            cursor: isSaving ? 'default' : 'pointer',
                            minWidth: `${compactActionButtonMinWidth}px`,
                            boxSizing: 'border-box'
                        }}
                    >
                        {i18n.t('button_cancel') || 'Cancel'}
                    </button>
                    {!isQueryDialog && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            style={{
                                height: `${compactActionButtonHeight}px`,
                                padding: '0 12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: isSaving ? '#ccc' : '#1a73e8',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 4,
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: isSaving ? 'default' : 'pointer',
                                minWidth: `${compactActionButtonMinWidth}px`,
                                boxSizing: 'border-box'
                            }}
                        >
                            {isSaving ? (i18n.t('label_loading') || 'Saving...') : (i18n.t('button_save') || 'Save')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
