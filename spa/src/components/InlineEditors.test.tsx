import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomFieldEditor, SelectEditor } from './InlineEditors';

describe('InlineEditors custom list select', () => {
    it('commits selected value in SelectEditor', async () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);
        const onCancel = vi.fn();

        render(
            <SelectEditor
                value={1}
                options={[
                    { id: 1, name: 'Alice' },
                    { id: 2, name: 'Bob' }
                ]}
                includeUnassigned
                onCommit={onCommit}
                onCancel={onCancel}
            />
        );

        fireEvent.click(screen.getByTestId('select-editor-button'));
        fireEvent.click(screen.getByRole('option', { name: 'Bob' }));

        await waitFor(() => {
            expect(onCommit).toHaveBeenCalledWith(2);
        });
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('commits required custom-field list value without empty option', async () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);
        const onCancel = vi.fn();

        render(
            <CustomFieldEditor
                customField={{
                    id: 1,
                    name: 'Category',
                    fieldFormat: 'list',
                    isRequired: true,
                    possibleValues: ['A', 'B']
                }}
                initialValue="A"
                onCommit={onCommit}
                onCancel={onCancel}
            />
        );

        fireEvent.click(screen.getByTestId('custom-field-list-editor-button'));
        expect(screen.queryByRole('option', { name: '-' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('option', { name: 'B' }));

        await waitFor(() => {
            expect(onCommit).toHaveBeenCalledWith('B');
        });
        expect(onCancel).not.toHaveBeenCalled();
    });
});

