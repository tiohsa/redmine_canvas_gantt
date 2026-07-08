import { describe, expect, it } from 'vitest';
import {
    clearProjectFilter,
    clearSavedQueryToStandalone,
    createDefaultQueryContext,
    isQueryModified,
    selectAllCandidateProjects,
    selectSavedQuery,
    setAssigneeOverride,
    setProjectOverride,
    setStatusOverride,
    setVersionOverride
} from './queryState';
import type { QueryContext, QueryOverrides } from './types';

type TransitionCase = {
    name: string;
    initial: QueryContext;
    action: (context: QueryContext) => QueryContext;
    expectedContext: QueryContext;
    expectedEffectiveState: QueryOverrides;
    expectedModified: boolean;
};

describe('query state contract transitions', () => {
    const cases: TransitionCase[] = [
        {
            name: 'Q1 -> select Q2 clears overrides',
            initial: { baseQueryId: 1, overrides: {} },
            action: () => selectSavedQuery(2),
            expectedContext: { baseQueryId: 2, overrides: {} },
            expectedEffectiveState: {},
            expectedModified: false
        },
        {
            name: 'Q1 -> status change keeps Q1 and adds status override',
            initial: { baseQueryId: 1, overrides: {} },
            action: (context) => setStatusOverride(context, { mode: 'subset', values: [1, 2] }),
            expectedContext: {
                baseQueryId: 1,
                overrides: {
                    status: { mode: 'subset', values: [1, 2] }
                }
            },
            expectedEffectiveState: {
                status: { mode: 'subset', values: [1, 2] }
            },
            expectedModified: true
        },
        {
            name: 'Q1 + override -> clear query becomes standalone with previous effective overrides',
            initial: {
                baseQueryId: 1,
                overrides: {
                    assignee: { mode: 'subset', values: [7, null] }
                }
            },
            action: (context) => clearSavedQueryToStandalone(context.overrides),
            expectedContext: {
                baseQueryId: null,
                overrides: {
                    assignee: { mode: 'subset', values: [7, null] }
                }
            },
            expectedEffectiveState: {
                assignee: { mode: 'subset', values: [7, null] }
            },
            expectedModified: true
        },
        {
            name: 'standalone -> select Q1 clears standalone overrides',
            initial: {
                baseQueryId: null,
                overrides: {
                    version: { mode: 'subset', values: ['4', '_none'] }
                }
            },
            action: () => selectSavedQuery(1),
            expectedContext: { baseQueryId: 1, overrides: {} },
            expectedEffectiveState: {},
            expectedModified: false
        },
        {
            name: 'subset project -> clear becomes none',
            initial: {
                baseQueryId: null,
                overrides: {
                    project: { mode: 'subset', values: ['p1'] }
                }
            },
            action: clearProjectFilter,
            expectedContext: {
                baseQueryId: null,
                overrides: {
                    project: { mode: 'none' }
                }
            },
            expectedEffectiveState: {
                project: { mode: 'none' }
            },
            expectedModified: true
        },
        {
            name: 'none project -> select all becomes subset of current candidates',
            initial: {
                baseQueryId: null,
                overrides: {
                    project: { mode: 'none' }
                }
            },
            action: (context) => selectAllCandidateProjects(context, ['p1', 'p2']),
            expectedContext: {
                baseQueryId: null,
                overrides: {
                    project: { mode: 'subset', values: ['p1', 'p2'] }
                }
            },
            expectedEffectiveState: {
                project: { mode: 'subset', values: ['p1', 'p2'] }
            },
            expectedModified: true
        }
    ];

    it.each(cases)('$name', ({ initial, action, expectedContext, expectedEffectiveState, expectedModified }) => {
        const next = action(initial);

        expect(next).toEqual(expectedContext);
        expect(next.overrides).toEqual(expectedEffectiveState);
        expect(isQueryModified(next)).toBe(expectedModified);
    });
});

describe('query state contract helpers', () => {
    it('creates the standalone default context', () => {
        expect(createDefaultQueryContext()).toEqual({
            baseQueryId: null,
            overrides: {}
        });
    });

    it('removes an override when a filter is set back to inherit', () => {
        const initial = setProjectOverride(
            { baseQueryId: 12, overrides: {} },
            { mode: 'subset', values: ['p1'] }
        );

        const next = setProjectOverride(initial, { mode: 'inherit' });

        expect(next).toEqual({
            baseQueryId: 12,
            overrides: {}
        });
        expect(isQueryModified(next)).toBe(false);
    });

    it('clones override arrays instead of sharing caller-owned references', () => {
        const projectIds = ['p1'];
        const context = setProjectOverride(createDefaultQueryContext(), {
            mode: 'subset',
            values: projectIds
        });

        projectIds.push('p2');

        expect(context.overrides.project).toEqual({
            mode: 'subset',
            values: ['p1']
        });
    });

    it('sets assignee and version overrides without changing the saved query base', () => {
        const withAssignee = setAssigneeOverride(selectSavedQuery(12), {
            mode: 'subset',
            values: [7, null]
        });
        const withVersion = setVersionOverride(withAssignee, {
            mode: 'all'
        });

        expect(withVersion).toEqual({
            baseQueryId: 12,
            overrides: {
                assignee: { mode: 'subset', values: [7, null] },
                version: { mode: 'all' }
            }
        });
    });
});
