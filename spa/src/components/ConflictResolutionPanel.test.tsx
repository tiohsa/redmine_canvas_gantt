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

    it('keeps conflicts available when the side panel is closed and reopened', () => {
        useTaskStore.setState({
            allTasks: [task('Local', 1)],
            localTaskPatches: {
                '1': [{ entityId: '1', projection: { subject: 'Local' }, mutationIntent: { subject: 'Local' }, generation: 1, operationId: 'edit:1:1' }]
            },
            taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1,
                remoteEntity: { id: '1', subject: 'Remote', lockVersion: 2 }, remoteRevision: 2 } }
        });

        render(<ConflictResolutionPanel />);
        expect(screen.getByRole('table', { name: 'Changed fields #1' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByTestId('conflict-resolution-panel')).not.toBeInTheDocument();
        expect(useTaskStore.getState().taskConflicts['1']).toBeDefined();
        fireEvent.click(screen.getByTestId('conflict-reopen'));
        expect(screen.getByTestId('conflict-resolution-panel')).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'Remote' })).toBeInTheDocument();
    });

    it('stays open for remaining conflicts after resolving a newly arrived conflict', () => {
        const first = task('First local', 1);
        const second = { ...task('Second local', 1), id: '2' };
        useTaskStore.setState({
            allTasks: [first, second],
            tasks: [first, second],
            taskConflicts: {
                '2': { taskId: '2', message: 'Second conflict', detectedAt: 2,
                    remoteEntity: { id: '2', subject: 'Second remote', lockVersion: 2 }, remoteRevision: 2 }
            }
        });

        render(<ConflictResolutionPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        act(() => useTaskStore.setState(state => ({
            taskConflicts: {
                ...state.taskConflicts,
                '1': { taskId: '1', message: 'First conflict', detectedAt: 1,
                    remoteEntity: { id: '1', subject: 'First remote', lockVersion: 2 }, remoteRevision: 2 }
            }
        })));
        expect(screen.getByTestId('conflict-resolution-panel')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('conflict-use-remote-1'));

        expect(screen.getByTestId('conflict-resolution-panel')).toBeInTheDocument();
        expect(screen.getByTestId('task-conflict-2')).toBeInTheDocument();
        expect(screen.queryByTestId('task-conflict-1')).not.toBeInTheDocument();
        expect(useTaskStore.getState().taskConflicts['2']).toBeDefined();
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

    it('adopts the newer value shown in the same-scope comparison and keeps other drafts', () => {
        const context = createReadContext({ generation: 2, projectId: '1', query: { queryId: 1 },
            scope: { showSubprojects: true }, purpose: 'refresh' });
        const other = { ...task('Other draft', 1), id: '2' };
        useTaskStore.setState({
            allTasks: [task('Local draft', 1), other],
            tasks: [task('Local draft', 1), other],
            serverTaskSnapshot: createServerSnapshot([task('Remote v3', 3), { ...other, subject: 'Other server' }], context),
            activeReadContext: context,
            dataReadStatus: 'ready',
            localTaskPatches: {
                '1': [{ entityId: '1', projection: { subject: 'Local draft' }, mutationIntent: { subject: 'Local draft' }, generation: 1, operationId: 'edit:1:1' }],
                '2': [{ entityId: '2', projection: { subject: 'Other draft' }, mutationIntent: { subject: 'Other draft' }, generation: 1, operationId: 'edit:2:1' }]
            },
            modifiedTaskIds: new Set(['1', '2']),
            taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1, generation: 1,
                remoteEntity: task('Remote v2', 2), remoteRevision: 2 } }
        });

        render(<ConflictResolutionPanel />);
        expect(screen.getByRole('cell', { name: 'Remote v3' })).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('conflict-use-remote-1'));

        const state = useTaskStore.getState();
        expect(state.allTasks.find(item => item.id === '1')?.subject).toBe('Remote v3');
        expect(state.serverTaskSnapshot.entitiesById['1'].subject).toBe('Remote v3');
        expect(state.serverTaskSnapshot.revisions['1']).toBe(3);
        expect(state.localTaskPatches['1']).toBeUndefined();
        expect(state.allTasks.find(item => item.id === '2')?.subject).toBe('Other draft');
        expect(state.localTaskPatches['2']).toHaveLength(1);
        expect(state.modifiedTaskIds.has('2')).toBe(true);
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
        expect(screen.getByRole('cell', { name: 'Latest' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'Server' })).toBeInTheDocument();
        expect(screen.getAllByRole('cell', { name: 'Empty' })).toHaveLength(2);
        expect(screen.queryByText('Due date')).not.toBeInTheDocument();
        useTaskStore.setState({ taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1,
            remoteEntity: { id: '1', subject: 'Stale', lockVersion: 1 }, remoteRevision: 2 } } });
        rerender(<ConflictResolutionPanel />);
        expect(screen.getAllByRole('cell', { name: 'Not available' }).length).toBeGreaterThan(0);
        act(() => useTaskStore.setState({ taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1,
            remoteEntity: { id: '1', subject: 'Unconfirmed', lockVersion: 2 }, remoteRevision: 2,
            remoteAvailability: 'needs_refresh' } } }));
        expect(screen.queryByRole('cell', { name: 'Unconfirmed' })).not.toBeInTheDocument();
    });

    it('uses a revision-checked snapshot only in the active read scope', () => {
        const context = createReadContext({ generation: 2, projectId: '1', query: { queryId: 1 }, scope: { showSubprojects: true }, purpose: 'refresh' });
        useTaskStore.setState({ allTasks: [task('Local', 1)],
            localTaskPatches: { '1': [{ entityId: '1', projection: { subject: 'Local' }, mutationIntent: { subject: 'Local' }, generation: 1, operationId: 'edit:1:1' }] },
            serverTaskSnapshot: createServerSnapshot([task('Snapshot', 3)], context),
            activeReadContext: context, dataReadStatus: 'ready',
            taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1,
                remoteEntity: task('Response', 2), remoteRevision: 2 } } });
        render(<ConflictResolutionPanel />);
        expect(screen.getByRole('cell', { name: 'Snapshot' })).toBeInTheDocument();
        act(() => useTaskStore.setState({ activeReadContext: createReadContext({ generation: 3, projectId: '1', query: { queryId: 2 }, scope: { showSubprojects: true }, purpose: 'refresh' }) }));
        expect(screen.getByRole('cell', { name: 'Not available' })).toBeInTheDocument();
    });

    it('displays date-only values as local calendar dates', () => {
        const dueDate = parseDateOnly('2026-09-23')!;
        useTaskStore.setState({ allTasks: [task('Local', 1)],
            localTaskPatches: { '1': [{ entityId: '1', projection: { dueDate }, mutationIntent: { dueDate }, generation: 1, operationId: 'edit:1:1' }] },
            taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1,
                remoteEntity: { id: '1', dueDate, lockVersion: 2 }, remoteRevision: 2 } } });
        render(<ConflictResolutionPanel />);
        expect(screen.getAllByRole('cell', { name: '2026-09-23' })).toHaveLength(2);
    });

    it('formats known custom boolean values without treating absent remote values as empty', () => {
        useTaskStore.setState({ allTasks: [task('Local', 1)],
            customFields: [{ id: 99, name: 'Approved', fieldFormat: 'bool', isRequired: false }],
            localTaskPatches: { '1': [{ entityId: '1', projection: {}, mutationIntent: { customFieldValues: { '99': '1', '100': 'text' } }, generation: 1, operationId: 'edit:1:1' }] },
            taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1,
                remoteEntity: { id: '1', customFieldValues: { '99': '0' }, lockVersion: 2 }, remoteRevision: 2 } } });
        render(<ConflictResolutionPanel />);
        expect(screen.getByRole('cell', { name: 'Yes' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'No' })).toBeInTheDocument();
        expect(screen.getByText(/Custom field.*ID 100/)).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'Not available' })).toBeInTheDocument();
    });

    it('distinguishes explicit empty values from absent fields and preserves zero', () => {
        useTaskStore.setState({ allTasks: [task('Local', 1)],
            customFields: [
                { id: 99, name: 'Cleared field', fieldFormat: 'string', isRequired: false },
                { id: 100, name: 'Absent field', fieldFormat: 'string', isRequired: false }
            ],
            localTaskPatches: { '1': [{ entityId: '1', projection: {}, mutationIntent: {
                estimatedHours: undefined, assignedToId: null, subject: '', ratioDone: 0,
                customFieldValues: { '99': null, '100': '' }
            }, generation: 1, operationId: 'edit:1:1' }] },
            taskConflicts: { '1': { taskId: '1', message: 'Conflict', detectedAt: 1,
                remoteEntity: { id: '1', estimatedHours: undefined, subject: '', ratioDone: 0,
                    customFieldValues: { '99': null }, lockVersion: 2 }, remoteRevision: 2 } } });

        render(<ConflictResolutionPanel />);
        expect(screen.getAllByRole('cell', { name: 'Empty' })).toHaveLength(8);
        expect(screen.getAllByRole('cell', { name: 'Not available' })).toHaveLength(2);
        expect(screen.getAllByRole('cell', { name: '0' })).toHaveLength(2);
    });
});
