import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomFieldEditor, DueDateEditor, SelectEditor, SubjectEditor } from './InlineEditors';

describe('InlineEditors', () => {
    const deferred = <T,>() => {
        let resolve!: (value: T) => void;
        const promise = new Promise<T>((res) => {
            resolve = res;
        });
        return { promise, resolve };
    };

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

    it('leaves a mounted select enabled when a resolved commit is handled by the owner', async () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);
        const onCancel = vi.fn();

        render(
            <SelectEditor
                value={1}
                options={[{ id: 1, name: 'One' }, { id: 2, name: 'Two' }]}
                onCancel={onCancel}
                onCommit={onCommit}
            />
        );

        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: '2' } });

        await waitFor(() => expect(onCommit).toHaveBeenCalledWith(2));
        await waitFor(() => expect(select).toBeEnabled());
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('shows a runtime rejection and leaves the select enabled for retry', async () => {
        const onCommit = vi.fn().mockRejectedValue(new Error('Runtime rejection'));

        render(
            <SelectEditor
                value={1}
                options={[{ id: 1, name: 'One' }, { id: 2, name: 'Two' }]}
                onCancel={vi.fn()}
                onCommit={onCommit}
            />
        );

        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: '2' } });

        expect(await screen.findByText('Runtime rejection')).toBeInTheDocument();
        expect(select).toBeEnabled();
    });

    it('does not cancel while a select commit is pending and blur fires', async () => {
        const save = deferred<void>();
        const onCancel = vi.fn();
        const onCommit = vi.fn(() => save.promise);

        render(
            <SelectEditor
                value={1}
                options={[{ id: 1, name: 'One' }, { id: 2, name: 'Two' }]}
                onCancel={onCancel}
                onCommit={onCommit}
            />
        );

        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: '2' } });
        await waitFor(() => expect(select).toBeDisabled());
        fireEvent.blur(select, { relatedTarget: null });

        expect(onCancel).not.toHaveBeenCalled();
        save.resolve();
        await waitFor(() => expect(select).toBeEnabled());
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

    it('calls onCommit when a day is selected in DatePicker', async () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);
        const onCancel = vi.fn();
        
        render(
            <DueDateEditor
                initialValue="2023-01-01"
                onCommit={onCommit}
                onCancel={onCancel}
            />
        );

        // Find a day in the calendar (e.g. 15th)
        const day = screen.getByText('15');
        fireEvent.click(day);

        expect(onCommit).toHaveBeenCalledWith('2023-01-15');
    });
});
