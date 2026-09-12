import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

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
    const lastCanonicalClampRef = useRef<{ requested: number; clamped: number } | null>(null);
    const lastSyncInputRef = useRef<{ requested: number; clientHeight: number; scrollHeight: number } | null>(null);

    useLayoutEffect(() => {
        const element = scrollRef.current;
        if (!element) return;

        const nextScrollTop = clampWorkloadScrollTop(scrollTop, element);
        const wasClamped = scrollTop !== nextScrollTop;
        const previousSyncInput = lastSyncInputRef.current;
        const syncInput = {
            requested: scrollTop,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight
        };
        if (
            previousSyncInput &&
            previousSyncInput.requested === syncInput.requested &&
            previousSyncInput.clientHeight === syncInput.clientHeight &&
            previousSyncInput.scrollHeight === syncInput.scrollHeight
        ) {
            return;
        }
        lastSyncInputRef.current = syncInput;

        const expectedExternalScrollTop = expectedExternalScrollTopRef.current;
        if (
            expectedExternalScrollTop !== null &&
            Math.abs(expectedExternalScrollTop - nextScrollTop) > WORKLOAD_SCROLL_SYNC_TOLERANCE_PX
        ) {
            const frameId = externalScrollFrameRef.current;
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
            }
            externalScrollFrameRef.current = null;
            expectedExternalScrollTopRef.current = null;
        }

        const scheduleExpectedExternalScroll = () => {
            if (externalScrollFrameRef.current !== null) {
                window.cancelAnimationFrame(externalScrollFrameRef.current);
            }

            expectedExternalScrollTopRef.current = nextScrollTop;
            const frameId = window.requestAnimationFrame(() => {
                if (externalScrollFrameRef.current !== frameId) return;
                expectedExternalScrollTopRef.current = null;
                externalScrollFrameRef.current = null;
            });
            externalScrollFrameRef.current = frameId;
        };

        if (Math.abs(element.scrollTop - nextScrollTop) > WORKLOAD_SCROLL_SYNC_TOLERANCE_PX) {
            scheduleExpectedExternalScroll();
            element.scrollTop = nextScrollTop;
        } else if (wasClamped && expectedExternalScrollTopRef.current === null) {
            // The browser may have already clamped the DOM position before this effect runs.
            scheduleExpectedExternalScroll();
        }

        if (!wasClamped) {
            lastCanonicalClampRef.current = null;
            return;
        }

        const lastCanonicalClamp = lastCanonicalClampRef.current;
        if (
            onScroll &&
            (!lastCanonicalClamp ||
                lastCanonicalClamp.requested !== scrollTop ||
                lastCanonicalClamp.clamped !== nextScrollTop)
        ) {
            lastCanonicalClampRef.current = {
                requested: scrollTop,
                clamped: nextScrollTop
            };
            onScroll(nextScrollTop);
        }
    });

    useEffect(() => () => {
        if (externalScrollFrameRef.current === null) return;
        window.cancelAnimationFrame(externalScrollFrameRef.current);
        externalScrollFrameRef.current = null;
        expectedExternalScrollTopRef.current = null;
    }, []);

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
