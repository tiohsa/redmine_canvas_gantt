import { describe, expect, it } from 'vitest';
import { routeDependencyFS, segmentIntersectsRect } from './dependencyRouting';

describe('segmentIntersectsRect', () => {
    it('returns true when a segment crosses the rect', () => {
        const rect = { x: 10, y: 10, width: 20, height: 10 };
        const from = { x: 0, y: 15 };
        const to = { x: 40, y: 15 };

        expect(segmentIntersectsRect(from, to, rect)).toBe(true);
    });

    it('returns false when a segment is outside the rect', () => {
        const rect = { x: 10, y: 10, width: 20, height: 10 };
        const from = { x: 0, y: 0 };
        const to = { x: 40, y: 0 };

        expect(segmentIntersectsRect(from, to, rect)).toBe(false);
    });
});

describe('routeDependencyFS', () => {
    it('returns the basic orthogonal route when there are no obstacles', () => {
        const fromRect = { x: 0, y: 0, width: 20, height: 10 };
        const toRect = { x: 120, y: 0, width: 20, height: 10 };
        const viewport = { scrollY: 0, height: 200 };
        const points = routeDependencyFS(fromRect, toRect, [], viewport, {
            outset: 20,
            inset: 10,
            step: 20,
            maxShift: 3
        });

        expect(points).toHaveLength(5);
        expect(points[0].x).toBe(fromRect.x + fromRect.width);
        expect(points[points.length - 1].x).toBe(toRect.x);
    });

    it('shifts the mid route to avoid obstacles', () => {
        const fromRect = { x: 0, y: 0, width: 20, height: 10 };
        const toRect = { x: 120, y: 40, width: 20, height: 10 };
        const obstacle = { x: 40, y: 42, width: 60, height: 6 };
        const viewport = { scrollY: 0, height: 200 };

        const points = routeDependencyFS(fromRect, toRect, [obstacle], viewport, {
            outset: 20,
            inset: 10,
            step: 20,
            maxShift: 2
        });

        expect(points[2].y).not.toBe(toRect.y + toRect.height / 2);
        expect(points.some((point, index) => {
            if (index === points.length - 1) return false;
            return segmentIntersectsRect(point, points[index + 1], obstacle);
        })).toBe(false);
    });
});
