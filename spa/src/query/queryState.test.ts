import { describe, expect, it } from 'vitest';
import {
    clearSavedQueryToStandalone,
    createDefaultQueryContext,
    isQueryModified,
    selectSavedQuery,
    setAssigneeOverride,
    setStatusOverride,
    setVersionOverride
} from './queryState';
import type { QueryContext, QueryOverrides } from './types';

describe('query state contract transitions', () => {
    it('selecting a saved query clears previous overrides', () => {
        expect(selectSavedQuery(2)).toEqual({ baseQueryId: 2, overrides: {} });
    });

    it('keeps the saved query base when a filter changes', () => {
        expect(setStatusOverride(selectSavedQuery(1), { mode: 'subset', values: [1, 2] })).toEqual({
            baseQueryId: 1,
            overrides: { status: { mode: 'subset', values: [1, 2] } }
        });
    });

    it('clears a saved query into standalone effective overrides', () => {
        const overrides: QueryOverrides = { assignee: { mode: 'subset', values: [7, null] } };
        expect(clearSavedQueryToStandalone(overrides)).toEqual({ baseQueryId: null, overrides });
    });

    it('does not represent Canvas Project scope as a query override', () => {
        const context: QueryContext = { baseQueryId: 1, overrides: {} };
        expect(context.overrides).not.toHaveProperty('project');
    });

    it('removes an override when it is set back to inherit', () => {
        const initial = setStatusOverride(
            { baseQueryId: 12, overrides: {} },
            { mode: 'subset', values: [1] }
        );
        const next = setStatusOverride(initial, { mode: 'inherit' });

        expect(next).toEqual({ baseQueryId: 12, overrides: {} });
        expect(isQueryModified(next)).toBe(false);
    });

    it('clones override arrays instead of sharing caller-owned references', () => {
        const assigneeIds: (number | null)[] = [7, null];
        const context = setAssigneeOverride(createDefaultQueryContext(), {
            mode: 'subset',
            values: assigneeIds
        });

        assigneeIds.push(8);
        expect(context.overrides.assignee).toEqual({ mode: 'subset', values: [7, null] });
    });

    it('sets assignee and version overrides without changing the saved query base', () => {
        const withAssignee = setAssigneeOverride(selectSavedQuery(12), {
            mode: 'subset',
            values: [7, null]
        });
        const withVersion = setVersionOverride(withAssignee, { mode: 'all' });

        expect(withVersion).toEqual({
            baseQueryId: 12,
            overrides: {
                assignee: { mode: 'subset', values: [7, null] },
                version: { mode: 'all' }
            }
        });
    });
});
