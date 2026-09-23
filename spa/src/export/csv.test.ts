import { describe, expect, it } from 'vitest';
import { buildTasksCsv } from './csv';
import type { Task } from '../types';
import type { CustomFieldMeta } from '../types/editMeta';
import { parseDateOnly } from '../utils/dateOnly';

describe('buildTasksCsv', () => {
    it('exports tasks as table rows with custom fields', () => {
        const tasks: Task[] = [
            {
                id: '10',
                subject: 'Parent task',
                statusName: 'Open',
                ratioDone: 0,
                lockVersion: 1,
                editable: true,
                rowIndex: 0,
                hasChildren: true,
                indentLevel: 0,
                statusId: 1
            },
            {
                id: '12',
                subject: 'Investigate export',
                projectName: 'Canvas',
                trackerName: 'Task',
                statusName: 'In Progress',
                assignedToName: 'Alice',
                startDate: parseDateOnly('2026-03-01')!,
                dueDate: parseDateOnly('2026-03-05')!,
                ratioDone: 70,
                priorityName: 'High',
                authorName: 'Bob',
                categoryName: 'Backend',
                estimatedHours: 8,
                spentHours: 3,
                fixedVersionName: 'v1',
                parentId: '10',
                lockVersion: 1,
                editable: true,
                rowIndex: 1,
                hasChildren: false,
                indentLevel: 1,
                customFieldValues: { '99': 'Needs review' },
                statusId: 1
            }
        ];
        const customFields: CustomFieldMeta[] = [
            {
                id: 99,
                name: 'Notes',
                fieldFormat: 'string',
                isRequired: false,
                regexp: null,
                minLength: null,
                maxLength: null,
                possibleValues: null
            }
        ];

        const relationSummaryByTask = new Map([
            ['12', { predecessors: ['9:Design API (precedes, delay=2)'], successors: [] }],
            ['10', { predecessors: [], successors: ['12:Investigate export (relates)'] }]
        ]);

        const csv = buildTasksCsv(tasks, customFields, relationSummaryByTask);

        expect(csv).toContain('ID,Subject,Parent ID,Parent Subject,Indent Level,Has Children');
        expect(csv).toContain('Needs review');
        expect(csv).toContain('Investigate export');
        expect(csv).toContain('2026-03-01');
        expect(csv).toContain('10,Parent task');
        expect(csv).toContain('10,Parent task,');
        expect(csv).toContain('9:Design API (precedes, delay=2)');
    });

    // Parse quoting and embedded line breaks rather than splitting on commas.
    const parseCsv = (csv: string): string[][] => {
        const rows: string[][] = [];
        let row: string[] = [];
        let cell = '';
        let quoted = false;
        for (let index = 0; index < csv.length; index += 1) {
            const char = csv[index];
            if (char === '"') {
                if (quoted && csv[index + 1] === '"') { cell += '"'; index += 1; }
                else quoted = !quoted;
            } else if (char === ',' && !quoted) {
                row.push(cell); cell = '';
            } else if (char === '\n' && !quoted) {
                row.push(cell); rows.push(row); row = []; cell = '';
            } else {
                cell += char;
            }
        }
        row.push(cell); rows.push(row);
        return rows;
    };

    it.each<[string, boolean]>([
        ['=1+1', true], ['+1+1', true], ['-1+1', true], ['@SUM(1)', true],
        ['＝1+1', true], ['＋1+1', true], ['－1+1', true], ['＠SUM(1)', true],
        [' =1+1', true], ['\tordinary', true], ['\rordinary', true], ['\nordinary', true],
        ['\uFEFF=1+1', true], ['  \uFEFF =1+1', true], ['=1,"quoted"', true], ['a\rb', false]
    ])('protects untrusted text and preserves CSV structure: %j', (value, dangerous) => {
        const parent: Task = { id: '10', subject: value, statusId: 1, statusName: 'Open', ratioDone: 0, lockVersion: 1, editable: true, rowIndex: 0, hasChildren: true };
        const child: Task = { ...parent, id: '11', parentId: '10', hasChildren: false, subject: value, customFieldValues: { '99': value } };
        const fields: CustomFieldMeta[] = [{ id: 99, name: value, fieldFormat: 'string', isRequired: false }];
        const original = JSON.stringify([parent, child, fields]);
        const relationSummary = new Map([['11', { predecessors: [value], successors: [] }]]);
        const rows = parseCsv(buildTasksCsv([parent, child], fields, relationSummary));
        const expected = dangerous ? `\t${value}` : value;
        expect(rows).toHaveLength(3);
        expect(rows.every((row) => row.length === 22)).toBe(true);
        expect(rows[0][21]).toBe(expected);
        expect(rows[1][1]).toBe(expected);
        expect(rows[2][1]).toBe(expected);
        expect(rows[2][3]).toBe(expected);
        expect(rows[2][19]).toBe(expected);
        expect(rows[2][21]).toBe(expected);
        expect(JSON.stringify([parent, child, fields])).toBe(original);
    });

    it('keeps ordinary text, empty values, zero, decimals, and numeric negatives', () => {
        const task: Task = { id: '12', subject: '通常の日本語', statusId: 1, statusName: 'Open', ratioDone: 0, estimatedHours: -1.5, spentHours: 0, lockVersion: 1, editable: true, rowIndex: 0, hasChildren: false, customFieldValues: { '99': '-1.5', '100': null } };
        const fields: CustomFieldMeta[] = [
            { id: 99, name: '数値文字列', fieldFormat: 'float', isRequired: false },
            { id: 100, name: '空欄', fieldFormat: 'string', isRequired: false }
        ];
        const rows = parseCsv(buildTasksCsv([task], fields));
        expect(rows[1][1]).toBe('通常の日本語');
        expect(rows[1][12]).toBe('0');
        expect(rows[1][16]).toBe('-1.5');
        expect(rows[1][17]).toBe('0');
        expect(rows[1][21]).toBe('\t-1.5');
        expect(rows[1][22]).toBe('');
        expect(rows[1][3]).toBe('');
    });
});
