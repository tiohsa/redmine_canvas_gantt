import React from 'react';
import { describe, expect, it, vi } from 'vitest';
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

const Harness: React.FC<{ onConfirm?: (snapshotId: string) => Promise<void> }> = ({ onConfirm = async () => undefined }) => {
    const [open, setOpen] = React.useState(true);
    return (
        <>
            <button data-testid="baseline-save-menu-button">Baseline menu</button>
            {open && <BaselineDeleteConfirmation snapshot={snapshot} onCancel={() => setOpen(false)} onConfirm={onConfirm} />}
        </>
    );
};

describe('BaselineDeleteConfirmation', () => {
    it('opens as an alertdialog, focuses cancel, traps Tab, and restores focus to the menu trigger', () => {
        render(<Harness />);
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
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('baseline-save-menu-button')).toHaveFocus();
    });

    it('keeps focus inside the dialog while the delete request is pending', async () => {
        let finish!: () => void;
        const onConfirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
        render(<Harness onConfirm={onConfirm} />);
        const dialog = screen.getByRole('alertdialog');

        fireEvent.click(screen.getByTestId('baseline-delete-confirm-button'));
        await act(async () => Promise.resolve());
        expect(onConfirm).toHaveBeenCalledWith('snapshot-1');
        expect(dialog).toHaveFocus();
        fireEvent.keyDown(dialog, { key: 'Tab' });
        expect(dialog).toHaveFocus();

        await act(async () => finish());
    });

    it('bounds the panel to the viewport and keeps its content scrollable', () => {
        render(<Harness />);
        const dialog = screen.getByRole('alertdialog');
        const backdrop = dialog.parentElement as HTMLElement;

        expect(backdrop).toHaveStyle({ boxSizing: 'border-box', padding: '16px' });
        expect(dialog).toHaveStyle({
            maxHeight: 'calc(100vh - 32px)',
            minHeight: '0',
            overflowY: 'auto',
            boxSizing: 'border-box',
            whiteSpace: 'normal'
        });
    });
});
