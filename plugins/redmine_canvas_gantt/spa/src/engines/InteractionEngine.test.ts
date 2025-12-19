import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractionEngine } from './InteractionEngine';
import { useTaskStore } from '../stores/TaskStore';
import { LayoutEngine } from './LayoutEngine';
import type { Relation, Task } from '../types';

vi.mock('../api/client', () => ({
    apiClient: {
        updateTask: vi.fn(),
        fetchData: vi.fn()
    }
}));

import { apiClient } from '../api/client';

const setViewport = (partial: Partial<ReturnType<typeof useTaskStore.getState>['viewport']>) => {
    useTaskStore.setState({
        allTasks: [],
        tasks: [],
        zoomLevel: 2,
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

const baseTask = (overrides: Partial<Task> = {}): Task => ({
    id: '1',
    subject: 'Task 1',
    projectId: 'p1',
    projectName: 'Project',
    displayOrder: 1,
    startDate: 0,
    dueDate: 10,
    ratioDone: 0,
    statusId: 1,
    lockVersion: 0,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

beforeEach(() => {
    vi.mocked(apiClient.updateTask).mockReset();
    vi.mocked(apiClient.fetchData).mockReset();
});

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

describe('InteractionEngine task updates', () => {
    it('依存関係があるタスク更新後にデータを再取得する', async () => {
        setViewport({ startDate: 0, scrollX: 0, scrollY: 0, scale: 1 });
        const container = createContainer();
        const engine = new InteractionEngine(container);

        const task1 = baseTask({ id: '1', rowIndex: 0 });
        const task2 = baseTask({ id: '2', rowIndex: 1, startDate: 20, dueDate: 30 });
        const relations: Relation[] = [{ id: 'r1', from: '1', to: '2', type: 'precedes' }];

        useTaskStore.setState({
            allTasks: [task1, task2],
            tasks: [task1, task2],
            relations,
            layoutRows: [],
            rowCount: 2,
            groupByProject: false,
            projectExpansion: {},
            taskExpansion: {},
            filterText: '',
            sortConfig: null
        });

        vi.mocked(apiClient.updateTask).mockResolvedValue({ status: 'ok', lockVersion: 1 });
        vi.mocked(apiClient.fetchData).mockResolvedValue({
            tasks: [task1, task2],
            relations,
            project: { id: 'p1', name: 'Project' },
            permissions: { editable: true, viewable: true }
        });

        const { viewport, zoomLevel } = useTaskStore.getState();
        const bounds = LayoutEngine.getTaskBounds(task1, viewport, 'hit', zoomLevel);
        container.dispatchEvent(new MouseEvent('mousedown', { clientX: bounds.x + 1, clientY: bounds.y + 1, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: bounds.x + 11, clientY: bounds.y + 1, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(apiClient.updateTask).toHaveBeenCalled();
        expect(apiClient.fetchData).toHaveBeenCalled();

        engine.detach();
        container.remove();
    });
});
