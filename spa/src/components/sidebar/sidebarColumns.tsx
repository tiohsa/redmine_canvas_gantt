import { i18n } from '../../utils/i18n';
import type { CustomFieldMeta } from '../../types/editMeta';
import type { Task } from '../../types';

export const CUSTOM_FIELD_COLUMN_PREFIX = 'cf:';
export const CUSTOM_FIELD_EDIT_PREFIX = 'customField:';

export type SidebarColumn = {
    key: string;
    title: string;
    width: number;
    render?: (task: Task) => React.ReactNode;
};

export const isCustomFieldColumnKey = (key: string) => key.startsWith(CUSTOM_FIELD_COLUMN_PREFIX);
export const customFieldIdFromColumnKey = (key: string) => (isCustomFieldColumnKey(key) ? key.slice(CUSTOM_FIELD_COLUMN_PREFIX.length) : null);
export const customFieldEditField = (id: string) => `${CUSTOM_FIELD_EDIT_PREFIX}${id}`;
export const customFieldIdFromEditField = (field: string) => field.startsWith(CUSTOM_FIELD_EDIT_PREFIX) ? field.slice(CUSTOM_FIELD_EDIT_PREFIX.length) : null;

export const formatCustomFieldCellValue = (task: Task, customField: CustomFieldMeta): string => {
    const raw = task.customFieldValues?.[String(customField.id)];
    if (raw === undefined || raw === null || raw === '') return '-';
    if (customField.fieldFormat === 'bool') return raw === '1' ? (i18n.t('label_yes') || 'Yes') : (i18n.t('label_no') || 'No');
    if (customField.fieldFormat === 'date') {
        const ts = new Date(raw).getTime();
        return Number.isFinite(ts) ? new Date(ts).toLocaleDateString() : raw;
    }
    return raw;
};
