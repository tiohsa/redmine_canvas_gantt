import React from 'react';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';
import { applyIssueDialogStyles, getIssueDialogErrorMessage } from '../utils/iframeStyles';
import { BulkSubtaskCreator } from './BulkSubtaskCreator';
import type { BulkSubtaskCreatorHandle } from './BulkSubtaskCreator';

export const IssueIframeDialog: React.FC = () => {
    const issueDialogUrl = useUIStore(state => state.issueDialogUrl);
    const closeIssueDialog = useUIStore(state => state.closeIssueDialog);
    const refreshData = useTaskStore(state => state.refreshData);
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    const bulkRef = React.useRef<BulkSubtaskCreatorHandle>(null);
    const iframeEscapeCleanupRef = React.useRef<(() => void) | null>(null);
    const [iframeError, setIframeError] = React.useState<string | null>(null);
    const [isSaving, setIsSaving] = React.useState(false);

    const handleClose = React.useCallback(() => {
        closeIssueDialog();
        void refreshData();
    }, [closeIssueDialog, refreshData]);

    const handleIframeLoad = React.useCallback(async () => {
        try {
            const iframe = iframeRef.current;
            if (!iframe) return;

            const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
            if (!doc) return;

            applyIssueDialogStyles(doc);

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

            // If we were saving, close when we transition to issue show page without error.
            // Validation failures usually remain on /edit or /new and keep error blocks in DOM.
            if (isSaving) {
                const urlParsed = new URL(currentUrl, window.location.origin);
                const path = urlParsed.pathname;
                const issueMatch = path.match(/\/issues\/(\d+)(?:\?|$)/);
                const isIssueShow = Boolean(issueMatch) && !path.includes('/edit') && !path.includes('/new');

                if (!error && isIssueShow) {
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
        }
    }, [handleClose, isSaving]);

    const handleSave = React.useCallback(() => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;

        const form = doc.querySelector('#issue-form') as HTMLFormElement;
        if (form) {
            setIsSaving(true);
            const submitBtn = doc.querySelector('#issue-form input[name="commit"]') as HTMLElement;
            if (submitBtn) {
                submitBtn.click();
            } else {
                form.submit();
            }
        }
    }, []);

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

    const { projectId, parentId } = React.useMemo(() => {
        if (!issueDialogUrl) return { projectId: '', parentId: undefined };

        try {
            const urlParsed = new URL(issueDialogUrl, window.location.origin);
            const path = urlParsed.pathname;
            const params = urlParsed.searchParams;

            let pId = '';
            let paId = params.get('issue[parent_issue_id]') || params.get('parent_issue_id') || undefined;

            // Extract project from /projects/xxx/issues/new
            const projectMatch = path.match(/\/projects\/([^/]+)\/issues\/new/);
            if (projectMatch) {
                pId = projectMatch[1];
            } else {
                // Fallback to global project ID if not in URL
                pId = String(window.RedmineCanvasGantt?.projectId || '');
            }

            // Extract issue ID from /issues/123/edit to use as parentId for subtasks
            const issueMatch = path.match(/\/issues\/(\d+)(?:\/edit)?/);
            if (issueMatch) {
                const issueId = issueMatch[1];
                // If it's an edit page, the issue itself is the parent for new subtasks
                if (path.includes('/edit')) {
                    paId = issueId;
                }
            }

            return { projectId: pId, parentId: paId };
        } catch (e) {
            console.error("Failed to parse issue dialog URL", e);
            return {
                projectId: String(window.RedmineCanvasGantt?.projectId || ''),
                parentId: undefined
            };
        }
    }, [issueDialogUrl]);

    React.useEffect(() => {
        iframeEscapeCleanupRef.current?.();
        iframeEscapeCleanupRef.current = null;
        setIframeError(null);
        setIsSaving(false);
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
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxSizing: 'border-box'
                }}
            >
                {/* Header - Fixed Height */}
                <div
                    style={{
                        flex: '0 0 auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 24px',
                        backgroundColor: '#ffffff',
                        borderBottom: '1px solid #e0e0e0'
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
                            onClick={() => handleClose()}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '32px',
                                height: '32px',
                                borderRadius: '6px',
                                border: '1px solid #e0e0e0',
                                backgroundColor: '#fff',
                                color: '#333'
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
                                borderRadius: '6px',
                                border: '1px solid #e0e0e0',
                                backgroundColor: '#fff',
                                color: '#333'
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                        src={issueDialogUrl}
                        onLoad={handleIframeLoad}
                        style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            flex: 1
                        }}
                    />
                </div>

                {/* Bulk Creation Section - Fixed Height */}
                <div style={{ flex: '0 0 auto', padding: '12px 24px 0 24px', backgroundColor: '#fff', borderTop: '1px solid #e0e0e0' }}>
                    <BulkSubtaskCreator
                        ref={bulkRef}
                        projectId={projectId}
                        parentId={parentId}
                        hideStandaloneButton={true}
                        showTopBorder={false}
                        onTasksCreated={() => {
                            void refreshData();
                        }}
                    />
                </div>

                {/* Footer Buttons - Fixed Height */}
                <div style={{
                    flex: '0 0 auto',
                    padding: '12px 24px 24px 24px', // More bottom padding to prevent cutting
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px',
                    backgroundColor: '#fff'
                }}>
                    <button
                        onClick={handleClose}
                        disabled={isSaving}
                        style={{
                            height: '36px',
                            padding: '0 16px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#fff',
                            color: '#333',
                            border: '1px solid #ccc',
                            borderRadius: 4,
                            fontSize: 14,
                            cursor: isSaving ? 'default' : 'pointer',
                            minWidth: '100px',
                            boxSizing: 'border-box'
                        }}
                    >
                        {i18n.t('button_cancel') || 'Cancel'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        style={{
                            height: '36px',
                            padding: '0 16px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isSaving ? '#ccc' : '#1a73e8',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: isSaving ? 'default' : 'pointer',
                            minWidth: '100px',
                            boxSizing: 'border-box'
                        }}
                    >
                        {isSaving ? (i18n.t('label_loading') || 'Saving...') : (i18n.t('button_save') || 'Save')}
                    </button>
                </div>
            </div>
        </div>
    );
};
