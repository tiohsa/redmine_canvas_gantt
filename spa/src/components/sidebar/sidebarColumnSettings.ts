export type ColumnConfig = {
    key: string;
    visible: boolean;
};

export type SidebarColumnDefinition = {
    key: string;
    label: string;
};

export const DEFAULT_COLUMN_KEYS = [
    'id',
    'subject',
    'notification',
    'project',
    'tracker',
    'status',
    'priority',
    'assignee',
    'author',
    'startDate',
    'dueDate',
    'estimatedHours',
    'ratioDone',
    'spentHours',
    'version',
    'category',
    'createdOn',
    'updatedOn'
] as const;

export const DEFAULT_VISIBLE_COLUMN_KEYS = new Set(['id', 'notification', 'status', 'assignee', 'startDate', 'dueDate', 'ratioDone']);

export const buildColumnSettingsFromVisibleKeys = (
    definitions: SidebarColumnDefinition[],
    visibleKeys: string[]
): ColumnConfig[] => {
    const visibleSet = new Set(visibleKeys);
    return definitions.map((definition) => ({
        key: definition.key,
        visible: visibleSet.has(definition.key)
    }));
};

export const normalizeColumnSettings = (
    definitions: SidebarColumnDefinition[],
    settings?: ColumnConfig[] | string[]
): ColumnConfig[] => {
    const knownKeys = definitions.map((column) => column.key);
    const defaultVisibleKeys = DEFAULT_VISIBLE_COLUMN_KEYS;
    const defaultSettings = knownKeys.map((key) => ({
        key,
        visible: defaultVisibleKeys.has(key)
    }));

    if (!settings || settings.length === 0) return defaultSettings;

    const fromConfigs = settings.length > 0 && typeof settings[0] !== 'string';
    if (fromConfigs) {
        const configs = settings as ColumnConfig[];
        const byKey = new Map(configs.map((entry) => [entry.key, entry.visible]));
        const orderedKnown = configs
            .filter((entry) => knownKeys.includes(entry.key))
            .map((entry) => ({ key: entry.key, visible: Boolean(entry.visible) }));
        const orderedUnknown = configs
            .filter((entry) => !knownKeys.includes(entry.key))
            .map((entry) => ({ key: entry.key, visible: Boolean(entry.visible) }));
        const missingKnown = knownKeys
            .filter((key) => !orderedKnown.some((entry) => entry.key === key))
            .map((key) => ({ key, visible: defaultVisibleKeys.has(key) }));
        return [...orderedKnown, ...missingKnown, ...orderedUnknown].map((entry) => ({
            key: entry.key,
            visible: byKey.has(entry.key) ? Boolean(byKey.get(entry.key)) : entry.visible
        }));
    }

    const visibleKeys = new Set((settings as string[]).filter((key) => knownKeys.includes(key)));
    return knownKeys.map((key) => ({
        key,
        visible: visibleKeys.size === 0 ? defaultVisibleKeys.has(key) : visibleKeys.has(key)
    }));
};

export const resolveVisibleColumnKeys = (settings: ColumnConfig[], pinnedKeys: string[] = []) => {
    const pinned = pinnedKeys.filter(Boolean);
    const visible = settings.filter((entry) => entry.visible).map((entry) => entry.key);
    const result: string[] = [];

    pinned.forEach((key) => {
        if (!result.includes(key)) result.push(key);
    });

    visible.forEach((key) => {
        if (!result.includes(key)) result.push(key);
    });

    return result;
};

export const moveColumnSetting = (settings: ColumnConfig[], key: string, direction: 'up' | 'down'): ColumnConfig[] => {
    const index = settings.findIndex((entry) => entry.key === key);
    const current = index === -1
        ? [...settings, { key, visible: false }]
        : [...settings];
    const currentIndex = current.findIndex((entry) => entry.key === key);
    if (currentIndex === -1) return settings;
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= current.length) return settings;

    const next = [...current];
    const [item] = next.splice(currentIndex, 1);
    next.splice(nextIndex, 0, item);
    return next;
};

export const toggleColumnSetting = (settings: ColumnConfig[], key: string): ColumnConfig[] =>
    settings.some((entry) => entry.key === key)
        ? settings.map((entry) => entry.key === key ? { ...entry, visible: !entry.visible } : entry)
        : [...settings, { key, visible: true }];

export const resetColumnSettings = (definitions: SidebarColumnDefinition[]) =>
    buildColumnSettingsFromVisibleKeys(definitions, ['id', 'subject', 'notification', 'status', 'assignee', 'startDate', 'dueDate', 'ratioDone']);

export const mergeColumnSettings = (
    baseSettings: ColumnConfig[],
    definitions: SidebarColumnDefinition[],
    visibleKeys: string[]
): ColumnConfig[] => {
    const knownKeys = definitions.map((column) => column.key);
    const visibleSet = new Set(visibleKeys);
    const baseOrder = baseSettings.map((entry) => entry.key).filter((key) => knownKeys.includes(key));
    const orderedKeys = [
        ...baseOrder,
        ...knownKeys.filter((key) => !baseOrder.includes(key))
    ];
    const baseVisibility = new Map(baseSettings.map((entry) => [entry.key, Boolean(entry.visible)]));

    return orderedKeys.map((key) => ({
        key,
        visible: visibleKeys.length > 0
            ? visibleSet.has(key)
            : (baseVisibility.get(key) ?? false)
    }));
};
