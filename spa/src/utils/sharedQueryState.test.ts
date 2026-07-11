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
        saveLastUsedSharedQueryState({ canvasProjectIds: ['3'] }, 2);

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            selectedStatusIds: [1],
            groupBy: 'assignee'
        });
        expect(loadLastUsedSharedQueryState(2)).toEqual({
            canvasProjectIds: ['3']
        });
    });

    it('writes the V3 query context and scope state envelope', () => {
        saveLastUsedSharedQueryState({ queryId: 12, canvasProjectIds: [], groupBy: 'assignee', showSubprojects: false }, 1);

        expect(JSON.parse(window.localStorage.getItem('canvasGantt:lastSharedQueryState') || '{}')).toEqual({
            version: 3,
            projects: {
                'project:1': {
                    scopeState: {
                        showSubprojects: false,
                        canvasProjectIds: []
                    },
                    queryContext: {
                        baseQueryId: 12,
                        overrides: {}
                    },
                    sharedViewState: {
                        groupBy: 'assignee'
                    }
                }
            }
        });
    });

    it('migrates V1 storage to V3 and drops member-project scope', () => {
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
        expect(JSON.parse(window.localStorage.getItem('canvasGantt:lastSharedQueryState') || '{}').version).toBe(3);
    });

    it('migrates V2 storage to V3', () => {
        window.localStorage.setItem('canvasGantt:lastSharedQueryState', JSON.stringify({
            version: 2,
            projects: {
                'project:1': {
                    queryContext: {
                        baseQueryId: 12,
                        overrides: {}
                    },
                    sharedViewState: {
                        groupBy: 'assignee',
                        showSubprojects: false
                    }
                }
            }
        }));

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            groupBy: 'assignee',
            showSubprojects: false
        });
        expect(JSON.parse(window.localStorage.getItem('canvasGantt:lastSharedQueryState') || '{}').version).toBe(3);
    });

    it('recovers from storage failure in a single project by isolating it', () => {
        window.localStorage.setItem('canvasGantt:lastSharedQueryState', JSON.stringify({
            version: 3,
            projects: {
                'project:1': {
                    scopeState: {
                        showSubprojects: true
                    },
                    queryContext: {
                        baseQueryId: 12,
                        overrides: {}
                    },
                    sharedViewState: {
                        groupBy: 'assignee'
                    }
                },
                'project:2': 'corrupted_state_string_instead_of_object'
            }
        }));

        // project:1 should successfully load
        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            groupBy: 'assignee'
        });

        // project:2 should default/fallback
        expect(loadLastUsedSharedQueryState(2)).toBeUndefined();

        // The stored envelope should have pruned the corrupted project entry
        expect(JSON.parse(window.localStorage.getItem('canvasGantt:lastSharedQueryState') || '{}').projects['project:2']).toBeUndefined();
    });

    it('stores and restores an explicit empty project selection', () => {
        saveLastUsedSharedQueryState({ canvasProjectIds: [] }, 1);

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            canvasProjectIds: []
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
