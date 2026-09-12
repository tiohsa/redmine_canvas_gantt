import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

export const WORKLOAD_SCROLL_SYNC_TOLERANCE_PX = 1;

type ScrollMetrics = Pick<HTMLDivElement, 'clientHeight' | 'scrollHeight'>;

export const getWorkloadMaxScrollTop = ({ clientHeight, scrollHeight }: ScrollMetrics): number => (
    Math.max(0, scrollHeight - clientHeight)
);

export const clampWorkloadScrollTop = (requestedScrollTop: number, metrics: ScrollMetrics): number => (
    Math.min(
        Math.max(0, requestedScrollTop),
        getWorkloadMaxScrollTop(metrics)
    )
);

export const useWorkloadScrollSync = (
    scrollRef: RefObject<HTMLDivElement | null>,
    scrollTop: number,
    onScroll?: (scrollTop: number) => void
): ((event: React.UIEvent<HTMLDivElement>) => void) => {
    const expectedExternalScrollTopRef = useRef<number | null>(null);
    const externalScrollFrameRef = useRef<number | null>(null);

    useLayoutEffect(() => {
        const element = scrollRef.current;
        if (!element) return;

        const nextScrollTop = clampWorkloadScrollTop(scrollTop, element);
        if (Math.abs(element.scrollTop - nextScrollTop) <= WORKLOAD_SCROLL_SYNC_TOLERANCE_PX) {
            return;
        }

        if (externalScrollFrameRef.current !== null) {
            window.cancelAnimationFrame(externalScrollFrameRef.current);
        }

        expectedExternalScrollTopRef.current = nextScrollTop;
        element.scrollTop = nextScrollTop;

        const frameId = window.requestAnimationFrame(() => {
            if (externalScrollFrameRef.current !== frameId) return;
            expectedExternalScrollTopRef.current = null;
            externalScrollFrameRef.current = null;
        });
        externalScrollFrameRef.current = frameId;

        return () => {
            if (externalScrollFrameRef.current !== frameId) return;
            window.cancelAnimationFrame(frameId);
            expectedExternalScrollTopRef.current = null;
            externalScrollFrameRef.current = null;
        };
    }, [scrollRef, scrollTop]);

    return useCallback((event: React.UIEvent<HTMLDivElement>) => {
        const nextScrollTop = event.currentTarget.scrollTop;
        const expectedScrollTop = expectedExternalScrollTopRef.current;
        if (
            expectedScrollTop !== null &&
            Math.abs(nextScrollTop - expectedScrollTop) <= WORKLOAD_SCROLL_SYNC_TOLERANCE_PX
        ) {
            expectedExternalScrollTopRef.current = null;
            return;
        }

        expectedExternalScrollTopRef.current = null;
        onScroll?.(nextScrollTop);
    }, [onScroll]);
};
