import { describe, expect, it } from 'vitest';
import {
    parseQueryContextFromUrl,
    buildQueryParamsFromQueryContext,
    serializeQueryContext,
    deserializeQueryContext,
    resolvedStateToQueryContext,
    queryContextToResolvedState
} from './queryStateCodec';
import type { QueryContext } from './types';

describe('QueryContext URL and storage codecs', () => {
    it('round-trips all overrides through standard Redmine URL parameters', () => {
        const context: QueryContext = {
            baseQueryId: 12,
            overrides: {
                status: { mode: 'all' },
                assignee: { mode: 'all' },
                version: { mode: 'all' }
            }
        };
        const params = buildQueryParamsFromQueryContext(context);

        expect(parseQueryContextFromUrl('?' + params.toString())).toEqual(context);
    });

    it('round-trips status, assignee none, and version none overrides', () => {
        const context: QueryContext = {
            baseQueryId: 42,
            overrides: {
                status: { mode: 'subset', values: [1, 2] },
                assignee: { mode: 'subset', values: [7, null] },
                version: { mode: 'subset', values: ['4', '_none'] }
            }
        };
        const params = buildQueryParamsFromQueryContext(context);
        const parsed = parseQueryContextFromUrl('?' + params.toString());

        expect(parsed).toEqual(context);
        expect(parsed.overrides).not.toHaveProperty('project');
    });

    it('does not convert project URL input into a Query override', () => {
        const parsed = parseQueryContextFromUrl('?project_ids[]=p1&project_ids[]=p2');
        expect(parsed).toEqual({ baseQueryId: null, overrides: {} });
    });

    it('round-trips normalized QueryContext storage without a project override', () => {
        const context = resolvedStateToQueryContext({
            queryId: 100,
            selectedStatusIds: [],
            selectedAssigneeIds: [null],
            selectedVersionIds: ['_none']
        });
        expect(deserializeQueryContext(serializeQueryContext(context))).toEqual(context);
    });

    it('converts explicit all and subset modes without collapsing null sentinels', () => {
        const context: QueryContext = {
            baseQueryId: 100,
            overrides: {
                status: { mode: 'all' },
                assignee: { mode: 'subset', values: [null, 7] },
                version: { mode: 'subset', values: ['_none', '4'] }
            }
        };

        expect(queryContextToResolvedState(context)).toEqual({
            queryId: 100,
            selectedStatusIds: [],
            selectedAssigneeIds: [null, 7],
            selectedVersionIds: ['_none', '4']
        });
        expect(queryContextToResolvedState()).toEqual({});
    });
});
