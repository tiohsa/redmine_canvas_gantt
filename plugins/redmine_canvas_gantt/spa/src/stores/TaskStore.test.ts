import { describe, expect, it } from 'vitest';
import { useTaskStore } from './TaskStore';

describe('TaskStore viewport clamping', () => {
    it('updateViewport は scrollY を rowCount に合わせてクランプする', () => {
        useTaskStore.setState({
            rowCount: 10,
            viewport: {
                startDate: 0,
                scrollX: 0,
                scrollY: 0,
                scale: 1,
                width: 800,
                height: 64,
                rowHeight: 32
            }
        });

        // totalHeight=320, maxScrollY=256
        useTaskStore.getState().updateViewport({ scrollY: 9999 });
        expect(useTaskStore.getState().viewport.scrollY).toBe(256);

        useTaskStore.getState().updateViewport({ scrollY: -10 });
        expect(useTaskStore.getState().viewport.scrollY).toBe(0);
    });
});

