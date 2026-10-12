import { describe, expect, it } from 'vitest';
import type { Relation, Task } from '../types';
import { RelationType } from '../types/constraints';
import { calculateCriticalPath } from './criticalPath';
import { calculateCriticalPath as calculateCriticalPathBaseline } from '../../bench/criticalPath.baseline';
import { configureBusinessCalendar } from '../utils/businessCalendar';

const DAY_MS = 86_400_000;
const BASE_DATE = Date.UTC(2026, 0, 5);

const differentialCalendarPayload = {
    status: 'ok',
    validationStatus: 'valid',
    revision: 'differential-calendar-v1',
    defaultCalendarId: 'weekday',
    projectCalendarIds: { '1': 'weekday', '2': 'alternate' },
    calendars: {
        weekday: {
            id: 'weekday', name: 'Weekdays', nonWorkingWeekDays: [0, 6],
            days: {
                '2026-01-07': { name: 'Closure', type: 'non_working' as const },
                '2026-01-10': { name: 'Working Saturday', type: 'working' as const }
            }
        },
        alternate: {
            id: 'alternate', name: 'Alternate week', nonWorkingWeekDays: [0],
            days: { '2026-01-08': { name: 'Alternate closure', type: 'non_working' as const } }
        }
    },
    warnings: []
};

const makeDifferentialInputs = (seed: number): { tasks: Task[]; relations: Relation[] } => {
    let state = seed >>> 0;
    const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x1_0000_0000;
    };
    const size = 12 + Math.floor(random() * 37);
    const tasks: Task[] = Array.from({ length: size }, (_, index) => {
        const startDate = BASE_DATE + (Math.floor(random() * 25) - 8) * DAY_MS;
        const duration = Math.floor(random() * 9);
        const dateMode = index === 0 ? 0.04 : index === 1 ? 0.1 : index === 2 ? 0.18 : random();
        return {
            id: `seed-${seed}-task-${index}`,
            subject: `Seed ${seed} task ${index}`,
            projectId: index % 2 === 0 ? '1' : '2',
            ...(dateMode < 0.08 ? {} : {
                startDate: dateMode < 0.12 ? undefined : startDate,
                dueDate: dateMode < 0.16 ? undefined : startDate + (dateMode < 0.2 ? -DAY_MS : duration * DAY_MS)
            }),
            ratioDone: 0,
            statusId: 1,
            lockVersion: 0,
            editable: true,
            rowIndex: index,
            hasChildren: false
        };
    });
    const relations: Relation[] = [];
    const types = [RelationType.Precedes, RelationType.Follows, RelationType.Relates, RelationType.Blocks];
    for (let from = 0; from < size; from += 1) {
        for (let to = from + 1; to < size; to += 1) {
            if (random() < 0.06) {
                relations.push({
                    id: `seed-${seed}-relation-${relations.length}`,
                    from: tasks[from].id,
                    to: tasks[to].id,
                    type: types[Math.floor(random() * types.length)],
                    delay: Math.floor(random() * 4)
                });
            }
        }
    }
    relations.push(
        { id: `seed-${seed}-follows`, from: tasks[4].id, to: tasks[3].id, type: RelationType.Follows, delay: 2 },
        { id: `seed-${seed}-relates`, from: tasks[5].id, to: tasks[6].id, type: RelationType.Relates },
        { id: `seed-${seed}-blocks`, from: tasks[6].id, to: tasks[7].id, type: RelationType.Blocks }
    );
    if (seed % 5 === 0 && size >= 3) {
        const cycleStart = size - 3;
        for (let offset = 0; offset < 3; offset += 1) {
            relations.push({
                id: `seed-${seed}-cycle-${offset}`,
                from: tasks[cycleStart + offset].id,
                to: tasks[cycleStart + ((offset + 1) % 3)].id,
                type: RelationType.Precedes,
                delay: offset
            });
        }
    }
    return { tasks, relations };
};

describe('critical path differential regression', () => {
    it('matches the frozen implementation for 100 seeded graphs without mutating inputs', () => {
        configureBusinessCalendar(differentialCalendarPayload);
        try {
            for (let seed = 1; seed <= 100; seed += 1) {
                const { tasks, relations } = makeDifferentialInputs(seed);
                const tasksBefore = structuredClone(tasks);
                const relationsBefore = structuredClone(relations);
                const expected = calculateCriticalPathBaseline(tasks, relations);
                const actual = calculateCriticalPath(tasks, relations);
                expect(actual, `critical path mismatch for seed ${seed}`).toEqual(expected);
                expect(tasks).toEqual(tasksBefore);
                expect(relations).toEqual(relationsBefore);
            }
        } finally {
            configureBusinessCalendar(undefined);
        }
    });
});
