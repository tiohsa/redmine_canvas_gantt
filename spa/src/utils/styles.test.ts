import { describe, expect, it } from 'vitest';
import { getPriorityColor, getStatusColor } from './styles';

describe('getStatusColor', () => {
    it('uses the closed badge style when backend status metadata marks the status closed', () => {
        expect(getStatusColor(2, true)).toEqual({
            bg: '#e8f5e9',
            text: '#2e7d32',
            bar: '#66bb6a',
            label: 'Closed'
        });
    });
});

describe('getPriorityColor', () => {
    it('colors priorities by Redmine position even when the name is localized', () => {
        expect(getPriorityColor(3, 4)).toEqual({ bg: '#ffebee', text: '#c62828' });
        expect(getPriorityColor(2, 3)).toEqual({ bg: '#fff3e0', text: '#ef6c00' });
        expect(getPriorityColor(1, 1)).toEqual({ bg: '#f5f5f5', text: '#616161' });
    });
});
