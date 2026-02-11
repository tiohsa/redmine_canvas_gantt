import React from 'react';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';
import { applyIssueDialogStyles, findIssueDialogErrorElement, getIssueDialogErrorMessage } from '../utils/iframeStyles';

export const IssueIframeDialog: React.FC = () => {
    const issueDialogUrl = useUIStore(state => state.issueDialogUrl);
    const closeIssueDialog = useUIStore(state => state.closeIssueDialog);
    const refreshData = useTaskStore(state => state.refreshData);
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    const iframeEscapeCleanupRef = React.useRef<(() => void) | null>(null);
    const [iframeError, setIframeError] = React.useState<string | null>(null);

    const handleClose = React.useCallback(() => {
        closeIssueDialog();
        void refreshData();
    }, [closeIssueDialog, refreshData]);

    const issueLabel = React.useMemo(() => {
        if (!issueDialogUrl) return '';

        const url = issueDialogUrl.split('?')[0];

        // 1. Try to extract issue ID from /issues/123 or /issues/123/edit
        const issueMatch = url.match(/\/issues\/(\d+)(?:\/edit)?/);
        if (issueMatch) {
            const issueId = issueMatch[1];
            // Try to find the task in the store to get more info (Tracker, etc.)
            const task = useTaskStore.getState().tasks.find(t => String(t.id) === issueId);
            if (task) {
                return `${task.trackerName || i18n.t('label_issue') || 'Issue'} #${task.id}`;
            }
            return `${i18n.t('label_issue') || 'Issue'} #${issueId}`;
        }

        // 2. Handle new issue
        if (url.includes('/issues/new')) {
            return i18n.t('label_issue_new') || (i18n.t('label_new') ? `${i18n.t('label_new')} ${i18n.t('label_issue')}` : 'New Issue');
        }

        // 3. General "Edit" fallback
        return i18n.t('button_edit') || 'Edit';
    }, [issueDialogUrl]);

    React.useEffect(() => {
        iframeEscapeCleanupRef.current?.();
        iframeEscapeCleanupRef.current = null;
        setIframeError(null);
    }, [issueDialogUrl]);

    React.useEffect(() => {
        if (!issueDialogUrl) {
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
    }, [issueDialogUrl, handleClose]);

    React.useEffect(() => () => {
        iframeEscapeCleanupRef.current?.();
        iframeEscapeCleanupRef.current = null;
    }, []);

    if (!issueDialogUrl) return null;

    const handleIframeLoad = () => {
        try {
            const iframe = iframeRef.current;
            if (!iframe) return;

            const iframeDocument = iframe.contentDocument ?? iframe.contentWindow?.document;
            if (iframeDocument) {
                applyIssueDialogStyles(iframeDocument);

                const iframeWindow = iframe.contentWindow;
                if (iframeWindow && typeof iframeWindow.addEventListener === 'function' && typeof iframeWindow.removeEventListener === 'function') {
                    iframeEscapeCleanupRef.current?.();
                    const handleIframeEscape = (event: KeyboardEvent) => {
                        if (event.key !== 'Escape') {
                            return;
                        }

                        event.preventDefault();
                        event.stopPropagation();
                        handleClose();
                    };
                    iframeWindow.addEventListener('keydown', handleIframeEscape, true);
                    iframeEscapeCleanupRef.current = () => {
                        iframeWindow.removeEventListener('keydown', handleIframeEscape, true);
                    };
                }

                const errorElement = findIssueDialogErrorElement(iframeDocument);
                if (errorElement) {
                    const message = getIssueDialogErrorMessage(iframeDocument)
                        || i18n.t('label_issue_dialog_error')
                        || 'Unable to load the issue editor';
                    setIframeError(message);
                } else {
                    setIframeError(null);
                }
            }

            // Only works if same-origin. 
            // If it redirected to an issue page (view mode instead of edit/new), 
            // we can trigger a refresh.
            const currentUrl = iframe.contentWindow?.location.href;
            if (currentUrl) {
                const isEdit = currentUrl.includes('/edit');
                const isNew = currentUrl.includes('/new');
                const isIssuesList = currentUrl.endsWith('/issues');

                // If we are no longer in edit/new mode, but still on Redmine,
                // it's likely a redirect after save.
                if (!isEdit && !isNew && !isIssuesList) {
                    void refreshData();
                }
            }
        } catch (e) {
            // cross-origin error or similar, fallback to refresh on manual close
            console.debug("Could not verify iframe URL", e);
        }
    };

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
                zIndex: 2000
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    handleClose();
                }
            }}
        >
            <div
                style={{
                    width: '1600px',
                    maxWidth: '98vw',
                    height: '95vh',
                    backgroundColor: 'white',
                    borderRadius: '6px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 24px',
                        backgroundColor: '#ffffff'
                    }}
                >
                    <span style={{ fontWeight: 700, fontSize: '18px', color: '#333' }}>
                        {issueLabel}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <a
                            href={issueDialogUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                                // Close the dialog when opening in a new tab
                                handleClose();
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '32px',
                                height: '32px',
                                padding: 0,
                                borderRadius: '6px',
                                border: '1px solid #e0e0e0',
                                backgroundColor: '#fff',
                                color: '#333',
                                cursor: 'pointer'
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </a>
                        <button
                            type="button"
                            onClick={handleClose}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '32px',
                                height: '32px',
                                padding: 0,
                                borderRadius: '6px',
                                border: '1px solid #e0e0e0',
                                backgroundColor: '#fff',
                                color: '#333',
                                cursor: 'pointer'
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Iframe Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                    {iframeError ? (
                        <div
                            data-testid="issue-dialog-error"
                            style={{
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
                        src={issueDialogUrl}
                        onLoad={handleIframeLoad}
                        style={{
                            width: '100%',
                            height: '100%',
                            border: 'none'
                        }}
                    />
                </div>
            </div>
        </div>
    );
};
