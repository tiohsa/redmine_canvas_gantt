import type { ResolvedQueryState } from './queryParams';
import { serializeRedmineIssueQueryParams } from '../query/redmineQueryUrlCodec';

export const buildQueryEditorUrl = (
    state: Partial<ResolvedQueryState>,
    options: {
        issueListPath?: string;
        projectId?: string | number | null;
    } = {}
): { url: string | null; notices: string[] } => {
    const basePath = options.issueListPath ?? (
        options.projectId !== undefined && options.projectId !== null && String(options.projectId) !== ''
            ? `/projects/${String(options.projectId)}/issues`
            : null
    );
    if (!basePath) {
        return { url: null, notices: [] };
    }

    const { params, notices } = serializeRedmineIssueQueryParams(state);
    const query = params.toString();
    return {
        url: `${basePath}${query ? `?${query}` : ''}`,
        notices
    };
};
