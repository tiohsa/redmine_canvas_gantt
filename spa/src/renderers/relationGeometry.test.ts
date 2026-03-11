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
    it('routes relates using normalized left-to-right endpoints', () => {
        const tasks = [
            buildTask('1', DAY_MS * 8, DAY_MS * 9, 0),
            buildTask('2', DAY_MS, DAY_MS * 2, 1)
        ];
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
        expect(points[0].x).toBeLessThan(points[points.length - 1].x);
    });
});
