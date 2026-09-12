import { useEffect, useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    clampWorkloadScrollTop,
    useWorkloadScrollSync
} from './workloadScrollSync';

const setScrollMetrics = (element: HTMLElement, clientHeight: number, scrollHeight: number, scrollTop: number) => {
    Object.defineProperties(element, {
        clientHeight: { configurable: true, value: clientHeight },
        scrollHeight: { configurable: true, value: scrollHeight },
        scrollTop: { configurable: true, writable: true, value: scrollTop }
    });
};

const ScrollPane = ({
    testId,
    scrollTop,
    onScroll
}: {
    testId: string;
    scrollTop: number;
    onScroll: (scrollTop: number) => void;
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const handleScroll = useWorkloadScrollSync(scrollRef, scrollTop, onScroll);

    return <div ref={scrollRef} data-testid={testId} onScroll={handleScroll} />;
};

describe('workload scroll synchronization', () => {
    it('clamps requested scroll positions to the actual scrollable range', () => {
        const metrics = { clientHeight: 199, scrollHeight: 320 } as HTMLDivElement;

        expect(clampWorkloadScrollTop(-10, metrics)).toBe(0);
        expect(clampWorkloadScrollTop(60, metrics)).toBe(60);
        expect(clampWorkloadScrollTop(999, metrics)).toBe(121);
        expect(clampWorkloadScrollTop(999, { clientHeight: 400, scrollHeight: 320 } as HTMLDivElement)).toBe(0);
    });

    it.each([
        {
            scenario: 'content shrinks',
            initialMetrics: { clientHeight: 100, scrollHeight: 1100, scrollTop: 0 },
            reducedMetrics: { clientHeight: 100, scrollHeight: 201, scrollTop: 101 },
            expectedScrollTop: 101
        },
        {
            scenario: 'pane expands',
            initialMetrics: { clientHeight: 100, scrollHeight: 1100, scrollTop: 0 },
            reducedMetrics: { clientHeight: 999, scrollHeight: 1100, scrollTop: 101 },
            expectedScrollTop: 101
        }
    ])('normalizes the parent when the max scroll decreases because $scenario', ({ initialMetrics, reducedMetrics, expectedScrollTop }) => {
        const calls: number[] = [];
        const Harness = ({ requestedScrollTop, layoutRevision }: { requestedScrollTop: number; layoutRevision: number }) => {
            const [parentScrollTop, setParentScrollTop] = useState(requestedScrollTop);
            useEffect(() => {
                setParentScrollTop(requestedScrollTop);
            }, [requestedScrollTop]);
            return (
                <div data-testid="harness" data-layout-revision={layoutRevision} data-parent-scroll-top={parentScrollTop}>
                    <ScrollPane
                        testId="pane"
                        scrollTop={parentScrollTop}
                        onScroll={(nextScrollTop) => {
                            calls.push(nextScrollTop);
                            setParentScrollTop(nextScrollTop);
                        }}
                    />
                </div>
            );
        };

        const { rerender } = render(<Harness requestedScrollTop={0} layoutRevision={0} />);
        const pane = screen.getByTestId('pane');

        setScrollMetrics(pane, initialMetrics.clientHeight, initialMetrics.scrollHeight, initialMetrics.scrollTop);
        act(() => rerender(<Harness requestedScrollTop={999} layoutRevision={0} />));

        setScrollMetrics(pane, reducedMetrics.clientHeight, reducedMetrics.scrollHeight, reducedMetrics.scrollTop);
        act(() => rerender(<Harness requestedScrollTop={999} layoutRevision={1} />));

        expect(pane.scrollTop).toBe(expectedScrollTop);
        expect(screen.getByTestId('harness')).toHaveAttribute('data-parent-scroll-top', String(expectedScrollTop));
        expect(calls).toEqual([expectedScrollTop]);

        act(() => rerender(<Harness requestedScrollTop={999} layoutRevision={2} />));

        expect(calls).toEqual([expectedScrollTop]);

        fireEvent.scroll(pane);

        expect(calls).toEqual([expectedScrollTop]);
    });

    it('does not oscillate when the two panes have a one pixel max scroll difference', () => {
        const calls: Array<{ source: string; scrollTop: number }> = [];
        const Harness = () => {
            const [scrollTop, setScrollTop] = useState(0);
            return (
                <>
                    <ScrollPane
                        testId="sidebar"
                        scrollTop={scrollTop}
                        onScroll={(nextScrollTop) => {
                            calls.push({ source: 'sidebar', scrollTop: nextScrollTop });
                            setScrollTop(nextScrollTop);
                        }}
                    />
                    <ScrollPane
                        testId="canvas"
                        scrollTop={scrollTop}
                        onScroll={(nextScrollTop) => {
                            calls.push({ source: 'canvas', scrollTop: nextScrollTop });
                            setScrollTop(nextScrollTop);
                        }}
                    />
                </>
            );
        };

        render(<Harness />);
        const sidebar = screen.getByTestId('sidebar');
        const canvas = screen.getByTestId('canvas');
        setScrollMetrics(sidebar, 100, 201, 0);
        setScrollMetrics(canvas, 100, 200, 0);

        act(() => {
            sidebar.scrollTop = 101;
            fireEvent.scroll(sidebar);
        });

        expect(canvas.scrollTop).toBe(100);
        expect(calls).toEqual([
            { source: 'sidebar', scrollTop: 101 },
            { source: 'canvas', scrollTop: 100 }
        ]);

        act(() => {
            fireEvent.scroll(canvas);
        });

        expect(calls).toEqual([
            { source: 'sidebar', scrollTop: 101 },
            { source: 'canvas', scrollTop: 100 }
        ]);
    });
});
