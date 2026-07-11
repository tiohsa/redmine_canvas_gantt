import type { ResolvedQueryState } from '../utils/queryParams';
import {
    projectStateFromResolvedQueryState,
    type SharedQueryProjectStateV3
} from './queryStateCodec';

export type SharedQueryEnvelopeV1 = {
    version: 1;
    projects: Record<string, ResolvedQueryState>;
};

export type SharedQueryEnvelopeV2 = {
    version: 2;
    projects: Record<string, unknown>;
};

export type SharedQueryEnvelopeV3 = {
    version: 3;
    projects: Record<string, SharedQueryProjectStateV3>;
};

export const STORAGE_VERSION = 3;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isEnvelopeV1 = (value: unknown): value is SharedQueryEnvelopeV1 => {
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.projects)) return false;
    return Object.values(value.projects).every((entry) => isRecord(entry));
};

export const isSharedQueryProjectState = (value: unknown): value is SharedQueryProjectStateV3 => {
    if (!isRecord(value) || !isRecord(value.scopeState)) return false;
    if (typeof value.scopeState.showSubprojects !== 'boolean') return false;
    return isRecord(value.queryContext) && isRecord(value.sharedViewState);
};

const isEnvelopeV3 = (value: unknown): value is SharedQueryEnvelopeV3 =>
    isRecord(value) && value.version === STORAGE_VERSION && isRecord(value.projects);

const migrateEnvelopeV1 = (envelope: SharedQueryEnvelopeV1): SharedQueryEnvelopeV3 => {
    const projects: Record<string, SharedQueryProjectStateV3> = {};
    Object.entries(envelope.projects).forEach(([projectKey, state]) => {
        const projectState = projectStateFromResolvedQueryState(state);
        if (projectState) projects[projectKey] = projectState;
    });
    return { version: STORAGE_VERSION, projects };
};

const migrateEnvelopeV2 = (envelope: SharedQueryEnvelopeV2): SharedQueryEnvelopeV3 => {
    const projects: Record<string, SharedQueryProjectStateV3> = {};
    Object.entries(envelope.projects).forEach(([projectKey, state]) => {
        if (!isRecord(state)) return;
        const v2SharedView = isRecord(state.sharedViewState) ? state.sharedViewState : {};
        const showSubprojects = typeof v2SharedView.showSubprojects === 'boolean'
            ? v2SharedView.showSubprojects
            : true;
        const sharedViewState = { ...v2SharedView };
        delete sharedViewState.showSubprojects;

        projects[projectKey] = {
            scopeState: { showSubprojects },
            queryContext: isRecord(state.queryContext)
                ? (state.queryContext as unknown as SharedQueryProjectStateV3['queryContext'])
                : { baseQueryId: null, overrides: {} },
            sharedViewState
        };
    });
    return { version: STORAGE_VERSION, projects };
};

export const decodeSharedQueryEnvelope = (value: unknown): SharedQueryEnvelopeV3 | undefined => {
    if (isEnvelopeV3(value)) return value;
    if (isEnvelopeV1(value)) return migrateEnvelopeV1(value);
    if (isRecord(value) && value.version === 2) return migrateEnvelopeV2(value as SharedQueryEnvelopeV2);
    return undefined;
};

export const encodeSharedQueryEnvelope = (
    projects: Record<string, SharedQueryProjectStateV3>
): SharedQueryEnvelopeV3 => ({
    version: STORAGE_VERSION,
    projects
});
