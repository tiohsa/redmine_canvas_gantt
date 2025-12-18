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
                        padding: '12px 16px',
                        borderBottom: '1px solid #e0e0e0',
                        backgroundColor: '#f8f9fa'
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
                                padding: '6px 12px',
                                fontSize: 13,
                                color: '#1a73e8',
                                textDecoration: 'none',
                                border: '1px solid #1a73e8',
                                borderRadius: 4,
                                backgroundColor: 'white'
                            }}
                        >
                            ↗
                        </a>
                        <button
                            type="button"
                            onClick={handleClose}
                            style={{
                                padding: '6px 12px',
                                fontSize: 13,
                                cursor: 'pointer',
                                border: '1px solid #ccc',
                                borderRadius: 4,
                                backgroundColor: 'white',
                                color: '#333'
                            }}
                        >
                            ✕
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
