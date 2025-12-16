import { describe, expect, it } from 'vitest';
import { InteractionEngine } from './InteractionEngine';
import { useTaskStore } from '../stores/TaskStore';

const setViewport = (partial: Partial<ReturnType<typeof useTaskStore.getState>['viewport']>) => {
    useTaskStore.setState({
        allTasks: [],
        tasks: [],
        viewport: {
            startDate: 0,
            scrollX: 0,
            scrollY: 0,
            scale: 1,
            width: 800,
            height: 600,
            rowHeight: 32,
            ...partial
        }
    });
};

const createContainer = () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () =>
        ({
            left: 0,
            top: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            toJSON: () => ({})
        }) as unknown as DOMRect;
    document.body.appendChild(container);
    return container;
};

describe('InteractionEngine viewport panning', () => {
    it('ドラッグで左端(過去)へオーバースクロールしたら startDate をシフトする', () => {
        setViewport({ startDate: 1000, scrollX: 0, scale: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        container.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 100, bubbles: true })); // dx=+50

        const { viewport } = useTaskStore.getState();
        expect(viewport.scrollX).toBe(0);
        expect(viewport.startDate).toBe(950);

        engine.detach();
        container.remove();
    });

    it('ホイールで左(過去)へスクロールしたら startDate をシフトする', () => {
        setViewport({ startDate: 1000, scrollX: 10, scale: 2 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const e = new WheelEvent('wheel', { deltaX: -30, deltaY: 0, bubbles: true, cancelable: true }); // nextScrollX=-20
        const result = container.dispatchEvent(e);
        expect(result).toBe(false);
        expect(e.defaultPrevented).toBe(true);

        const { viewport } = useTaskStore.getState();
        expect(viewport.scrollX).toBe(0);
        expect(viewport.startDate).toBe(990);

        engine.detach();
        container.remove();
    });

    it('ホイールスクロールはデフォルト動作を抑止する（スクロールバーと二重に動かさない）', () => {
        setViewport({ startDate: 0, scrollX: 0, scrollY: 0, scale: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const e = new WheelEvent('wheel', { deltaX: 0, deltaY: 10, bubbles: true, cancelable: true });
        const result = container.dispatchEvent(e);
        expect(result).toBe(false);
        expect(e.defaultPrevented).toBe(true);

        engine.detach();
        container.remove();
    });
});
