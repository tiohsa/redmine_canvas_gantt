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
});
