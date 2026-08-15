import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../types';
import type { TaskEditMeta } from '../types/editMeta';
import { previewContextChange } from './contextPreview';
import { buildTaskDraftIntent, buildTrackerMutationIntent } from '../stores/taskStore/draftIntent';
import type { LocalPatch, ServerSnapshot } from '../stores/taskStore/stateContract';

const task = (overrides: Partial<Task> = {}): Task => ({
    id: '1',
    subject: 'Tracker draft',
    projectId: '1',
    projectName: 'Project A',
    trackerId: 1,
    trackerName: 'Tracker A',
    statusId: 1,
    statusName: 'S1',
    ratioDone: 0,
    lockVersion: 4,
    editable: true,
    rowIndex: 0,
    hasChildren: false,
    ...overrides
});

const meta = (overrides: Partial<TaskEditMeta> = {}): TaskEditMeta => ({
    task: {
        id: '1',
        subject: 'Tracker draft',
        assignedToId: null,
        statusId: 2,
        doneRatio: 0,
        dueDate: null,
        startDate: null,
        priorityId: 1,
        categoryId: null,
        estimatedHours: null,
        projectId: 1,
        trackerId: 2,
        fixedVersionId: null,
        lockVersion: 4
    },
    capabilityContext: { taskId: '1', projectId: 1, trackerId: 2, statusId: 2 },
    editable: {
        subject: true,
        assignedToId: true,
        statusId: true,
        doneRatio: true,
        dueDate: true,
        startDate: true,
        priorityId: true,
        categoryId: true,
        estimatedHours: true,
        projectId: true,
        trackerId: true,
        fixedVersionId: true,
        customFieldValues: true
    },
    options: {
        statuses: [{ id: 2, name: 'S2' }],
        assignees: [],
        priorities: [],
        categories: [],
        projects: [{ id: 1, name: 'Project A' }],
        trackers: [{ id: 2, name: 'Tracker B' }],
        versions: [],
        customFields: []
    },
    customFieldValues: {},
    draftContract: {
        baseRevision: 4,
        materialized: { tracker_id: 2, status_id: 2 },
        normalizations: [{ field: 'status_id', from: 1, to: 2, source: 'redmine' }],
        violations: []
    },
    ...overrides
});

describe('previewContextChange', () => {
    it('normalizes Tracker Status through the server preview and keeps only tracker intent', async () => {
        const fetchEditMeta = vi.fn().mockResolvedValue(meta());

        const result = await previewContextChange({
            task: task(),
            kind: 'tracker',
            targetId: 2,
            fetchEditMeta
        });

        expect(fetchEditMeta).toHaveBeenCalledWith('1', { targetTrackerId: 2, force: true });
        expect(result.projection).toMatchObject({
            trackerId: 2,
            trackerName: 'Tracker B',
            statusId: 2,
            statusName: 'S2'
        });
        expect(result.mutationIntent).toEqual({ tracker_id: 2 });
        expect(result.capabilityContext).toEqual({ taskId: '1', projectId: 1, trackerId: 2, statusId: 2 });
    });

    it('rejects a preview with a domain violation before projection can be applied', async () => {
        const fetchEditMeta = vi.fn().mockResolvedValue(meta({
            draftContract: {
                baseRevision: 4,
                materialized: {},
                normalizations: [],
                violations: [{ field: 'tracker_id', code: 'not_accepted', message: 'Tracker is not accepted.' }]
            }
        }));

        await expect(previewContextChange({
            task: task(),
            kind: 'tracker',
            targetId: 2,
            fetchEditMeta
        })).rejects.toThrow('Tracker is not accepted.');
    });

    it('keeps Project materialization and explicit project intent on the same contract', async () => {
        const fetchEditMeta = vi.fn().mockResolvedValue(meta({
            options: {
                ...meta().options,
                projects: [{ id: 9, name: 'Project B' }],
                trackers: [{ id: 7, name: 'Tracker B' }],
                statuses: [{ id: 4, name: 'S4' }]
            },
            draftContract: {
                baseRevision: 4,
                materialized: {
                    project_id: 9,
                    tracker_id: 7,
                    status_id: 4,
                    fixed_version_id: null,
                    category_id: null
                },
                normalizations: [],
                violations: []
            }
        }));

        const result = await previewContextChange({
            task: task({ fixedVersionId: '4', categoryId: 5 }),
            kind: 'project',
            targetId: 9,
            fetchEditMeta
        });

        expect(result.projection).toMatchObject({
            projectId: '9',
            projectName: 'Project B',
            trackerId: 7,
            trackerName: 'Tracker B',
            statusId: 4,
            statusName: 'S4',
            fixedVersionId: undefined,
            categoryId: undefined
        });
        expect(result.mutationIntent).toEqual({ project_id: 9 });
        expect(result.rollbackTaskUpdates).toMatchObject({ fixedVersionId: '4', categoryId: 5 });
    });
});

describe('Tracker draft intent regression', () => {
    it('does not promote preview-normalized Status into a manual-save payload', () => {
        expect(buildTrackerMutationIntent(2)).toEqual({ tracker_id: 2 });
        const persisted = task();
        const snapshot: ServerSnapshot<Task> = {
            entitiesById: { '1': persisted },
            revisions: { '1': persisted.lockVersion },
            context: null
        };
        const patches: LocalPatch<Task>[] = [{
            entityId: '1',
            projection: { trackerId: 2, statusId: 2 },
            mutationIntent: { trackerId: 2 },
            generation: 1,
            operationId: 'edit:1:1'
        }];

        expect(buildTaskDraftIntent('1', snapshot, patches)).toEqual({
            tracker_id: 2,
            lock_version: 4
        });
    });
});
