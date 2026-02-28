import { useEffect } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { Viewport } from '../../types';
import { mapDomScrollToViewport, mapViewportToDomScroll } from './contentSize';

type Size = { width: number; height: number };

type Params = {
    scrollPaneRef: RefObject<HTMLDivElement | null>;
    isSyncingScrollRef: MutableRefObject<boolean>;
    isSidebarResizing: boolean;
    viewport: Viewport;
    scrollContentSize: Size;
    realContentSize: Size;
    updateViewport: (updates: Partial<Viewport>) => void;
};

export const useScrollSync = ({
    scrollPaneRef,
    isSyncingScrollRef,
    isSidebarResizing,
    viewport,
    scrollContentSize,
    realContentSize,
    updateViewport
}: Params): void => {
    useEffect(() => {
        const el = scrollPaneRef.current;
        if (!el) return;

        const onScroll = () => {
            if (isSyncingScrollRef.current || isSidebarResizing) return;
            const mapped = mapDomScrollToViewport(el.scrollLeft, el.scrollTop, {
                viewportWidth: viewport.width,
                viewportHeight: viewport.height,
                scrollContentSize,
                realContentSize
            });

            updateViewport({
                scrollX: mapped.x,
                scrollY: mapped.y
            });
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            el.removeEventListener('scroll', onScroll);
        };
    }, [isSidebarResizing, isSyncingScrollRef, realContentSize, scrollContentSize, scrollPaneRef, updateViewport, viewport.height, viewport.width]);

    useEffect(() => {
        const el = scrollPaneRef.current;
        if (!el) return;
        if (isSidebarResizing) return;

        const mapped = mapViewportToDomScroll(viewport.scrollX, viewport.scrollY, {
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            scrollContentSize,
            realContentSize
        });

        isSyncingScrollRef.current = true;
        if (el.scrollLeft !== mapped.left) el.scrollLeft = mapped.left;
        if (el.scrollTop !== mapped.top) el.scrollTop = mapped.top;
        requestAnimationFrame(() => {
            isSyncingScrollRef.current = false;
        });
    }, [isSidebarResizing, isSyncingScrollRef, realContentSize, scrollContentSize, scrollPaneRef, viewport.height, viewport.scrollX, viewport.scrollY, viewport.width]);
};
