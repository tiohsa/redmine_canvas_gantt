import {
    SIDEBAR_MAX_WIDTH_RATIO,
    SIDEBAR_MIN_WIDTH,
    SIDEBAR_RESIZE_HANDLE_TOTAL_WIDTH,
    SIDEBAR_RIGHT_PANE_MIN_WIDTH
} from '../constants';

export type SidebarWidthBounds = { min: number; max: number };

export const computeSidebarWidthBounds = (containerWidth: number): SidebarWidthBounds | null => {
    if (containerWidth <= 0) return null;
    const maxByRatio = Math.floor(containerWidth * SIDEBAR_MAX_WIDTH_RATIO);
    const maxByRemainingRightPane = Math.floor(
        containerWidth - SIDEBAR_RESIZE_HANDLE_TOTAL_WIDTH - SIDEBAR_RIGHT_PANE_MIN_WIDTH
    );
    const max = Math.min(maxByRatio, maxByRemainingRightPane);

    return {
        min: SIDEBAR_MIN_WIDTH,
        max: Math.max(SIDEBAR_MIN_WIDTH, max)
    };
};

export const clampSidebarWidthToBounds = (width: number, bounds: SidebarWidthBounds): number => {
    return Math.max(bounds.min, Math.min(bounds.max, width));
};
