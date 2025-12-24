import { describe, expect, it } from 'vitest';

import { GanttSvgExportService } from './GanttSvgExportService';
import type { LayoutRow, Relation, Task, Viewport } from '../types';

const createTask = (id: string, rowIndex: number): Task => ({
    id,
    subject: `Task ${id}`,
    ratioDone: 50,
    statusId: 1,
    rowIndex,
    hasChildren: false,
    lockVersion: 0,
    editable: false
});

const baseViewport: Viewport = {
    startDate: new Date('2024-01-01').getTime(),
    scrollX: 0,
    scrollY: 0,
    scale: 40 / (24 * 60 * 60 * 1000),
    width: 600,
    height: 400,
    rowHeight: 24
};

const meta = {
    projectLabel: 'Project A',
    generatedAt: '2024/01/02 12:00',
    dateRangeLabel: '2024/01/01 - 2024/02/01',
    zoomLabel: '日',
    filterSummary: 'Filter: none'
};

describe('GanttSvgExportService', () => {
    it('builds a single svg page with left and right panes', () => {
        const tasks: Task[] = [createTask('1', 0)];
        const layoutRows: LayoutRow[] = [{ type: 'task', taskId: '1', rowIndex: 0 }];

        const pages = GanttSvgExportService.buildSvgPages({
            tasks,
            layoutRows,
            relations: [],
            versions: [],
            viewport: baseViewport,
            zoomLevel: 2,
            columnWidths: { id: 72, subject: 200 },
            visibleColumns: ['id', 'subject'],
            sidebarWidth: 300,
            meta
        });

        expect(pages).toHaveLength(1);
        expect(pages[0].svg).toContain('id="left-pane"');
        expect(pages[0].svg).toContain('id="right-pane"');
        expect(pages[0].svg).toContain('<svg');
    });

    it('splits pages when rows exceed 500', () => {
        const tasks: Task[] = Array.from({ length: 501 }, (_, index) => createTask(String(index + 1), index));
        const layoutRows: LayoutRow[] = tasks.map((task) => ({ type: 'task', taskId: task.id, rowIndex: task.rowIndex }));

        const pages = GanttSvgExportService.buildSvgPages({
            tasks,
            layoutRows,
            relations: [],
            versions: [],
            viewport: baseViewport,
            zoomLevel: 2,
            columnWidths: { id: 72, subject: 200 },
            visibleColumns: ['id', 'subject'],
            sidebarWidth: 300,
            meta
        });

        expect(pages).toHaveLength(2);
        expect(pages[1].svg).toContain('Page 2 / 2');
    });

    it('skips dependency lines when zoom is not day', () => {
        const tasks: Task[] = [
            { ...createTask('1', 0), startDate: baseViewport.startDate, dueDate: baseViewport.startDate + 2 * 24 * 60 * 60 * 1000 },
            { ...createTask('2', 1), startDate: baseViewport.startDate + 3 * 24 * 60 * 60 * 1000, dueDate: baseViewport.startDate + 4 * 24 * 60 * 60 * 1000 }
        ];
        const layoutRows: LayoutRow[] = [
            { type: 'task', taskId: '1', rowIndex: 0 },
            { type: 'task', taskId: '2', rowIndex: 1 }
        ];
        const relations: Relation[] = [{ id: 'r1', from: '1', to: '2', type: 'precedes' }];

        const pages = GanttSvgExportService.buildSvgPages({
            tasks,
            layoutRows,
            relations,
            versions: [],
            viewport: baseViewport,
            zoomLevel: 1,
            columnWidths: { id: 72, subject: 200 },
            visibleColumns: ['id', 'subject'],
            sidebarWidth: 300,
            meta
        });

        expect(pages[0].svg).not.toContain('data-relation');
    });
});
