import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConflictResolutionPanel } from './ConflictResolutionPanel';
import { useTaskStore } from '../stores/TaskStore';
import { createServerSnapshot } from '../stores/taskStore/stateContract';
import type { Task } from '../types';

const task = (subject: string, lockVersion: number): Task => ({
    id: '1',
    subject,
    startDate: 0,
    dueDate: 1,
    ratioDone: 0,
    statusId: 1,
    lockVersion,
    editable: true,
    rowIndex: 0,
    hasChildren: false
});

describe('ConflictResolutionPanel', () => {
    beforeEach(() => {
        useTaskStore.setState(useTaskStore.getInitialState(), true);
    });

    it('offers explicit remote and local retry choices while retaining the draft', () => {
        const saveChanges = vi.fn().mockResolvedValue(new Map());
        useTaskStore.setState({
            allTasks: [task('Local', 1)],
            tasks: [task('Local', 1)],
            serverTaskSnapshot: createServerSnapshot([task('Remote', 2)]),
            localTaskPatches: {
                '1': [{ entityId: '1', fields: { subject: 'Local' }, generation: 1, operationId: 'edit:1:1' }]
            },
            modifiedTaskIds: new Set(['1']),
            taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1 } },
            saveChanges
        });

        render(<ConflictResolutionPanel />);
        expect(screen.getByTestId('conflict-use-remote-1')).toBeInTheDocument();
        expect(screen.getByTestId('conflict-keep-local-1')).toBeInTheDocument();
        expect(screen.queryByTestId('conflict-dismiss-1')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('conflict-keep-local-1'));
        expect(saveChanges).toHaveBeenCalledTimes(1);
        expect(useTaskStore.getState().taskConflicts['1']).toBeUndefined();
        expect(useTaskStore.getState().localTaskPatches['1']).toBeDefined();
    });

    it('accepts the remote snapshot and clears only that task draft', () => {
        useTaskStore.setState({
            allTasks: [task('Local', 1)],
            tasks: [task('Local', 1)],
            serverTaskSnapshot: createServerSnapshot([task('Remote', 2)]),
            localTaskPatches: {
                '1': [{ entityId: '1', fields: { subject: 'Local' }, generation: 1, operationId: 'edit:1:1' }]
            },
            modifiedTaskIds: new Set(['1']),
            taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1, remoteEntity: task('Remote', 2), remoteRevision: 2 } }
        });

        render(<ConflictResolutionPanel />);
        fireEvent.click(screen.getByTestId('conflict-use-remote-1'));

        expect(useTaskStore.getState().allTasks[0]?.subject).toBe('Remote');
        expect(useTaskStore.getState().localTaskPatches['1']).toBeUndefined();
        expect(useTaskStore.getState().modifiedTaskIds.has('1')).toBe(false);
        expect(useTaskStore.getState().taskConflicts['1']).toBeUndefined();
    });
});
