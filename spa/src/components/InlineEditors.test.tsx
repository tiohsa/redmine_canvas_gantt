import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomFieldEditor, DueDateEditor, SelectEditor, SubjectEditor } from './InlineEditors';

describe('InlineEditors', () => {
    it('applies explicit control dimensions to searchable selects', () => {
        const options = Array.from({ length: 21 }, (_, index) => ({
            id: index + 1,
            name: `Option ${index + 1}`
        }));

        render(
            <SelectEditor
                value={1}
                options={options}
                controlHeight={22}
                onCancel={vi.fn()}
                onCommit={vi.fn().mockResolvedValue(undefined)}
            />
        );

        const searchInput = screen.getByPlaceholderText('Search...');
        const select = screen.getByRole('combobox');

        expect(searchInput).toHaveStyle({ height: '22px', padding: '0 8px' });
        expect(select).toHaveStyle({ height: '22px', padding: '0 24px 0 8px' });
    });

    it('applies explicit control dimensions to subject inputs', () => {
        render(
            <SubjectEditor
                initialValue="Task subject"
                controlHeight={20}
                onCancel={vi.fn()}
                onCommit={vi.fn().mockResolvedValue(undefined)}
            />
        );

        const input = screen.getByDisplayValue('Task subject');
        expect(input).toHaveStyle({ height: '20px', lineHeight: '18px', padding: '0 8px' });
    });

    it('applies explicit control dimensions to custom field list editors', () => {
        render(
            <CustomFieldEditor
                customField={{
                    id: 10,
                    name: 'Priority Bucket',
                    fieldFormat: 'list',
                    isRequired: false,
                    possibleValues: ['A', 'B']
                }}
                initialValue="A"
                controlHeight={21}
                onCancel={vi.fn()}
                onCommit={vi.fn().mockResolvedValue(undefined)}
            />
        );

        const select = screen.getByRole('combobox');
        expect(select).toHaveStyle({ height: '21px', padding: '0 24px 0 8px' });
    });

    it('commits on change and does not duplicate the commit on blur', () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);
        const onCancel = vi.fn();

        render(
            <DueDateEditor
                initialValue="2025-01-15"
                onCancel={onCancel}
                onCommit={onCommit}
            />
        );

        const input = document.querySelector('input[type="date"]') as HTMLInputElement | null;
        expect(input).not.toBeNull();
        fireEvent.change(input!, { target: { value: '2025-01-20' } });
        fireEvent.blur(input!);

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith('2025-01-20');
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('shows the latest changed date while the editor remains open', () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);

        render(
            <DueDateEditor
                initialValue="2025-01-15"
                onCancel={vi.fn()}
                onCommit={onCommit}
            />
        );

        const input = document.querySelector('input[type="date"]') as HTMLInputElement | null;
        expect(input).not.toBeNull();
        fireEvent.change(input!, { target: { value: '2025-01-20' } });

        expect(onCommit).toHaveBeenCalledWith('2025-01-20');
        expect(screen.getByText(new Date(2025, 0, 20).toLocaleDateString())).toBeInTheDocument();
    });

    it('keeps the date input interactive after a successful commit', async () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);

        render(
            <DueDateEditor
                initialValue="2025-01-15"
                onCancel={vi.fn()}
                onCommit={onCommit}
            />
        );

        const input = document.querySelector('input[type="date"]') as HTMLInputElement | null;
        expect(input).not.toBeNull();

        fireEvent.change(input!, { target: { value: '2025-01-20' } });

        expect(onCommit).toHaveBeenCalledWith('2025-01-20');
        await waitFor(() => {
            expect(input).not.toBeDisabled();
        });
    });

    it('does not add extra horizontal offset to the inline date label', () => {
        render(
            <DueDateEditor
                initialValue="2025-01-15"
                onCancel={vi.fn()}
                onCommit={vi.fn().mockResolvedValue(undefined)}
            />
        );

        expect(screen.getByText(new Date(2025, 0, 15).toLocaleDateString())).toHaveStyle({ padding: '0px' });
    });

    it('keeps the date label visible while the native date picker overlay is mounted', () => {
        render(
            <DueDateEditor
                initialValue="2025-01-15"
                onCancel={vi.fn()}
                onCommit={vi.fn().mockResolvedValue(undefined)}
            />
        );

        expect(screen.getByText(new Date(2025, 0, 15).toLocaleDateString())).toBeInTheDocument();
        expect(document.querySelector('input[type="date"]')).not.toBeNull();
    });

    it('reopens the native picker on double click while the date editor is still mounted', () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);
        const showPicker = vi.fn();

        render(
            <DueDateEditor
                initialValue="2025-01-15"
                onCancel={vi.fn()}
                onCommit={onCommit}
            />
        );

        const input = document.querySelector('input[type="date"]') as HTMLInputElement | null;
        expect(input).not.toBeNull();
        Object.defineProperty(input!, 'showPicker', {
            value: showPicker,
            configurable: true
        });

        fireEvent.doubleClick(input!);

        expect(showPicker).toHaveBeenCalledTimes(1);
    });
});
