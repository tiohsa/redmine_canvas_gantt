import type { ResolvedQueryState } from './queryParams';
import {
    cloneProjectState,
    projectStateFromResolvedQueryState,
    resolvedQueryStateFromProjectState,
    type SharedQueryProjectStateV3
} from '../query/queryStateCodec';

type SharedQueryEnvelopeV1 = {
    version: 1;
    projects: Record<string, ResolvedQueryState>;
};

type SharedQueryEnvelopeV2 = {
    version: 2;
    projects: Record<string, unknown>;
};

type SharedQueryEnvelopeV3 = {
    version: 3;
    projects: Record<string, SharedQueryProjectStateV3>;
};

const STORAGE_KEY = 'canvasGantt:lastSharedQueryState';
const STORAGE_VERSION = 3;
const GLOBAL_PROJECT_KEY = 'project:global';

const isBrowser = typeof window !== 'undefined';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isEnvelopeV1 = (value: unknown): value is SharedQueryEnvelopeV1 => {
    if (!isRecord(value)) return false;
    if (value.version !== 1) return false;
    if (!isRecord(value.projects)) return false;
    return Object.values(value.projects).every((entry) => isRecord(entry));
};

const isProjectStateV3 = (value: unknown): value is SharedQueryProjectStateV3 => {
    if (!isRecord(value)) return false;
    if (!isRecord(value.scopeState)) return false;
    if (typeof value.scopeState.showSubprojects !== 'boolean') return false;
    if (!isRecord(value.queryContext)) return false;
    if (!isRecord(value.sharedViewState)) return false;
    return true;
};

const isEnvelopeV3 = (value: unknown): value is SharedQueryEnvelopeV3 => {
    if (!isRecord(value)) return false;
    if (value.version !== STORAGE_VERSION) return false;
    if (!isRecord(value.projects)) return false;
    return true;
};

const resolveProjectKey = (projectId?: string | number | null): string => {
    const id = projectId ?? window.RedmineCanvasGantt?.projectId;
    if (id === undefined || id === null || String(id) === '') return GLOBAL_PROJECT_KEY;
    return `project:${String(id)}`;
};

const persistEnvelope = (envelope: SharedQueryEnvelopeV3) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
};

const migrateEnvelopeV1ToV3 = (envelope: SharedQueryEnvelopeV1): SharedQueryEnvelopeV3 => {
    const projects: Record<string, SharedQueryProjectStateV3> = {};
    Object.entries(envelope.projects).forEach(([projectKey, state]) => {
        const projectState = projectStateFromResolvedQueryState(state);
        if (projectState) {
            projects[projectKey] = projectState;
        }
    });

    return { version: STORAGE_VERSION, projects };
};

const migrateEnvelopeV2ToV3 = (envelope: SharedQueryEnvelopeV2): SharedQueryEnvelopeV3 => {
    const projects: Record<string, SharedQueryProjectStateV3> = {};
    Object.entries(envelope.projects).forEach(([projectKey, state]) => {
        if (!isRecord(state)) return;
        const v2SharedView = isRecord(state.sharedViewState) ? state.sharedViewState : {};
        const showSubprojects = typeof v2SharedView.showSubprojects === 'boolean'
            ? v2SharedView.showSubprojects
            : true;
        const cleanSharedView = { ...v2SharedView };
        delete cleanSharedView.showSubprojects;

        projects[projectKey] = {
            scopeState: {
                showSubprojects
            },
            queryContext: isRecord(state.queryContext)
                ? (state.queryContext as unknown as SharedQueryProjectStateV3['queryContext'])
                : { baseQueryId: null, overrides: {} },
            sharedViewState: cleanSharedView
        };
    });

    return { version: STORAGE_VERSION, projects };
};

const loadEnvelope = (): SharedQueryEnvelopeV3 | null => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (isEnvelopeV3(parsed)) return parsed;
        if (isRecord(parsed)) {
            if (parsed.version === 1 && isEnvelopeV1(parsed)) {
                const migrated = migrateEnvelopeV1ToV3(parsed);
                persistEnvelope(migrated);
                return migrated;
            }
            if (parsed.version === 2) {
                const migrated = migrateEnvelopeV2ToV3(parsed as SharedQueryEnvelopeV2);
                persistEnvelope(migrated);
                return migrated;
            }
        }
        return null;
    } catch (error) {
        console.warn('Failed to parse stored shared query state', error);
        return null;
    }
};

export const loadLastUsedSharedQueryProjectState = (
    projectId?: string | number | null
): SharedQueryProjectStateV3 | undefined => {
    if (!isBrowser) return undefined;

    const envelope = loadEnvelope();
    if (!envelope) return undefined;

    const projectKey = resolveProjectKey(projectId);
    const cleanProjects: Record<string, SharedQueryProjectStateV3> = {};
    let modified = false;

    Object.entries(envelope.projects).forEach(([key, state]) => {
        if (isProjectStateV3(state)) {
            cleanProjects[key] = state;
        } else {
            console.warn(`Failed to parse stored shared query state for project ${key}. Defaulting.`);
            modified = true;
        }
    });

    if (modified) {
        persistEnvelope({ version: STORAGE_VERSION, projects: cleanProjects });
    }

    const projectState = cleanProjects[projectKey];
    return projectState ? cloneProjectState(projectState) : undefined;
};

export const saveLastUsedSharedQueryProjectState = (
    projectState: SharedQueryProjectStateV3 | undefined,
    projectId?: string | number | null
) => {
    if (!isBrowser) return;

    const projectKey = resolveProjectKey(projectId);
    const envelope = loadEnvelope() ?? { version: STORAGE_VERSION, projects: {} };

    // Filter to isolate failure
    const cleanProjects: Record<string, SharedQueryProjectStateV3> = {};
    Object.entries(envelope.projects).forEach(([key, state]) => {
        if (isProjectStateV3(state)) {
            cleanProjects[key] = state;
        }
    });

    if (!projectState) {
        if (!cleanProjects[projectKey]) return;
        delete cleanProjects[projectKey];
        persistEnvelope({ version: STORAGE_VERSION, projects: cleanProjects });
        return;
    }

    persistEnvelope({
        version: STORAGE_VERSION,
        projects: {
            ...cleanProjects,
            [projectKey]: cloneProjectState(projectState)
        }
    });
};

export const loadLastUsedSharedQueryState = (projectId?: string | number | null): ResolvedQueryState | undefined => {
    const projectState = loadLastUsedSharedQueryProjectState(projectId);
    return projectState ? resolvedQueryStateFromProjectState(projectState) : undefined;
};

export const saveLastUsedSharedQueryState = (
    state: Partial<ResolvedQueryState>,
    projectId?: string | number | null
) => {
    saveLastUsedSharedQueryProjectState(projectStateFromResolvedQueryState(state), projectId);
};

export const clearLastUsedSharedQueryState = (projectId?: string | number | null) => {
    saveLastUsedSharedQueryProjectState(undefined, projectId);
};
