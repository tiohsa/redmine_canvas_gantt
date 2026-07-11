import type { ResolvedQueryState } from '../utils/queryParams';

const parseIntegerTokens = (values: string[]): number[] =>
    values
        .flatMap((value) => value.split(/[|,]/))
        .map((value) => value.trim())
        .filter((value) => /^-?\d+$/.test(value))
        .map(Number);

const parseStringTokens = (values: string[]): string[] =>
    values
        .flatMap((value) => value.split(/[|,]/))
        .map((value) => value.trim())
        .filter(Boolean);

const readFilterValues = (params: URLSearchParams, field: string): string[] =>
    params.getAll(`v[${field}][]`).concat(params.getAll(`v[${field}]`));

/** Parse only Redmine's f[]/op[]/v[] filter representation. */
export const parseRedmineQueryState = (params: URLSearchParams): Partial<ResolvedQueryState> => {
    if (params.get('set_filter') !== '1') return {};

    const fields = params.getAll('f[]').concat(params.getAll('f'));
    if (fields.length === 0) return {};

    const state: Partial<ResolvedQueryState> = {};

    fields.forEach((field) => {
        const operator = params.get(`op[${field}]`) ?? '';
        const values = readFilterValues(params, field);

        switch (field) {
            case 'status_id':
                if (operator === '=') state.selectedStatusIds = parseIntegerTokens(values);
                if (operator === '*') state.selectedStatusIds = [];
                break;
            case 'assigned_to_id':
                if (operator === '=') {
                    state.selectedAssigneeIds = parseStringTokens(values).flatMap((value) => {
                        if (value === 'none' || value === '_none') return [null];
                        return /^-?\d+$/.test(value) ? [Number(value)] : [];
                    });
                }
                if (operator === '*') state.selectedAssigneeIds = [];
                if (operator === '!*') state.selectedAssigneeIds = [null];
                break;
            case 'fixed_version_id':
                if (operator === '=') {
                    state.selectedVersionIds = parseStringTokens(values).flatMap((value) => {
                        if (value === 'none' || value === '_none') return ['_none'];
                        return /^-?\d+$/.test(value) ? [value] : [];
                    });
                }
                if (operator === '*') state.selectedVersionIds = [];
                break;
            case 'project_id':
                if (operator === '=') state.canvasProjectIds = parseStringTokens(values);
                break;
            default:
                break;
        }
    });

    return state;
};
