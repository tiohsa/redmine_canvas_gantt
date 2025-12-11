import { useTaskStore } from '../stores/TaskStore';

export class InteractionEngine {
    private isDragging = false;
    private lastX = 0;
    private lastY = 0;
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.attachEvents();
    }

    private attachEvents() {
        this.container.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);
        this.container.addEventListener('wheel', this.handleWheel, { passive: false });
        this.container.addEventListener('contextmenu', this.handleContextMenu);
    }

    public detach() {
        this.container.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
        this.container.removeEventListener('wheel', this.handleWheel);
        this.container.removeEventListener('contextmenu', this.handleContextMenu);
    }

    private handleMouseDown = (e: MouseEvent) => {
        this.isDragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
    };

    private handleMouseMove = (e: MouseEvent) => {
        const { viewport, updateViewport, tasks, setHoveredTask } = useTaskStore.getState();

        // Hover logic
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Simple hit test (naive iteration)
        // In real app, use spatial index (RBush/Quadtree)
        const task = tasks.find(t => {
            // Re-calculate bounds (should be optimized/cached in LayoutEngine)
            const bounds = {
                x: (t.startDate - viewport.startDate) * viewport.scale - viewport.scrollX,
                y: t.rowIndex * viewport.rowHeight - viewport.scrollY,
                width: (t.dueDate - t.startDate) * viewport.scale,
                height: viewport.rowHeight
            };
            return x >= bounds.x && x <= bounds.x + bounds.width &&
                y >= bounds.y && y <= bounds.y + bounds.height;
        });

        setHoveredTask(task ? task.id : null);

        if (!this.isDragging) return;

        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;

        updateViewport({
            scrollX: Math.max(0, viewport.scrollX - dx),
            scrollY: Math.max(0, viewport.scrollY - dy)
        });
    };

    private handleMouseUp = () => {
        this.isDragging = false;
    };

    private handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        const { hoveredTaskId, setContextMenu } = useTaskStore.getState();
        if (hoveredTaskId) {
            setContextMenu({ x: e.clientX, y: e.clientY, taskId: hoveredTaskId });
        }
    };

    private handleWheel = (e: WheelEvent) => {
        if (e.ctrlKey) {
            // Zoom
            e.preventDefault();
            const { viewport, updateViewport } = useTaskStore.getState();
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            updateViewport({ scale: Math.max(0.01, viewport.scale * zoomFactor) });
        } else {
            // Scroll
            const { viewport, updateViewport } = useTaskStore.getState();
            updateViewport({
                scrollX: Math.max(0, viewport.scrollX + e.deltaX),
                scrollY: Math.max(0, viewport.scrollY + e.deltaY)
            });
        }
    };
}
