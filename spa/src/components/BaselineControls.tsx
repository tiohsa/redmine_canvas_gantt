import React from 'react';

import { i18n } from '../utils/i18n';
import type { BaselineSaveScope } from '../types/baseline';

interface BaselineControlsProps {
    baselineSaveStatus: 'idle' | 'saving' | 'ready' | 'error';
    hasBaseline: boolean;
    showBaseline: boolean;
    baselineEditable: boolean;
    baselineSaveMenuRef: React.RefObject<HTMLDivElement | null>;
    showBaselineSaveMenu: boolean;
    onToggleSaveMenu: () => void;
    onSaveBaseline: (scope: BaselineSaveScope) => void;
    onToggleBaseline: () => void;
}

export const BaselineControls: React.FC<BaselineControlsProps> = ({
    baselineSaveStatus,
    hasBaseline,
    showBaseline,
    baselineEditable,
    baselineSaveMenuRef,
    showBaselineSaveMenu,
    onToggleSaveMenu,
    onSaveBaseline,
    onToggleBaseline
}) => {
    if (!baselineEditable) return null;

    return (
        <>
            <div ref={baselineSaveMenuRef} style={{ position: 'relative' }}>
                <button
                    type="button"
                    onClick={onToggleSaveMenu}
                    aria-label={i18n.t('label_save_baseline') || 'Save Baseline'}
                    title={i18n.t('label_save_baseline_tooltip') || 'Save a baseline snapshot'}
                    disabled={baselineSaveStatus === 'saving'}
                    data-testid="baseline-save-menu-button"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: '1px solid #b45309',
                        backgroundColor: baselineSaveStatus === 'saving' ? '#fef3c7' : '#fff7ed',
                        color: '#b45309',
                        cursor: baselineSaveStatus === 'saving' ? 'not-allowed' : 'pointer',
                        height: '32px',
                        width: '40px'
                    }}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: baselineSaveStatus === 'saving' ? 0.6 : 1 }}>
                        <path d="M12 3v12" />
                        <path d="m7 10 5 5 5-5" />
                        <path d="M5 21h14" />
                    </svg>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>
                {showBaselineSaveMenu && baselineSaveStatus !== 'saving' && (
                    <div
                        data-testid="baseline-save-menu"
                        style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '4px',
                            background: '#fff',
                            border: '1px solid #e0e0e0',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            padding: '8px',
                            zIndex: 20,
                            minWidth: '220px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => onSaveBaseline('filtered')}
                            style={{ border: 'none', background: '#fff', textAlign: 'left', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            {i18n.t('label_save_baseline_filtered') || 'Save filtered view as baseline'}
                        </button>
                        <button
                            type="button"
                            onClick={() => onSaveBaseline('project')}
                            style={{ border: 'none', background: '#fff', textAlign: 'left', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            {i18n.t('label_save_baseline_project') || 'Save whole project as baseline'}
                        </button>
                    </div>
                )}
            </div>

            <button
                type="button"
                onClick={onToggleBaseline}
                aria-label={i18n.t('label_show_baseline') || 'Show Baseline'}
                title={showBaseline
                    ? (i18n.t('label_hide_baseline_tooltip') || 'Hide baseline comparison')
                    : (i18n.t('label_show_baseline_tooltip') || 'Show baseline comparison')}
                disabled={!hasBaseline}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    border: '1px solid #e0e0e0',
                    backgroundColor: showBaseline ? '#e8f0fe' : '#fff',
                    color: hasBaseline ? (showBaseline ? '#1a73e8' : '#333') : '#94a3b8',
                    cursor: hasBaseline ? 'pointer' : 'not-allowed',
                    opacity: hasBaseline ? 1 : 0.75,
                    height: '32px',
                    width: '32px',
                    position: 'relative'
                }}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
                {showBaseline && (
                    <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: '#1a73e8', borderRadius: '50%' }} />
                )}
            </button>
        </>
    );
};
