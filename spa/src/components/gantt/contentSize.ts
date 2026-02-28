import type { Viewport } from '../../types';

type Size = { width: number; height: number };

type ComputeContentSizesParams = {
    viewport: Viewport;
    rowCount: number;
    tasksMaxDue: number | null;
    oneDayMs: number;
    bottomPaddingPx: number;
    maxScrollAreaPx: number;
    paddingDays?: number;
};

type ScrollMapParams = {
    viewportWidth: number;
    viewportHeight: number;
    realContentSize: Size;
    scrollContentSize: Size;
};

const safeScale = (scale: number) => scale || 0.00000001;

const computeRealRangeEnd = (
    viewport: Viewport,
    tasksMaxDue: number | null,
    oneDayMs: number,
    paddingDays: number
): number => {
    const scale = safeScale(viewport.scale);
    const visibleMs = viewport.width / scale;
    const visibleEnd = viewport.startDate + visibleMs;
    const paddingMs = paddingDays * oneDayMs;
    return Math.max(tasksMaxDue ?? visibleEnd, visibleEnd) + paddingMs;
};

export const computeContentSizes = ({
    viewport,
    rowCount,
    tasksMaxDue,
    oneDayMs,
    bottomPaddingPx,
    maxScrollAreaPx,
    paddingDays = 60
}: ComputeContentSizesParams): { realContentSize: Size; scrollContentSize: Size } => {
    const scale = safeScale(viewport.scale);
    const rangeEnd = computeRealRangeEnd(viewport, tasksMaxDue, oneDayMs, paddingDays);

    const realWidth = Math.max(viewport.width, Math.ceil((rangeEnd - viewport.startDate) * scale));
    const realHeight = Math.max(viewport.height, Math.ceil(rowCount * viewport.rowHeight) + bottomPaddingPx);

    const scrollWidth = Math.max(viewport.width, Math.min(realWidth, maxScrollAreaPx));
    const scrollHeight = Math.max(viewport.height, Math.min(realHeight, maxScrollAreaPx));

    return {
        realContentSize: { width: realWidth, height: realHeight },
        scrollContentSize: { width: scrollWidth, height: scrollHeight }
    };
};

export const mapDomScrollToViewport = (
    scrollLeft: number,
    scrollTop: number,
    params: ScrollMapParams
): { x: number; y: number } => {
    const virtualAvailableX = Math.max(0, params.scrollContentSize.width - params.viewportWidth);
    const virtualAvailableY = Math.max(0, params.scrollContentSize.height - params.viewportHeight);
    const realAvailableX = Math.max(0, params.realContentSize.width - params.viewportWidth);
    const realAvailableY = Math.max(0, params.realContentSize.height - params.viewportHeight);

    const mappedX = virtualAvailableX === 0 || realAvailableX === 0
        ? 0
        : Math.round((scrollLeft / virtualAvailableX) * realAvailableX);
    const mappedY = virtualAvailableY === 0 || realAvailableY === 0
        ? 0
        : Math.round((scrollTop / virtualAvailableY) * realAvailableY);

    return {
        x: Math.max(0, Math.min(realAvailableX, mappedX)),
        y: Math.max(0, Math.min(realAvailableY, mappedY))
    };
};

export const mapViewportToDomScroll = (
    scrollX: number,
    scrollY: number,
    params: ScrollMapParams
): { left: number; top: number } => {
    const virtualAvailableX = Math.max(0, params.scrollContentSize.width - params.viewportWidth);
    const virtualAvailableY = Math.max(0, params.scrollContentSize.height - params.viewportHeight);
    const realAvailableX = Math.max(0, params.realContentSize.width - params.viewportWidth);
    const realAvailableY = Math.max(0, params.realContentSize.height - params.viewportHeight);

    const left = realAvailableX === 0 || virtualAvailableX === 0
        ? 0
        : Math.round((scrollX / realAvailableX) * virtualAvailableX);
    const top = realAvailableY === 0 || virtualAvailableY === 0
        ? 0
        : Math.round((scrollY / realAvailableY) * virtualAvailableY);

    return { left, top };
};
