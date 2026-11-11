import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import { it } from 'vitest';
import type { Task } from '../src/types';
import { useTaskStore } from '../src/stores/TaskStore';
const BASE_DATE = Date.UTC(2026, 0, 5);
const DAY_MS = 86_400_000;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const resetStore = () => useTaskStore.setState(useTaskStore.getInitialState(), true);
const makeData = (count: number) => ({ tasks: Array.from({ length: count }, (_, index): Task => ({
    id: `store-task-${index}`, subject: `Store task ${index}`, projectId: '1', startDate: BASE_DATE,
    dueDate: BASE_DATE + 260 * DAY_MS, ratioDone: 0, statusId: 1, lockVersion: 0,
    editable: true, rowIndex: index, hasChildren: false
})) });

it('measures selected task drag store updates', () => {
    const results: Array<Record<string, number>> = [];
    for (const [taskCount, selectionCount] of [[100, 10], [1000, 50], [5000, 100], [5000, 500]]) {
        const elapsed: number[] = [];
        let cpuMicros = 0;
        let heapDelta = 0;
        for (let sample = 0; sample < 4; sample += 1) {
            resetStore();
            const { tasks } = makeData(taskCount);
            useTaskStore.setState({ tasks, allTasks: tasks });
            const ids = new Set(tasks.slice(0, selectionCount).map(task => task.id));
            const updates = tasks.slice(0, selectionCount).map(task => ({ id: task.id, updates: {
                startDate: task.startDate! + DAY_MS, dueDate: task.dueDate! + DAY_MS
            } }));
            const beforeHeap = process.memoryUsage().heapUsed;
            const beforeCpu = process.cpuUsage();
            const start = performance.now();
            useTaskStore.getState().updateTasks(updates, ids);
            const duration = performance.now() - start;
            if (sample > 0) {
                elapsed.push(duration);
                const cpu = process.cpuUsage(beforeCpu);
                cpuMicros += cpu.user + cpu.system;
                heapDelta += process.memoryUsage().heapUsed - beforeHeap;
            }
        }
        results.push({ taskCount, selectionCount, medianMs: median(elapsed), cpuMsMean: cpuMicros / 3000, heapDeltaBytesMean: heapDelta / 3 });
    }
    writeFileSync(resolve(process.cwd(), 'bench/drag-store-measurement.json'), JSON.stringify({ node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model, samples: 3, results }, null, 2) + '\n');
}, 120_000);
