import { describe, expect, it } from 'vitest';
import type { Task, Viewport } from '../types';
import { RelationType } from '../types/constraints';
import {
    buildRelationRenderContext,
    buildRelationRoutePoints,
    distanceToPolyline,
    getPolylineMidpoint,
    normalizeRelationForRendering
} from './relationGeometry';

const DAY_MS = 24 * 60 * 60 * 1000;

const viewport: Viewport = {
    startDate: 0,
    scrollX: 0,
    scrollY: 0,
    scale: 1 / DAY_MS,
    width: 800,
    height: 600,
    rowHeight: 32
};

const buildTask = (id: string, startDate: number, dueDate: number, rowIndex: number): Task => ({
    id,
    subject: `Task ${id}`,
    projectId: 'p1',
    projectName: 'Project',
    displayOrder: rowIndex,
    startDate,
    dueDate,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex,
    hasChildren: false
});

describe('getPolylineMidpoint', () => {
    it('returns the midpoint along the route length', () => {
        expect(getPolylineMidpoint([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 }
        ])).toEqual({ x: 10, y: 0 });
    });
});

describe('distanceToPolyline', () => {
    it('returns a small distance for points close to the route', () => {
        const distance = distanceToPolyline({ x: 5, y: 3 }, [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 }
        ]);

        expect(distance).toBe(3);
    });
});

describe('normalizeRelationForRendering', () => {
    it('reverses follows relations into logical predecessor-to-successor order', () => {
        const tasks = [
            buildTask('1', 0, DAY_MS, 0),
            buildTask('2', DAY_MS * 4, DAY_MS * 5, 1)
        ];
        const context = buildRelationRenderContext(tasks, viewport, 2);

        expect(normalizeRelationForRendering({
            from: '1',
            to: '2',
            type: RelationType.Follows
        }, context)).toEqual({
            from: '2',
            to: '1',
            showArrow: true
        });
    });

    it('reverses blocked relations into logical blocker-to-blocked order', () => {
        const tasks = [
            buildTask('1', 0, DAY_MS, 0),
            buildTask('2', DAY_MS * 4, DAY_MS * 5, 1)
        ];
        const context = buildRelationRenderContext(tasks, viewport, 2);

        expect(normalizeRelationForRendering({
            from: '1',
            to: '2',
            type: RelationType.Blocked
        }, context)).toEqual({
            from: '2',
            to: '1',
            showArrow: true
        });
    });

    it('draws relates from the left task to the right task without an arrow', () => {
        const tasks = [
            buildTask('1', DAY_MS * 8, DAY_MS * 9, 0),
            buildTask('2', DAY_MS, DAY_MS * 2, 1)
        ];
        const context = buildRelationRenderContext(tasks, viewport, 2);

        expect(normalizeRelationForRendering({
            from: '1',
            to: '2',
            type: RelationType.Relates
        }, context)).toEqual({
            from: '2',
            to: '1',
            showArrow: false
        });
    });

    it('keeps raw order for relates when both tasks share the same center x', () => {
        const tasks = [
            buildTask('1', DAY_MS * 2, DAY_MS * 3, 0),
            buildTask('2', DAY_MS * 2, DAY_MS * 3, 1)
        ];
        const context = buildRelationRenderContext(tasks, viewport, 2);

        expect(normalizeRelationForRendering({
            from: '2',
            to: '1',
            type: RelationType.Relates
        }, context)).toEqual({
            from: '2',
            to: '1',
            showArrow: false
        });
    });
});

describe('buildRelationRoutePoints', () => {
    const datedTask = buildTask('1', 0, DAY_MS, 0);

    it.each([
        { name: 'both dates', dates: { startDate: 0, dueDate: DAY_MS } },
        { name: 'start only', dates: { startDate: 0, dueDate: undefined } },
        { name: 'due only', dates: { startDate: undefined, dueDate: DAY_MS } },
        { name: 'start with NaN due', dates: { startDate: 0, dueDate: NaN } },
        { name: 'due with infinite start', dates: { startDate: Infinity, dueDate: DAY_MS } }
    ])('routes either endpoint with $name using its existing task bounds', ({ dates }) => {
        const tasks = [{ ...datedTask, ...dates }, buildTask('2', DAY_MS * 4, DAY_MS * 5, 1)];
        const context = buildRelationRenderContext(tasks, viewport, 2);
        for (const [from, to] of [['1', '2'], ['2', '1']]) {
            const points = buildRelationRoutePoints({ from, to, type: RelationType.Precedes }, context, viewport);
            expect(points).not.toBeNull();
            expect(points!.length).toBeGreaterThanOrEqual(2);
            expect(points!.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
            const fromRect = context.rectById.get(from)!;
            const toRect = context.rectById.get(to)!;
            expect(points![0]).toEqual({ x: fromRect.x + fromRect.width, y: fromRect.y + fromRect.height / 2 });
            expect(points!.at(-1)).toEqual({ x: toRect.x, y: toRect.y + toRect.height / 2 });
        }
    });

    it.each([
        { startDate: undefined, dueDate: undefined },
        { startDate: NaN, dueDate: Infinity }
    ])('does not route an endpoint without a finite date: %o', (dates) => {
        const context = buildRelationRenderContext([
            { ...datedTask, ...dates },
            buildTask('2', DAY_MS * 4, DAY_MS * 5, 1)
        ], viewport, 2);
        for (const [from, to] of [['1', '2'], ['2', '1']]) {
            expect(buildRelationRoutePoints({ from, to, type: RelationType.Precedes }, context, viewport)).toBeNull();
        }
    });

    it.each([
        { forward: RelationType.Precedes, reverse: RelationType.Follows },
        { forward: RelationType.Blocks, reverse: RelationType.Blocked }
    ])('preserves $reverse direction between start-only and due-only tasks', ({ forward, reverse }) => {
        const context = buildRelationRenderContext([
            { ...datedTask, dueDate: undefined },
            { ...buildTask('2', DAY_MS * 4, DAY_MS * 5, 1), startDate: undefined }
        ], viewport, 2);
        const points = buildRelationRoutePoints({ from: '1', to: '2', type: forward }, context, viewport);
        expect(points).not.toBeNull();
        expect(buildRelationRoutePoints({ from: '2', to: '1', type: reverse }, context, viewport)).toEqual(points);
    });

    it.each([false, true])('routes relates using normalized left-to-right endpoints (single dates: %s)', (singleDates) => {
        const tasks = [
            buildTask('1', DAY_MS * 8, DAY_MS * 9, 0),
            buildTask('2', DAY_MS, DAY_MS * 2, 1)
        ];
        if (singleDates) {
            tasks[0].startDate = undefined;
            tasks[1].dueDate = undefined;
        }
        const context = buildRelationRenderContext(tasks, viewport, 2);
        const points = buildRelationRoutePoints({
            from: '1',
            to: '2',
            type: RelationType.Relates
        }, context, viewport);

        expect(points).toBeTruthy();
        if (!points) {
            throw new Error('Expected relation route points');
        }
        const leftRect = context.rectById.get('2')!;
        const rightRect = context.rectById.get('1')!;
        expect(points[0]).toEqual({ x: leftRect.x + leftRect.width, y: leftRect.y + leftRect.height / 2 });
        expect(points.at(-1)).toEqual({ x: rightRect.x, y: rightRect.y + rightRect.height / 2 });
        expect(normalizeRelationForRendering({ from: '1', to: '2', type: RelationType.Relates }, context))
            .toEqual({ from: '2', to: '1', showArrow: false });
    });
});
