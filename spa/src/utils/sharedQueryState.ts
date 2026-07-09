import type { ResolvedQueryState } from './queryParams';
import {
    cloneProjectState,
    projectStateFromResolvedQueryState,
    resolvedQueryStateFromProjectState,
    type SharedQueryProjectStateV2
} from '../query/queryStateCodec';

type SharedQueryEnvelopeV1 = {
    version: 1;
    projects: Record<string, ResolvedQueryState>;
};

type SharedQueryEnvelopeV2 = {
    version: 2;
    projects: Record<string, SharedQueryProjectStateV2>;
};

const STORAGE_KEY = 'canvasGantt:lastSharedQueryState';
const STORAGE_VERSION = 2;
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

const isProjectStateV2 = (value: unknown): value is SharedQueryProjectStateV2 => {
    if (!isRecord(value)) return false;
    if (!isRecord(value.queryContext)) return false;
    if (!isRecord(value.sharedViewState)) return false;
    return true;
};

const isEnvelopeV2 = (value: unknown): value is SharedQueryEnvelopeV2 => {
    if (!isRecord(value)) return false;
    if (value.version !== STORAGE_VERSION) return false;
    if (!isRecord(value.projects)) return false;
    return Object.values(value.projects).every((entry) => isProjectStateV2(entry));
};

const resolveProjectKey = (projectId?: string | number | null): string => {
    const id = projectId ?? window.RedmineCanvasGantt?.projectId;
    if (id === undefined || id === null || String(id) === '') return GLOBAL_PROJECT_KEY;
    return `project:${String(id)}`;
};

const persistEnvelope = (envelope: SharedQueryEnvelopeV2) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
};

const migrateEnvelopeV1 = (envelope: SharedQueryEnvelopeV1): SharedQueryEnvelopeV2 => {
    const projects = Object.fromEntries(
        Object.entries(envelope.projects).flatMap(([projectKey, state]) => {
            const projectState = projectStateFromResolvedQueryState(state);
            return projectState ? [[projectKey, projectState]] : [];
        })
    );

    return { version: STORAGE_VERSION, projects };
};

const loadEnvelope = (): SharedQueryEnvelopeV2 | null => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (isEnvelopeV2(parsed)) return parsed;
        if (isEnvelopeV1(parsed)) {
            const migrated = migrateEnvelopeV1(parsed);
            persistEnvelope(migrated);
            return migrated;
        }
        return null;
    } catch (error) {
        console.warn('Failed to parse stored shared query state', error);
        return null;
    }
};

export const loadLastUsedSharedQueryProjectState = (
    projectId?: string | number | null
): SharedQueryProjectStateV2 | undefined => {
    if (!isBrowser) return undefined;

    const envelope = loadEnvelope();
    if (!envelope) return undefined;

    const projectState = envelope.projects[resolveProjectKey(projectId)];
    return projectState ? cloneProjectState(projectState) : undefined;
};

export const saveLastUsedSharedQueryProjectState = (
    projectState: SharedQueryProjectStateV2 | undefined,
    projectId?: string | number | null
) => {
    if (!isBrowser) return;

    const projectKey = resolveProjectKey(projectId);
    const envelope = loadEnvelope() ?? { version: STORAGE_VERSION, projects: {} };

    if (!projectState) {
        if (!envelope.projects[projectKey]) return;
        const rest = { ...envelope.projects };
        delete rest[projectKey];
        persistEnvelope({ version: STORAGE_VERSION, projects: rest });
        return;
    }

    persistEnvelope({
        version: STORAGE_VERSION,
        projects: {
            ...envelope.projects,
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
