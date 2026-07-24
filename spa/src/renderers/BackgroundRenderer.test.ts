import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureBusinessCalendar } from '../utils/businessCalendar';
import { designTokens } from '../styles/designTokens';
import { BackgroundRenderer } from './BackgroundRenderer';
import type { Task, Viewport } from '../types';

vi.mock('../utils/grid', () => ({
    getGridScales: () => ({
        top: [],
        middle: [],
        bottom: [
            { time: new Date('2027-01-04').getTime(), x: 0 },
            { time: new Date('2027-01-05').getTime(), x: 10 }
        ]
    })
}));

const viewport = {
    scale: 1,
    rowHeight: 20,
    scrollY: 0
} as Viewport;

const buildTask = (id: string, projectId: string, rowIndex: number): Task => ({
    id,
    projectId,
    subject: id,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex,
    hasChildren: false
});

describe('BackgroundRenderer business calendar shading', () => {
    const fillRect = vi.fn();
    const fillRectsWithColors: Array<{ color: string; args: unknown[] }> = [];
    const context = {
        clearRect: vi.fn(),
        fillRect: (...args: unknown[]) => {
            fillRect(...args);
            fillRectsWithColors.push({ color: context.fillStyle, args });
        },
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1
    };
    const canvas = {
        width: 100,
        height: 100,
        clientWidth: 100,
        clientHeight: 100,
        setAttribute: vi.fn(),
        getContext: vi.fn(() => context)
    } as unknown as HTMLCanvasElement;

    beforeEach(() => {
        fillRect.mockClear();
        fillRectsWithColors.length = 0;
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
            project_calendar_ids: { 1: 'holiday', 2: 'working' },
            calendars: {
                holiday: {
                    id: 'holiday',
                    name: 'Holiday',
                    non_working_week_days: [0, 6],
                    days: { '2027-01-04': { name: 'Holiday', type: 'non_working' } }
                },
                working: {
                    id: 'working',
                    name: 'Working',
                    non_working_week_days: [0, 6],
                    days: {}
                }
            },
            warnings: []
        });
    });

    it('draws an explicit holiday with the weekend color for the full root area', () => {
        new BackgroundRenderer(canvas).render(viewport, 2, null, [buildTask('one', '1', 0)]);

        expect(fillRect).toHaveBeenCalledWith(0, 0, 10, 100);
        expect(fillRectsWithColors).toContainEqual({
            color: designTokens.weekendBg,
            args: [0, 0, 10, 100]
        });
        expect(canvas.setAttribute).toHaveBeenCalledWith(
            'data-business-calendar-non-working-days',
            '2027-01-04'
        );
    });

    it('draws a weekly non-working day with the weekend color for the full root area', () => {
        configureBusinessCalendar({
            status: 'ok',
            revision: 'weekly',
            default_calendar_id: null,
            project_calendar_ids: { 1: 'weekly' },
            calendars: {
                weekly: {
                    id: 'weekly',
                    name: 'Weekly',
                    non_working_week_days: [1],
                    days: {}
                }
            },
            warnings: []
        });

        new BackgroundRenderer(canvas).render(viewport, 2, null, [buildTask('one', '1', 0)]);

        expect(fillRect).toHaveBeenCalledWith(0, 0, 10, 100);
    });

    it('clears only rows whose project calendar marks a mixed-calendar date working', () => {
        new BackgroundRenderer(canvas).render(viewport, 2, null, [
            buildTask('one', '1', 0),
            buildTask('two', '2', 1)
        ]);

        expect(fillRect).toHaveBeenCalledWith(0, 20, 10, 20);
    });
});
