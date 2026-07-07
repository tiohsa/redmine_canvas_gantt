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

    it('stores shared query state per project', () => {
        saveLastUsedSharedQueryState({ queryId: 12, selectedStatusIds: [1], groupBy: 'assignee', memberProjectsOnly: true }, 1);
        saveLastUsedSharedQueryState({ selectedProjectIds: ['3'] }, 2);

        expect(loadLastUsedSharedQueryState(1)).toEqual({
            queryId: 12,
            selectedStatusIds: [1],
            groupBy: 'assignee',
            memberProjectsOnly: true
        });
        expect(loadLastUsedSharedQueryState(2)).toEqual({
            selectedProjectIds: ['3']
        });
    });

    it('drops default-equivalent empty shared state', () => {
        saveLastUsedSharedQueryState({
            queryId: null,
            selectedStatusIds: [],
            selectedAssigneeIds: [],
            selectedProjectIds: [],
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
