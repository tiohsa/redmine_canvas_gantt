import React from 'react';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';

export const IssueIframeDialog: React.FC = () => {
    const issueDialogUrl = useUIStore(state => state.issueDialogUrl);
    const closeIssueDialog = useUIStore(state => state.closeIssueDialog);
    const refreshData = useTaskStore(state => state.refreshData);
    const iframeRef = React.useRef<HTMLIFrameElement>(null);

    if (!issueDialogUrl) return null;

    const handleClose = () => {
        closeIssueDialog();
        void refreshData();
    };

    const handleIframeLoad = () => {
        try {
            const iframe = iframeRef.current;
            if (!iframe) return;

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
                    width: '90%',
                    height: '90%',
                    maxWidth: 1200,
                    maxHeight: 800,
                    backgroundColor: 'white',
                    borderRadius: 8,
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
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
                        padding: '10px 20px',
                        borderBottom: '1px solid #e0e0e0',
                        backgroundColor: '#ffffff'
                    }}
                >
                    <span style={{ fontWeight: 600, color: '#333' }}>
                        #{issueDialogUrl.split('/').pop()?.split('?')[0] || i18n.t('button_edit')}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <a
                            href={issueDialogUrl}
                            target="_blank"
                            rel="noopener noreferrer"
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
