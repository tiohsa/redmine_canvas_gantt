import React from 'react';

import type { BaselineSnapshot } from '../types/baseline';
import { formatBaselineCapturedAt } from '../utils/baseline';
import { i18n } from '../utils/i18n';
import { designTokens, fontFamilies } from '../styles/designTokens';

interface BaselineDeleteConfirmationProps {
    snapshot: BaselineSnapshot;
    onCancel: () => void;
    onConfirm: (snapshotId: string) => Promise<void>;
}

const actionButtonStyle: React.CSSProperties = {
    height: '28px',
    padding: '0 16px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 9999,
    fontSize: 13,
    minWidth: '88px',
    boxSizing: 'border-box',
    transition: 'background 0.2s'
};

export const BaselineDeleteConfirmation: React.FC<BaselineDeleteConfirmationProps> = ({ snapshot, onCancel, onConfirm }) => {
    const dialogRef = React.useRef<HTMLDivElement>(null);
    const cancelRef = React.useRef<HTMLButtonElement>(null);
    const previousFocusRef = React.useRef<HTMLElement | null>(null);
    const [confirming, setConfirming] = React.useState(false);

    React.useEffect(() => {
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        cancelRef.current?.focus();
        return () => {
            const trigger = document.querySelector<HTMLButtonElement>('[data-testid="baseline-save-menu-button"]');
            const restoreTarget = trigger?.isConnected ? trigger : previousFocusRef.current?.isConnected ? previousFocusRef.current : null;
            restoreTarget?.focus();
        };
    }, []);

    React.useEffect(() => {
        if (confirming) dialogRef.current?.focus();
    }, [confirming]);

    React.useEffect(() => {
        const containFocus = (event: FocusEvent) => {
            if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
                (confirming ? dialogRef.current : cancelRef.current)?.focus();
            }
        };
        document.addEventListener('focusin', containFocus);
        return () => document.removeEventListener('focusin', containFocus);
    }, [confirming]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (!confirming) onCancel();
            return;
        }
        if (event.key !== 'Tab') return;

        const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) {
            event.preventDefault();
            dialogRef.current?.focus();
            return;
        }
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const confirm = async () => {
        if (confirming) return;
        setConfirming(true);
        try {
            await onConfirm(snapshot.snapshotId);
        } catch {
            // The owner reports mutation failures; always release the dialog controls.
        } finally {
            setConfirming(false);
        }
    };

    const scope = snapshot.scope === 'project'
        ? i18n.t('label_save_baseline_project') || 'Whole project'
        : i18n.t('label_save_baseline_filtered') || 'Filtered view';

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                boxSizing: 'border-box',
                background: 'rgba(0, 0, 0, 0.45)'
            }}
        >
            <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-busy={confirming}
                aria-labelledby="baseline-delete-title"
                aria-describedby="baseline-delete-description baseline-delete-warning"
                tabIndex={-1}
                onKeyDown={handleKeyDown}
                style={{
                    width: 'min(480px, 100%)',
                    minWidth: 0,
                    minHeight: 0,
                    maxHeight: 'calc(100vh - 32px)',
                    overflowY: 'auto',
                    boxSizing: 'border-box',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    borderRadius: '10px',
                    padding: '24px',
                    background: designTokens.controlBg,
                    color: designTokens.controlFg,
                    border: `1px solid ${designTokens.borderSubtle}`,
                    boxShadow: designTokens.menuShadow,
                    fontFamily: fontFamilies.ui,
                    fontSize: '14px',
                    lineHeight: 1.5
                }}
            >
                <h2 id="baseline-delete-title" style={{ margin: '0 0 12px', fontSize: '18px' }}>
                    {i18n.t('label_baseline_delete_title') || 'Delete baseline'}
                </h2>
                <p id="baseline-delete-description" style={{ margin: '0 0 12px' }}>
                    {i18n.t('label_baseline_delete_body') || 'Delete the baseline saved for this project.'}
                </p>
                <dl style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', gap: '4px 12px', margin: '0 0 16px' }}>
                    <dt>{i18n.t('label_baseline_delete_saved_at') || 'Saved at'}</dt>
                    <dd style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{formatBaselineCapturedAt(snapshot.capturedAt)}</dd>
                    <dt>{i18n.t('label_baseline_delete_saved_by') || 'Saved by'}</dt>
                    <dd style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{snapshot.capturedByName || '—'}</dd>
                    <dt>{i18n.t('label_baseline_delete_scope') || 'Saved scope'}</dt>
                    <dd style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{scope}</dd>
                </dl>
                <p id="baseline-delete-warning" style={{ margin: '0 0 20px', overflowWrap: 'anywhere' }}>
                    {i18n.t('label_baseline_delete_irreversible') || 'This action cannot be undone. Issues and current dates will not change.'}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        ref={cancelRef}
                        type="button"
                        data-testid="baseline-delete-cancel-button"
                        onClick={onCancel}
                        disabled={confirming}
                        style={{
                            ...actionButtonStyle,
                            background: '#f0f0f0',
                            color: '#222222',
                            fontWeight: 500,
                            cursor: confirming ? 'default' : 'pointer'
                        }}
                    >
                        {i18n.t('label_baseline_delete_cancel') || 'Cancel'}
                    </button>
                    <button
                        type="button"
                        data-testid="baseline-delete-confirm-button"
                        onClick={() => void confirm()}
                        disabled={confirming}
                        style={{
                            ...actionButtonStyle,
                            background: confirming ? '#8e8e93' : '#181e25',
                            color: '#ffffff',
                            fontWeight: 600,
                            cursor: confirming ? 'default' : 'pointer',
                            opacity: confirming ? 0.7 : 1
                        }}
                    >
                        {confirming ? (i18n.t('label_deleting') || 'Deleting…') : (i18n.t('label_baseline_delete_confirm') || 'Delete')}
                    </button>
                </div>
            </div>
        </div>
    );
};
