import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureBusinessCalendar } from '../utils/businessCalendar';
import { designTokens } from '../styles/designTokens';
import { TimelineHeader } from './TimelineHeader';

const fillRects: Array<{ color: string; args: unknown[] }> = [];
const context = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: 'left',
    clearRect: vi.fn(),
    fillRect: (...args: unknown[]) => fillRects.push({ color: context.fillStyle, args }),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    setTransform: vi.fn()
};

vi.mock('../stores/TaskStore', () => ({
    useTaskStore: () => ({
        viewport: {
            startDate: Date.UTC(2027, 0, 4),
            scrollX: 0,
            scrollY: 0,
            scale: 40 / (24 * 60 * 60 * 1000),
            width: 80,
            height: 400,
            rowHeight: 40
        },
        zoomLevel: 2
    })
}));

vi.mock('../utils/grid', () => ({
    getGridScales: () => ({
        top: [{ time: Date.UTC(2027, 0, 1), x: -120, label: '2027/01' }],
        middle: [{ time: Date.UTC(2027, 0, 4), x: 0, label: 'W1' }],
        bottom: [
            { time: Date.UTC(2027, 0, 4), x: 0, label: '4' },
            { time: Date.UTC(2027, 0, 5), x: 40, label: '5' }
        ]
    })
}));

describe('TimelineHeader business calendar shading', () => {
    beforeEach(() => {
        fillRects.length = 0;
        vi.clearAllMocks();
        HTMLCanvasElement.prototype.getContext = vi.fn(() => context) as unknown as typeof HTMLCanvasElement.prototype.getContext;
        window.RedmineCanvasGantt = {
            projectId: 1,
            apiBase: '/api',
            redmineBase: '',
            authToken: '',
            apiKey: '',
            nonWorkingWeekDays: [0, 6]
        };
        configureBusinessCalendar({
            status: 'ok',
            revision: 'one',
            default_calendar_id: null,
            project_calendar_ids: { 1: 'holiday' },
            calendars: {
                holiday: {
                    id: 'holiday',
                    name: 'Holiday',
                    non_working_week_days: [0, 6],
                    days: { '2027-01-04': { name: 'Holiday', type: 'non_working' } }
                }
            },
            warnings: []
        });
    });

    it('uses the weekend color for a project-specific holiday', () => {
        render(<TimelineHeader />);

        expect(fillRects).toContainEqual({
            color: designTokens.weekendBg,
            args: [0, expect.any(Number), 40, expect.any(Number)]
        });
    });
});
