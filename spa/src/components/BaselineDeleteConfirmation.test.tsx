import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { BaselineDeleteConfirmation } from './BaselineDeleteConfirmation';
import type { BaselineSnapshot } from '../types/baseline';

const snapshot: BaselineSnapshot = {
    snapshotId: 'snapshot-1',
    projectId: '1',
    capturedAt: '2026-10-17T00:00:00.000Z',
    capturedByName: 'Ada',
    scope: 'filtered',
    tasksByIssueId: {}
};

const Harness: React.FC<{
    onCancel?: () => void;
    onConfirm?: (snapshotId: string) => Promise<void>;
}> = ({ onCancel = () => undefined, onConfirm = async () => undefined }) => (
    <>
        <button data-testid="baseline-save-menu-button">Baseline menu</button>
        <BaselineDeleteConfirmation snapshot={snapshot} onCancel={onCancel} onConfirm={onConfirm} />
    </>
);

describe('BaselineDeleteConfirmation', () => {
    afterEach(() => vi.useRealTimers());

    it('opens as an alertdialog, focuses Cancel, traps Tab, and restores focus to the trigger', () => {
        const onCancel = vi.fn();
        const { rerender } = render(<Harness onCancel={onCancel} />);
        const cancel = screen.getByTestId('baseline-delete-cancel-button');
        const confirm = screen.getByTestId('baseline-delete-confirm-button');
        const dialog = screen.getByRole('alertdialog', { name: 'Delete baseline' });

        expect(dialog).toBeInTheDocument();
        expect(cancel).toHaveFocus();
        fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
        expect(confirm).toHaveFocus();
        fireEvent.keyDown(confirm, { key: 'Tab' });
        expect(cancel).toHaveFocus();

        fireEvent.keyDown(cancel, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
        rerender(<>
            <button data-testid="baseline-save-menu-button">Baseline menu</button>
        </>);
        expect(screen.getByTestId('baseline-save-menu-button')).toHaveFocus();
    });

    it('keeps focus trapped and ignores Escape while the request is pending', async () => {
        let finish!: () => void;
        const onCancel = vi.fn();
        const onConfirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
        render(<Harness onCancel={onCancel} onConfirm={onConfirm} />);
        const dialog = screen.getByRole('alertdialog');

        fireEvent.click(screen.getByTestId('baseline-delete-confirm-button'));
        await act(async () => Promise.resolve());
        expect(onConfirm).toHaveBeenCalledWith('snapshot-1');
        expect(dialog).toHaveFocus();
        fireEvent.keyDown(dialog, { key: 'Escape' });
        fireEvent.keyDown(dialog, { key: 'Tab' });
        expect(onCancel).not.toHaveBeenCalled();
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
        expect(dialog).toHaveFocus();

        await act(async () => finish());
    });

    it('releases the confirming state if the owner unexpectedly rejects', async () => {
        const onConfirm = vi.fn().mockRejectedValue(new Error('unexpected failure'));
        render(<Harness onConfirm={onConfirm} />);

        await act(async () => {
            fireEvent.click(screen.getByTestId('baseline-delete-confirm-button'));
            await Promise.resolve();
        });

        expect(onConfirm).toHaveBeenCalledWith('snapshot-1');
        expect(screen.getByTestId('baseline-delete-confirm-button')).toBeEnabled();
        expect(screen.getByTestId('baseline-delete-confirm-button')).toHaveTextContent('Delete');
    });

    it('keeps long content inside a viewport-bounded, scrollable panel', () => {
        render(<Harness />);
        const dialog = screen.getByRole('alertdialog');
        const backdrop = dialog.parentElement as HTMLElement;

        expect(backdrop).toHaveStyle({ boxSizing: 'border-box', padding: '16px' });
        expect(dialog).toHaveStyle({
            minWidth: '0',
            minHeight: '0',
            maxHeight: 'calc(100vh - 32px)',
            overflowY: 'auto',
            boxSizing: 'border-box',
            whiteSpace: 'normal',
            overflowWrap: 'anywhere'
        });
    });
});
