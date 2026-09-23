import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ConflictResolutionPanel } from './ConflictResolutionPanel';
import { useTaskStore } from '../stores/TaskStore';
import { createReadContext, createServerSnapshot } from '../stores/taskStore/stateContract';
import type { Task } from '../types';
import { parseDateOnly } from '../utils/dateOnly';

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
                '1': [{ entityId: '1', projection: { subject: 'Local' }, mutationIntent: { subject: 'Local' }, generation: 1, operationId: 'edit:1:1' }]
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
                '1': [{ entityId: '1', projection: { subject: 'Local' }, mutationIntent: { subject: 'Local' }, generation: 1, operationId: 'edit:1:1' }]
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

    it('compares current retry intent with only confirmed remote fields', () => {
        const patches = [
            { entityId: '1', projection: { subject: 'Projection', dueDate: 3 }, mutationIntent: { subject: 'At conflict', customFieldValues: { '99': '' } }, generation: 1, operationId: 'edit:1:1' },
            { entityId: '1', projection: { subject: 'Latest' }, mutationIntent: { subject: 'Latest' }, generation: 2, operationId: 'edit:1:2' }
        ];
        useTaskStore.setState({ allTasks: [task('Latest', 1)], localTaskPatches: { '1': patches },
            customFields: [{ id: 99, name: 'Notes', fieldFormat: 'string', isRequired: false }],
            taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1, generation: 1,
                remoteEntity: { id: '1', subject: 'Server', lockVersion: 2, customFieldValues: { '99': null } }, remoteRevision: 2 } } });
        const { rerender } = render(<ConflictResolutionPanel />);
        expect(screen.getByText('Retry value: Latest')).toBeInTheDocument();
        expect(screen.getByText('Server value: Server')).toBeInTheDocument();
        expect(screen.getAllByText(/: Empty/)).toHaveLength(2);
        expect(screen.queryByText('Due date')).not.toBeInTheDocument();
        useTaskStore.setState({ taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1,
            remoteEntity: { id: '1', subject: 'Stale', lockVersion: 1 }, remoteRevision: 2 } } });
        rerender(<ConflictResolutionPanel />);
        expect(screen.getAllByText(/Not available/).length).toBeGreaterThan(0);
    });

    it('uses a revision-checked snapshot only in the active read scope', () => {
        const context = createReadContext({ generation: 2, projectId: '1', query: { queryId: 1 }, scope: { showSubprojects: true }, purpose: 'refresh' });
        useTaskStore.setState({ allTasks: [task('Local', 1)],
            localTaskPatches: { '1': [{ entityId: '1', projection: { subject: 'Local' }, mutationIntent: { subject: 'Local' }, generation: 1, operationId: 'edit:1:1' }] },
            serverTaskSnapshot: createServerSnapshot([task('Snapshot', 3)], context),
            activeReadContext: context, dataReadStatus: 'ready',
            taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1, remoteRevision: 2 } } });
        render(<ConflictResolutionPanel />);
        expect(screen.getByText('Server value: Snapshot')).toBeInTheDocument();
        act(() => useTaskStore.setState({ activeReadContext: createReadContext({ generation: 3, projectId: '1', query: { queryId: 2 }, scope: { showSubprojects: true }, purpose: 'refresh' }) }));
        expect(screen.getByText(/Server value: Not available/)).toBeInTheDocument();
    });

    it('displays date-only values as local calendar dates', () => {
        const dueDate = parseDateOnly('2026-09-23')!;
        useTaskStore.setState({ allTasks: [task('Local', 1)],
            localTaskPatches: { '1': [{ entityId: '1', projection: { dueDate }, mutationIntent: { dueDate }, generation: 1, operationId: 'edit:1:1' }] },
            taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1,
                remoteEntity: { id: '1', dueDate, lockVersion: 2 }, remoteRevision: 2 } } });
        render(<ConflictResolutionPanel />);
        expect(screen.getByText('Retry value: 2026-09-23')).toBeInTheDocument();
        expect(screen.getByText('Server value: 2026-09-23')).toBeInTheDocument();
    });

    it('formats known custom boolean values without treating absent remote values as empty', () => {
        useTaskStore.setState({ allTasks: [task('Local', 1)],
            customFields: [{ id: 99, name: 'Approved', fieldFormat: 'bool', isRequired: false }],
            localTaskPatches: { '1': [{ entityId: '1', projection: {}, mutationIntent: { customFieldValues: { '99': '1', '100': 'text' } }, generation: 1, operationId: 'edit:1:1' }] },
            taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1,
                remoteEntity: { id: '1', customFieldValues: { '99': '0' }, lockVersion: 2 }, remoteRevision: 2 } } });
        render(<ConflictResolutionPanel />);
        expect(screen.getByText('Retry value: Yes')).toBeInTheDocument();
        expect(screen.getByText('Server value: No')).toBeInTheDocument();
        expect(screen.getByText(/Custom field.*ID 100/)).toBeInTheDocument();
        expect(screen.getByText(/Server value: Not available/)).toBeInTheDocument();
    });
});
