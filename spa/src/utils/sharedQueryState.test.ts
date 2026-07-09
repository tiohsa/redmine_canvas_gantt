import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearLastUsedSharedQueryState,
    loadLastUsedSharedQueryState,
    saveLastUsedSharedQueryState
} from './sharedQueryState';

describe('shared query state storage', () => {
    beforeEach(() => {
        window.localStorage.clear();
        if (window.RedmineCanvasGantt) {
            window.RedmineCanvasGantt.projectId = 1;
        }
    });

    it('stores shared query state per project without member-project scope', () => {
        saveLastUsedSharedQueryState({ queryId: 12, selectedStatusIds: [1], groupBy: 'assignee', memberProjectsOnly: true }, 1);
        saveLastUsedSharedQueryState({ selectedProjectIds: ['3'] }, 2);

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            selectedStatusIds: [1],
            groupBy: 'assignee'
        });
        expect(loadLastUsedSharedQueryState(2)).toEqual({
            selectedProjectIds: ['3']
        });
    });

    it('writes the V2 query context and shared view envelope', () => {
        saveLastUsedSharedQueryState({ queryId: 12, selectedProjectIds: [], groupBy: 'assignee', showSubprojects: false }, 1);

        expect(JSON.parse(window.localStorage.getItem('canvasGantt:lastSharedQueryState') || '{}')).toEqual({
            version: 2,
            projects: {
                'project:1': {
                    queryContext: {
                        baseQueryId: 12,
                        overrides: {
                            project: { mode: 'none' }
                        }
                    },
                    sharedViewState: {
                        groupBy: 'assignee',
                        showSubprojects: false
                    }
                }
            }
        });
    });

    it('migrates V1 storage and drops member-project scope', () => {
        window.localStorage.setItem('canvasGantt:lastSharedQueryState', JSON.stringify({
            version: 1,
            projects: {
                'project:1': {
                    queryId: 12,
                    selectedStatusIds: [1],
                    memberProjectsOnly: true,
                    groupBy: 'assignee'
                }
            }
        }));

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            selectedStatusIds: [1],
            groupBy: 'assignee'
        });
        expect(JSON.parse(window.localStorage.getItem('canvasGantt:lastSharedQueryState') || '{}').version).toBe(2);
    });

    it('stores and restores an explicit empty project selection', () => {
        saveLastUsedSharedQueryState({ selectedProjectIds: [] }, 1);

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            selectedProjectIds: []
        });
    });

    it('stores and restores an explicit empty status selection when overriding a saved query', () => {
        saveLastUsedSharedQueryState({ queryId: 12, selectedStatusIds: [] }, 1);

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            selectedStatusIds: []
        });
    });

    it('drops default-equivalent empty shared state when project selection is not explicit', () => {
        saveLastUsedSharedQueryState({
            queryId: null,
            selectedStatusIds: [],
            selectedAssigneeIds: [],
            selectedVersionIds: [],
            memberProjectsOnly: false,
            sortConfig: { key: 'startDate', direction: 'asc' },
            groupBy: 'project',
            showSubprojects: true
        }, 1);

        expect(loadLastUsedSharedQueryState(1)).toBeUndefined();
    });

    it('stores and restores an explicit no-grouping selection', () => {
        saveLastUsedSharedQueryState({ groupBy: null }, 1);

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            groupBy: null
        });
    });

    it('stores and restores project grouping when it overrides a saved query', () => {
        saveLastUsedSharedQueryState({ queryId: 12, groupBy: 'project' }, 1);

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            groupBy: 'project'
        });
    });

    it('clears only the targeted project state', () => {
        saveLastUsedSharedQueryState({ queryId: 7 }, 1);
        saveLastUsedSharedQueryState({ selectedVersionIds: ['9'] }, 2);

        clearLastUsedSharedQueryState(1);

        expect(loadLastUsedSharedQueryState(1)).toBeUndefined();
        expect(loadLastUsedSharedQueryState(2)).toEqual({
            selectedVersionIds: ['9']
        });
    });
});
