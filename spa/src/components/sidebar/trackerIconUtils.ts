export type TrackerIconKind = 'bug' | 'feature' | 'support' | 'task';

export type TrackerIconMap = Partial<Record<number, TrackerIconKind>>;

const DEFAULT_TRACKER_ICON_KIND: TrackerIconKind = 'task';

const TRACKER_ICON_KIND_SET = new Set<TrackerIconKind>(['bug', 'feature', 'support', 'task']);

const TRACKER_NAME_KEYWORDS: Record<Exclude<TrackerIconKind, 'task'>, string[]> = {
    bug: ['bug', '不具合', '障害'],
    feature: ['feature', '機能', '要望'],
    support: ['support', 'サポート', '問い合わせ']
};

export const normalizeTrackerIconKind = (value: unknown): TrackerIconKind | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return TRACKER_ICON_KIND_SET.has(normalized as TrackerIconKind) ? (normalized as TrackerIconKind) : null;
};

const parseTrackerIconMapObject = (raw: unknown): TrackerIconMap => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    return Object.entries(raw as Record<string, unknown>).reduce<TrackerIconMap>((acc, [key, kindValue]) => {
        const trackerId = Number(key);
        const kind = normalizeTrackerIconKind(kindValue);
        if (Number.isInteger(trackerId) && trackerId > 0 && kind) {
            acc[trackerId] = kind;
        }
        return acc;
    }, {});
};

export const parseTrackerIconMap = (value: unknown): TrackerIconMap => {
    if (!value) return {};

    if (typeof value === 'string') {
        try {
            return parseTrackerIconMapObject(JSON.parse(value) as unknown);
        } catch {
            return {};
        }
    }

    return parseTrackerIconMapObject(value);
};

const matchesTrackerName = (trackerName: string | undefined, kind: Exclude<TrackerIconKind, 'task'>) => {
    const lowerName = trackerName?.toLowerCase() ?? '';
    return TRACKER_NAME_KEYWORDS[kind].some((keyword) => lowerName.includes(keyword.toLowerCase()));
};

export const resolveTrackerIconKind = (
    trackerId: number | undefined,
    trackerName: string | undefined,
    trackerIconMap: TrackerIconMap = {}
): TrackerIconKind => {
    if (typeof trackerId === 'number' && Number.isFinite(trackerId)) {
        const mapped = trackerIconMap[trackerId];
        if (mapped) return mapped;
    }

    if (matchesTrackerName(trackerName, 'bug')) return 'bug';
    if (matchesTrackerName(trackerName, 'feature')) return 'feature';
    if (matchesTrackerName(trackerName, 'support')) return 'support';

    return DEFAULT_TRACKER_ICON_KIND;
};
