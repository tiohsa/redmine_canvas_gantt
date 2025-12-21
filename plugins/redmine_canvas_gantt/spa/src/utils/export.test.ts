import { describe, expect, it } from 'vitest';

import type { Task } from '../types';
import { exportUtils, createExcelHtml } from './export';

const baseTask: Task = {
    id: '100',
    subject: 'Sample Task',
    startDate: Date.UTC(2024, 0, 1),
    dueDate: Date.UTC(2024, 0, 5),
    ratioDone: 40,
    statusId: 1,
    lockVersion: 1,
    editable: true,
    rowIndex: 0,
    hasChildren: false
};

describe('exportUtils', () => {
    it('visibleColumnsに応じてエクスポート列をフィルタする', () => {
        const columns = exportUtils.buildTaskExportColumns(['id'], () => undefined);
        expect(columns.map((col) => col.key)).toEqual(['id', 'subject']);
    });

    it('Excel用HTMLにヘッダと行を含める', () => {
        const columns = exportUtils.buildTaskExportColumns(['id'], (key) => {
            if (key === 'field_subject') return '件名';
            return undefined;
        });
        const html = createExcelHtml(columns, [baseTask]);
        expect(html).toContain('<table');
        expect(html).toContain('<th>ID</th>');
        expect(html).toContain('<th>件名</th>');
        expect(html).toContain('<td>100</td>');
        expect(html).toContain('<td>Sample Task</td>');
    });

    it('SVGマークアップを組み立てる', () => {
        const svg = exportUtils.createSvgMarkup('data:image/png;base64,xxx', 320, 200);
        expect(svg).toContain('<svg');
        expect(svg).toContain('width="320"');
        expect(svg).toContain('height="200"');
        expect(svg).toContain('<image');
    });
});
