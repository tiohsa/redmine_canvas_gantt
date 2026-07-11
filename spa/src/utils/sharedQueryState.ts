import type { ResolvedQueryState } from './queryParams';
import {
    cloneProjectState,
    projectStateFromResolvedQueryState,
    resolvedQueryStateFromProjectState,
    type SharedQueryProjectStateV3
} from '../query/queryStateCodec';
import {
    decodeSharedQueryEnvelope,
    encodeSharedQueryEnvelope,
    isSharedQueryProjectState,
    STORAGE_VERSION,
    type SharedQueryEnvelopeV3
} from '../query/persistedQueryStateCodec';

const STORAGE_KEY = 'canvasGantt:lastSharedQueryState';
const GLOBAL_PROJECT_KEY = 'project:global';

const isBrowser = typeof window !== 'undefined';


const resolveProjectKey = (projectId?: string | number | null): string => {
    const id = projectId ?? window.RedmineCanvasGantt?.projectId;
    if (id === undefined || id === null || String(id) === '') return GLOBAL_PROJECT_KEY;
    return `project:${String(id)}`;
};

const persistEnvelope = (envelope: SharedQueryEnvelopeV3) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
};

const loadEnvelope = (): SharedQueryEnvelopeV3 | null => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as unknown;
        const decoded = decodeSharedQueryEnvelope(parsed);
        if (!decoded) return null;
        const isCurrentVersion = typeof parsed === 'object'
            && parsed !== null
            && 'version' in parsed
            && parsed.version === STORAGE_VERSION;
        if (!isCurrentVersion) persistEnvelope(decoded);
        return decoded;
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
        if (isSharedQueryProjectState(state)) {
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
        if (isSharedQueryProjectState(state)) {
            cleanProjects[key] = state;
        }
    });

    if (!projectState) {
        if (!cleanProjects[projectKey]) return;
        delete cleanProjects[projectKey];
        persistEnvelope({ version: STORAGE_VERSION, projects: cleanProjects });
        return;
    }

    persistEnvelope(encodeSharedQueryEnvelope({
        ...cleanProjects,
        [projectKey]: cloneProjectState(projectState)
    }));
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
