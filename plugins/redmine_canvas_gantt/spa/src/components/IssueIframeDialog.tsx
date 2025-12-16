import React from 'react';
import { useUIStore } from '../stores/UIStore';
import { i18n } from '../utils/i18n';

export const IssueIframeDialog: React.FC = () => {
    const issueDialogUrl = useUIStore(state => state.issueDialogUrl);
    const closeIssueDialog = useUIStore(state => state.closeIssueDialog);

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
                // Close when clicking backdrop
                if (e.target === e.currentTarget) {
                    closeIssueDialog();
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
                        {i18n.t('button_edit')}
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
                            title={i18n.t('label_open_in_new_tab') || 'Open in new tab'}
                        >
                            ↗
                        </a>
                        <button
                            type="button"
                            onClick={closeIssueDialog}
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
                        src={issueDialogUrl}
                        style={{
                            width: '100%',
                            height: '100%',
                            border: 'none'
                        }}
                        title="Issue Editor"
                    />
                </div>
            </div>
        </div>
    );
};
