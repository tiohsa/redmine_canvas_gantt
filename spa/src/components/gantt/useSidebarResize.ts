import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { SIDEBAR_RESIZE_CURSOR } from '../../constants';
import { clampSidebarWidthToBounds, computeSidebarWidthBounds } from '../../utils/sidebarWidth';

type Params = {
    containerRef: RefObject<HTMLDivElement | null>;
    leftPaneVisible: boolean;
    sidebarWidth: number;
    setSidebarWidth: (width: number) => void;
    setSidebarResizing: (resizing: boolean) => void;
};

export const useSidebarResize = ({
    containerRef,
    leftPaneVisible,
    sidebarWidth,
    setSidebarWidth,
    setSidebarResizing
}: Params): { startResize: () => void } => {
    const isResizing = useRef(false);
    const bodyStyleRef = useRef<{ cursor: string; userSelect: string } | null>(null);

    const applyResizeBodyStyles = useCallback(() => {
        if (typeof document === 'undefined') return;
        if (!bodyStyleRef.current) {
            bodyStyleRef.current = {
                cursor: document.body.style.cursor,
                userSelect: document.body.style.userSelect
            };
        }
        document.body.style.cursor = SIDEBAR_RESIZE_CURSOR;
        document.body.style.userSelect = 'none';
    }, []);

    const restoreBodyStyles = useCallback(() => {
        if (typeof document === 'undefined') return;
        if (bodyStyleRef.current) {
            document.body.style.cursor = bodyStyleRef.current.cursor;
            document.body.style.userSelect = bodyStyleRef.current.userSelect;
            bodyStyleRef.current = null;
            return;
        }
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    const getSidebarWidthBounds = useCallback(() => {
        const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
        return computeSidebarWidthBounds(containerWidth);
    }, [containerRef]);

    const getClampedSidebarWidth = useCallback((width: number): number | null => {
        const bounds = getSidebarWidthBounds();
        if (!bounds) return null;
        return clampSidebarWidthToBounds(width, bounds);
    }, [getSidebarWidthBounds]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const containerRect = containerRef.current?.getBoundingClientRect();
            const containerLeft = containerRect?.left ?? 0;
            const newWidth = getClampedSidebarWidth(e.clientX - containerLeft);
            if (newWidth === null) return;
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (!isResizing.current) return;
            isResizing.current = false;
            setSidebarResizing(false);
            restoreBodyStyles();
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            setSidebarResizing(false);
            restoreBodyStyles();
        };
    }, [containerRef, getClampedSidebarWidth, restoreBodyStyles, setSidebarResizing, setSidebarWidth]);

    useEffect(() => {
        if (!leftPaneVisible) return;

        const clampSidebarWidth = () => {
            const clampedWidth = getClampedSidebarWidth(sidebarWidth);
            if (clampedWidth === null) return;
            if (clampedWidth !== sidebarWidth) {
                setSidebarWidth(clampedWidth);
            }
        };

        clampSidebarWidth();
        window.addEventListener('resize', clampSidebarWidth);
        return () => window.removeEventListener('resize', clampSidebarWidth);
    }, [getClampedSidebarWidth, leftPaneVisible, setSidebarWidth, sidebarWidth]);

    const startResize = useCallback(() => {
        isResizing.current = true;
        setSidebarResizing(true);
        applyResizeBodyStyles();
    }, [applyResizeBodyStyles, setSidebarResizing]);

    return { startResize };
};
