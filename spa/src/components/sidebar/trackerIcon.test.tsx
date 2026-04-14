import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrackerIcon } from './trackerIcon';
import { parseTrackerIconMap, resolveTrackerIconKind } from './trackerIconUtils';

describe('trackerIcon', () => {
    it('parses tracker icon map JSON strings', () => {
        expect(parseTrackerIconMap('{"7":"bug","8":"feature","9":"task","10":"unknown"}')).toEqual({
            7: 'bug',
            8: 'feature',
            9: 'task'
        });
    });

    it('prefers trackerId mappings over tracker name fallback', () => {
        expect(resolveTrackerIconKind(7, '機能', { 7: 'bug' })).toBe('bug');
    });

    it('falls back to tracker name keywords and then task', () => {
        expect(resolveTrackerIconKind(undefined, '不具合')).toBe('bug');
        expect(resolveTrackerIconKind(undefined, '問い合わせ')).toBe('support');
        expect(resolveTrackerIconKind(undefined, 'custom tracker')).toBe('task');
    });

    it('renders the requested icon kind', () => {
        render(<TrackerIcon kind="support" />);
        expect(screen.getByTestId('tracker-icon-support')).toBeInTheDocument();
    });
});
