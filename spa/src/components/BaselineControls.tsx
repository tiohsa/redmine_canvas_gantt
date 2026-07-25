import React from 'react';

import { i18n } from '../utils/i18n';
import type { BaselineSaveScope } from '../types/baseline';
import { fontFamilies, designTokens } from '../styles/designTokens';

interface BaselineControlsProps {
    baselineSaveStatus: 'idle' | 'saving' | 'ready' | 'error';
    hasBaseline: boolean;
    showBaseline: boolean;
    baselineEditable: boolean;
    baselineViewable: boolean;
    baselineSaveMenuRef: React.RefObject<HTMLDivElement | null>;
    showBaselineSaveMenu: boolean;
    onToggleSaveMenu: () => void;
    onSaveBaseline: (scope: BaselineSaveScope) => void;
    onToggleBaseline: () => void;
}

const menuItemStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    background: 'transparent',
    color: designTokens.controlFg,
    textAlign: 'left',
    padding: '8px',
    borderRadius: '6px',
    cursor: 'pointer',
    font: 'inherit'
};

export const BaselineControls: React.FC<BaselineControlsProps> = ({
    baselineSaveStatus,
    hasBaseline,
    showBaseline,
    baselineEditable,
    baselineViewable,
    baselineSaveMenuRef,
    showBaselineSaveMenu,
    onToggleSaveMenu,
    onSaveBaseline,
    onToggleBaseline
}) => {
    if (!baselineEditable && !baselineViewable) return null;

    const isSaving = baselineSaveStatus === 'saving';
    const isActive = showBaseline || hasBaseline || isSaving;

    return (
        <div ref={baselineSaveMenuRef} style={{ position: 'relative' }}>
            <button
                type="button"
                onClick={onToggleSaveMenu}
                aria-label={i18n.t('label_save_baseline') || 'Save Baseline'}
                title={i18n.t('label_save_baseline_tooltip') || 'Save a baseline snapshot'}
                aria-pressed={isActive}
                disabled={isSaving}
                data-testid="baseline-save-menu-button"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '0 8px',
                    borderRadius: '6px',
                    border: `1px solid ${isActive ? designTokens.controlActiveFg : designTokens.controlBorder}`,
                    backgroundColor: isActive ? designTokens.controlActiveBg : designTokens.controlBg,
                    color: isActive ? designTokens.controlActiveFg : designTokens.controlFg,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    height: '32px',
                    width: '40px'
                }}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: isSaving ? 0.6 : 1 }}>
                    <path d="M4 5h16v14H4z" />
                    <path d="M8 5v4h8V5" />
                    <path d="M8 19v-5h8v5" />
                </svg>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {showBaselineSaveMenu && !isSaving && (
                <div
                    data-testid="baseline-save-menu"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '8px',
                        background: designTokens.controlBg,
                        border: `1px solid ${designTokens.controlBorder}`,
                        borderRadius: '8px',
                        boxShadow: designTokens.menuShadow,
                        padding: '8px',
                        zIndex: 20,
                        minWidth: '240px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        fontFamily: fontFamilies.ui,
                        fontSize: '13px',
                        lineHeight: 1.5
                    }}
                >
                    {baselineViewable && (
                        <label
                            data-testid="baseline-toggle-menu-item"
                            style={{
                                ...menuItemStyle,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: 'transparent',
                                color: hasBaseline ? designTokens.controlFg : designTokens.disabledFg,
                                cursor: hasBaseline ? 'pointer' : 'not-allowed',
                                opacity: hasBaseline ? 1 : 0.75
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={showBaseline}
                                onChange={onToggleBaseline}
                                disabled={!hasBaseline}
                                data-testid="baseline-toggle-checkbox"
                            />
                            <span>{i18n.t('label_show_baseline_tooltip') || 'Show baseline comparison'}</span>
                        </label>
                    )}
                    {baselineEditable && (
                        <>
                            {baselineViewable && <div style={{ borderTop: `1px solid ${designTokens.borderSubtle}`, margin: '4px 0' }} />}
                            <button type="button" data-testid="baseline-save-filtered-button" onClick={() => onSaveBaseline('filtered')} style={menuItemStyle}>
                                {i18n.t('label_save_baseline_filtered') || 'Save filtered view as baseline'}
                            </button>
                            <button type="button" data-testid="baseline-save-project-button" onClick={() => onSaveBaseline('project')} style={menuItemStyle}>
                                {i18n.t('label_save_baseline_project') || 'Save whole project as baseline'}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
