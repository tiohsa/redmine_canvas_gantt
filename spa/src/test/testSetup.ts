import { vi } from 'vitest';
import { useBaselineStore } from '../stores/BaselineStore';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';

export const resetCanvasGanttTestState = () => {
    window.localStorage.clear();
    window.RedmineCanvasGantt = {
        projectId: 1,
        projectPath: '/projects/ecookbook',
        issueListPath: '/projects/ecookbook/issues',
        newIssuePath: '/projects/ecookbook/issues/new',
        canvasGanttPath: '/projects/ecookbook/canvas_gantt',
        apiBase: '',
        redmineBase: '',
        authToken: '',
        apiKey: '',
        nonWorkingWeekDays: [],
        i18n: {},
        settings: {
            ...(window.RedmineCanvasGantt?.settings ?? {})
        }
    };

    useTaskStore.setState(useTaskStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useBaselineStore.setState(useBaselineStore.getInitialState(), true);
};

// Mock HTMLCanvasElement for JSDOM
if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray() })),
        putImageData: vi.fn(),
        createImageData: vi.fn(),
        setTransform: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        stroke: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        rotate: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        measureText: vi.fn(() => ({ width: 0 })),
        transform: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
