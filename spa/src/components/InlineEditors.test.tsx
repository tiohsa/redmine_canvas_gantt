import { fireEvent, render, screen } from '@testing-library/react';
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
