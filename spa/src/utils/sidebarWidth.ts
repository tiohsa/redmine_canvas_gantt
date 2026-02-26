import { SIDEBAR_MAX_WIDTH_RATIO, SIDEBAR_MIN_WIDTH } from '../constants';

export type SidebarWidthBounds = { min: number; max: number };

export const computeSidebarWidthBounds = (containerWidth: number): SidebarWidthBounds | null => {
    if (containerWidth <= 0) return null;

    return {
        min: SIDEBAR_MIN_WIDTH,
        max: Math.max(SIDEBAR_MIN_WIDTH, Math.floor(containerWidth * SIDEBAR_MAX_WIDTH_RATIO))
    };
};

export const clampSidebarWidthToBounds = (width: number, bounds: SidebarWidthBounds): number => {
    return Math.max(bounds.min, Math.min(bounds.max, width));
};

