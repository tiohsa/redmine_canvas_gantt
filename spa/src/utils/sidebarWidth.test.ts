import { describe, expect, it } from 'vitest';
import { SIDEBAR_MIN_WIDTH } from '../constants';
import { clampSidebarWidthToBounds, computeSidebarWidthBounds } from './sidebarWidth';

describe('computeSidebarWidthBounds', () => {
    it('コンテナ幅が未確定なら null を返す', () => {
        expect(computeSidebarWidthBounds(0)).toBeNull();
    });

    it('最大幅を比率と右ペイン最小幅の両方で制限する', () => {
        expect(computeSidebarWidthBounds(1000)).toEqual({
            min: SIDEBAR_MIN_WIDTH,
            max: 674
        });
    });

    it('大きいコンテナでは比率上限が有効になる', () => {
        expect(computeSidebarWidthBounds(3000)).toEqual({
            min: SIDEBAR_MIN_WIDTH,
            max: 2400
        });
    });

    it('小さいコンテナでも最小幅未満にはしない', () => {
        expect(computeSidebarWidthBounds(300)).toEqual({
            min: SIDEBAR_MIN_WIDTH,
            max: SIDEBAR_MIN_WIDTH
        });
    });
});

describe('clampSidebarWidthToBounds', () => {
    const bounds = { min: 200, max: 674 };

    it('範囲内の値はそのまま返す', () => {
        expect(clampSidebarWidthToBounds(320, bounds)).toBe(320);
    });

    it('最小幅未満は最小幅に丸める', () => {
        expect(clampSidebarWidthToBounds(100, bounds)).toBe(200);
    });

    it('最大幅超過は最大幅に丸める', () => {
        expect(clampSidebarWidthToBounds(800, bounds)).toBe(674);
    });
});
