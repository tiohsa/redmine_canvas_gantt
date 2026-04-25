import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCanvasDpr, resizeCanvasForDpr, snapTextPosition, snapLinePosition } from './canvasDpr';

describe('canvasDpr utility', () => {
    let originalDevicePixelRatio: number;

    beforeEach(() => {
        originalDevicePixelRatio = window.devicePixelRatio;
    });

    afterEach(() => {
        Object.defineProperty(window, 'devicePixelRatio', {
            value: originalDevicePixelRatio,
            writable: true,
            configurable: true,
        });
    });

    const setDpr = (value: number) => {
        Object.defineProperty(window, 'devicePixelRatio', {
            value,
            writable: true,
            configurable: true,
        });
    };

    describe('getCanvasDpr', () => {
        it('should return window.devicePixelRatio if it is defined', () => {
            setDpr(2);
            expect(getCanvasDpr()).toBe(2);
        });

        it('should return 1 if window.devicePixelRatio is not defined', () => {
            setDpr(undefined as any);
            expect(getCanvasDpr()).toBe(1);
        });
    });

    describe('resizeCanvasForDpr', () => {
        it('should properly size the canvas and set transform for dpr = 2', () => {
            setDpr(2);
            const canvas = document.createElement('canvas');
            const ctx = {
                setTransform: vi.fn(),
            } as unknown as CanvasRenderingContext2D;

            resizeCanvasForDpr(canvas, ctx, 100, 50);

            expect(canvas.width).toBe(200);
            expect(canvas.height).toBe(100);
            expect(canvas.style.width).toBe('100px');
            expect(canvas.style.height).toBe('50px');
            expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
        });

        it('should properly size the canvas and set transform for fractional dpr', () => {
            setDpr(1.25);
            const canvas = document.createElement('canvas');
            const ctx = {
                setTransform: vi.fn(),
            } as unknown as CanvasRenderingContext2D;

            resizeCanvasForDpr(canvas, ctx, 100, 50);

            expect(canvas.width).toBe(125);
            expect(canvas.height).toBe(62);
            expect(canvas.style.width).toBe('100px');
            expect(canvas.style.height).toBe('50px');
            expect(ctx.setTransform).toHaveBeenCalledWith(1.25, 0, 0, 1.25, 0, 0);
        });

        it('should not setTransform if canvas buffer size is already correct', () => {
            setDpr(2);
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 100;
            const ctx = {
                setTransform: vi.fn(),
            } as unknown as CanvasRenderingContext2D;

            resizeCanvasForDpr(canvas, ctx, 100, 50);

            expect(canvas.width).toBe(200);
            expect(canvas.height).toBe(100);
            expect(ctx.setTransform).not.toHaveBeenCalled();
        });

        it('should early return if width or height is <= 0', () => {
            const canvas = document.createElement('canvas');
            const ctx = {
                setTransform: vi.fn(),
            } as unknown as CanvasRenderingContext2D;

            resizeCanvasForDpr(canvas, ctx, 0, 50);
            expect(canvas.width).toBe(300); // default canvas width
            expect(ctx.setTransform).not.toHaveBeenCalled();
        });
    });

    describe('snapTextPosition', () => {
        it('should round to nearest integer', () => {
            expect(snapTextPosition(1.2)).toBe(1);
            expect(snapTextPosition(1.5)).toBe(2);
            expect(snapTextPosition(1.8)).toBe(2);
        });
    });

    describe('snapLinePosition', () => {
        it('should floor and add 0.5', () => {
            expect(snapLinePosition(1.2)).toBe(1.5);
            expect(snapLinePosition(1.5)).toBe(1.5);
            expect(snapLinePosition(1.8)).toBe(1.5);
            expect(snapLinePosition(2)).toBe(2.5);
        });
    });
});
