import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomFieldEditor, DoneRatioEditor, DueDateEditor, SelectEditor, SubjectEditor } from './InlineEditors';

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

    it('focuses the progress input when its editor opens', () => {
        render(
            <DoneRatioEditor
                initialValue={10}
                onCancel={vi.fn()}
                onCommit={vi.fn().mockResolvedValue(undefined)}
            />
        );

        expect(screen.getByRole('spinbutton')).toHaveFocus();
    });

    it('commits a progress value only once when Enter is followed by blur', async () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);
        const onCancel = vi.fn();
        render(<DoneRatioEditor initialValue={10} onCommit={onCommit} onCancel={onCancel} />);

        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '40' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.blur(input);

        await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
        expect(onCommit).toHaveBeenCalledWith(40);
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('does not cancel when optimistic props match while a progress save is pending', async () => {
        const save = deferred<void>();
        const onCommit = vi.fn(() => save.promise);
        const onCancel = vi.fn();
        const { rerender } = render(
            <DoneRatioEditor initialValue={10} onCommit={onCommit} onCancel={onCancel} />
        );
        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '40' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));

        rerender(<DoneRatioEditor initialValue={40} onCommit={onCommit} onCancel={onCancel} />);
        fireEvent.blur(input);

        expect(onCancel).not.toHaveBeenCalled();
        expect(input).toBeInTheDocument();
        await act(async () => { save.resolve(); });
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('keeps errors visible and permits retry after a progress save rejects', async () => {
        const onCommit = vi.fn()
            .mockRejectedValueOnce(new Error('Save failed'))
            .mockResolvedValueOnce(undefined);
        const onCancel = vi.fn();
        render(<DoneRatioEditor initialValue={10} onCommit={onCommit} onCancel={onCancel} />);

        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '40' } });
        fireEvent.blur(input);
        expect(await screen.findByText('Save failed')).toBeInTheDocument();
        expect(onCancel).not.toHaveBeenCalled();

        fireEvent.change(input, { target: { value: '50' } });
        fireEvent.blur(input);
        await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2));
        expect(onCommit).toHaveBeenLastCalledWith(50);
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('cancels unchanged progress on blur without saving', () => {
        const onCommit = vi.fn();
        const onCancel = vi.fn();
        render(<DoneRatioEditor initialValue={10} onCommit={onCommit} onCancel={onCancel} />);

        fireEvent.blur(screen.getByRole('spinbutton'));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onCommit).not.toHaveBeenCalled();
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
