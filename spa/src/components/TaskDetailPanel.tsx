import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { useEditMetaStore } from '../stores/EditMetaStore';
import { i18n } from '../utils/i18n';
import type { Task } from '../types';
import type { InlineEditSettings, TaskEditMeta, CustomFieldMeta } from '../types/editMeta';
import { InlineEditService } from '../services/InlineEditService';

type FieldKey = 'subject' | 'assignedToId' | 'statusId' | 'doneRatio' | 'dueDate' | `cf:${number}`;

const getSettings = (): InlineEditSettings => {
    return (window as unknown as { RedmineCanvasGantt?: { settings?: InlineEditSettings } }).RedmineCanvasGantt?.settings ?? {};
};

const isEnabled = (settings: InlineEditSettings, key: keyof InlineEditSettings, defaultValue: boolean) => {
    const value = settings[key];
    if (value === undefined) return defaultValue;
    return String(value) === '1';
};

const toDateInputValue = (timestamp: number | undefined): string => {
    if (timestamp === undefined || !Number.isFinite(timestamp)) return '';
    try {
        return new Date(timestamp).toISOString().split('T')[0];
    } catch (e) {
        return '';
    }
};

const toTimestampFromDateInput = (value: string): number | null => {
    if (!value) return null;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : null;
};

const InlineRow: React.FC<{
    label: string;
    value: React.ReactNode;
    editable: boolean;
    fieldKey: FieldKey;
    editor: (opts: { onClose: () => void }) => React.ReactNode;
}> = ({ label, value, editable, fieldKey, editor }) => {
    const activeInlineEdit = useUIStore((s) => s.activeInlineEdit);
    const setActiveInlineEdit = useUIStore((s) => s.setActiveInlineEdit);
    const selectedTaskId = useTaskStore((s) => s.selectedTaskId);

    const isActive = Boolean(
        selectedTaskId &&
        activeInlineEdit?.taskId === selectedTaskId &&
        activeInlineEdit?.field === fieldKey &&
        (activeInlineEdit.source ?? 'panel') === 'panel'
    );

    const open = () => {
        if (!editable || !selectedTaskId) return;
        setActiveInlineEdit({ taskId: selectedTaskId, field: fieldKey, source: 'panel' });
    };

    const close = () => setActiveInlineEdit(null);

    return (
        <div
            style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, alignItems: 'center', padding: '6px 0', cursor: editable ? 'pointer' : 'default' }}
            onClick={() => !isActive && open()}
        >
            <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
            <div style={{ minWidth: 0 }}>
                {isActive ? editor({ onClose: close }) : <div style={{ fontSize: 13, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>}
            </div>
        </div>
    );
};

const findTask = (allTasks: Task[], taskId: string | null) => {
    if (!taskId) return null;
    return allTasks.find((t) => t.id === taskId) ?? null;
};

const getAssigneeLabel = (task: Task) => {
    if (task.assignedToName) return task.assignedToName;
    if (task.assignedToId === undefined) return i18n.t('label_unassigned') || 'Unassigned';
    return i18n.t('label_unassigned') || 'Unassigned';
};

export const TaskDetailPanel: React.FC = () => {
    const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
    const allTasks = useTaskStore((s) => s.allTasks);
    const setActiveInlineEdit = useUIStore((s) => s.setActiveInlineEdit);
    const addNotification = useUIStore((s) => s.addNotification);
    const activeInlineEdit = useUIStore((s) => s.activeInlineEdit);

    const metaByTaskId = useEditMetaStore((s) => s.metaByTaskId);
    const loadingTaskId = useEditMetaStore((s) => s.loadingTaskId);
    const error = useEditMetaStore((s) => s.error);
    const fetchEditMeta = useEditMetaStore((s) => s.fetchEditMeta);
    const clearError = useEditMetaStore((s) => s.clearError);

    const task = findTask(allTasks, selectedTaskId);
    const meta: TaskEditMeta | null = selectedTaskId ? (metaByTaskId[selectedTaskId] ?? null) : null;

    const settings = React.useMemo(() => getSettings(), []);

    React.useEffect(() => {
        if (!selectedTaskId) {
            setActiveInlineEdit(null);
        } else if (activeInlineEdit && activeInlineEdit.taskId !== selectedTaskId) {
            setActiveInlineEdit(null);
        }
        clearError();
        if (!selectedTaskId) return;
        void fetchEditMeta(selectedTaskId).catch(() => {
            addNotification(i18n.t('label_failed_to_load_edit_options') || 'Failed to load edit options', 'error');
        });
    }, [activeInlineEdit, addNotification, clearError, fetchEditMeta, selectedTaskId, setActiveInlineEdit]);

    const saveFields = React.useCallback(async (taskId: string, optimistic: Partial<Task>, rollback: Partial<Task>, fields: Record<string, unknown>) => {
        await InlineEditService.saveTaskFields({
            taskId,
            optimisticTaskUpdates: optimistic,
            rollbackTaskUpdates: rollback,
            fields
        });
    }, []);

    const enabledSubject = isEnabled(settings, 'inline_edit_subject', true);
    const enabledAssignee = isEnabled(settings, 'inline_edit_assigned_to', true);
    const enabledStatus = isEnabled(settings, 'inline_edit_status', true);
    const enabledDoneRatio = isEnabled(settings, 'inline_edit_done_ratio', true);
    const enabledDueDate = isEnabled(settings, 'inline_edit_due_date', true);
    const enabledCustomFields = isEnabled(settings, 'inline_edit_custom_fields', false);

    if (!selectedTaskId || !task) {
        return (
            <div style={{ padding: 12, color: '#666', fontSize: 13 }}>
                {i18n.t('label_select_task_to_view_details') || 'Select a task to view details.'}
            </div>
        );
    }

    const isLoading = loadingTaskId === selectedTaskId && !meta;

    return (
        <div style={{ padding: 12, borderTop: '1px solid #e0e0e0', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#777' }}>#{task.id}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.subject}
                    </div>
                </div>
                <a href={`/issues/${task.id}/edit`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1a73e8', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    {i18n.t('button_edit')}
                </a>
            </div>

            {isLoading ? (
                <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || 'Loading...'}</div>
            ) : null}

            {error ? (
                <div style={{ marginTop: 8, fontSize: 12, color: '#d32f2f' }}>{error}</div>
            ) : null}

            <div style={{ marginTop: 8 }}>
                {enabledSubject ? (
                    <InlineRow
                        label={i18n.t('field_subject') || 'Subject'}
                        value={task.subject}
                        editable={Boolean(meta?.editable.subject)}
                        fieldKey="subject"
                        editor={({ onClose }) => (
                            <SubjectEditor
                                initialValue={task.subject}
                                onCancel={onClose}
                                onCommit={async (next) => {
                                    await saveFields(task.id, { subject: next }, { subject: task.subject }, { subject: next });
                                    onClose();
                                }}
                            />
                        )}
                    />
                ) : null}

                {enabledAssignee ? (
                    <InlineRow
                        label={i18n.t('field_assigned_to') || 'Assignee'}
                        value={getAssigneeLabel(task)}
                        editable={Boolean(meta?.editable.assignedToId)}
                        fieldKey="assignedToId"
                        editor={({ onClose }) => (
                            <SelectEditor
                                value={task.assignedToId ?? null}
                                options={meta?.options.assignees ?? []}
                                includeUnassigned
                                onCancel={onClose}
                                onCommit={async (next) => {
                                    const prevId = task.assignedToId ?? null;
                                    const prevName = task.assignedToName;
                                    const name = next === null ? undefined : meta?.options.assignees.find((o) => o.id === next)?.name;
                                    await saveFields(
                                        task.id,
                                        { assignedToId: next ?? undefined, assignedToName: next === null ? undefined : name },
                                        { assignedToId: prevId ?? undefined, assignedToName: prevName },
                                        { assigned_to_id: next }
                                    );
                                    onClose();
                                }}
                            />
                        )}
                    />
                ) : null}

                {enabledStatus ? (
                    <InlineRow
                        label={i18n.t('field_status') || 'Status'}
                        value={meta?.options.statuses.find((s) => s.id === task.statusId)?.name ?? String(task.statusId)}
                        editable={Boolean(meta?.editable.statusId)}
                        fieldKey="statusId"
                        editor={({ onClose }) => (
                            <SelectEditor
                                value={task.statusId}
                                options={meta?.options.statuses ?? []}
                                onCancel={onClose}
                                onCommit={async (next) => {
                                    if (next === null) return;
                                    await saveFields(task.id, { statusId: next }, { statusId: task.statusId }, { status_id: next });
                                    onClose();
                                }}
                            />
                        )}
                    />
                ) : null}

                {enabledDoneRatio ? (
                    <InlineRow
                        label={i18n.t('field_done_ratio') || 'Progress'}
                        value={`${task.ratioDone}%`}
                        editable={Boolean(meta?.editable.doneRatio)}
                        fieldKey="doneRatio"
                        editor={({ onClose }) => (
                            <DoneRatioEditor
                                initialValue={task.ratioDone}
                                onCancel={onClose}
                                onCommit={async (next) => {
                                    await saveFields(task.id, { ratioDone: next }, { ratioDone: task.ratioDone }, { done_ratio: next });
                                    onClose();
                                }}
                            />
                        )}
                    />
                ) : null}

                {enabledDueDate ? (
                    <InlineRow
                        label={i18n.t('field_due_date') || 'Due Date'}
                        value={toDateInputValue(task.dueDate)}
                        editable={Boolean(meta?.editable.dueDate)}
                        fieldKey="dueDate"
                        editor={({ onClose }) => (
                            <DueDateEditor
                                initialValue={toDateInputValue(task.dueDate)}
                                onCancel={onClose}
                                onCommit={async (next) => {
                                    const nextTs = toTimestampFromDateInput(next);
                                    if (nextTs === null) return;
                                    if (task.startDate !== undefined && Number.isFinite(task.startDate) && task.startDate! > nextTs) {
                                        addNotification(i18n.t('label_invalid_date_range') || 'Invalid date range', 'warning');
                                        return;
                                    }
                                    await saveFields(task.id, { dueDate: nextTs }, { dueDate: task.dueDate }, { due_date: next });
                                    onClose();
                                }}
                            />
                        )}
                    />
                ) : null}

                {enabledCustomFields && meta?.editable.customFieldValues && meta.options.customFields.length > 0 ? (
                    <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{i18n.t('label_custom_field_plural') || 'Custom fields'}</div>
                        {meta.options.customFields.map((cf) => (
                            <InlineRow
                                key={cf.id}
                                label={cf.name}
                                value={formatCustomFieldValue(meta, cf)}
                                editable={true}
                                fieldKey={`cf:${cf.id}`}
                                editor={({ onClose }) => (
                                    <CustomFieldEditor
                                        customField={cf}
                                        initialValue={meta.customFieldValues[String(cf.id)] ?? null}
                                        onCancel={onClose}
                                        onCommit={async (next) => {
                                            const prev = meta.customFieldValues[String(cf.id)] ?? null;
                                            useEditMetaStore.getState().setCustomFieldValue(task.id, cf.id, next);
                                            try {
                                                await saveFields(task.id, {}, {}, { custom_field_values: { [cf.id]: next ?? '' } });
                                            } catch (e) {
                                                useEditMetaStore.getState().setCustomFieldValue(task.id, cf.id, prev);
                                                throw e;
                                            }
                                            onClose();
                                        }}
                                    />
                                )}
                            />
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export const SubjectEditor: React.FC<{
    initialValue: string;
    onCommit: (value: string) => Promise<void>;
    onCancel: () => void;
}> = ({ initialValue, onCommit, onCancel }) => {
    const [value, setValue] = React.useState(initialValue);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const commit = async () => {
        const trimmed = value.trim();
        if (!trimmed) {
            setError(i18n.t('label_required') || 'Required');
            return;
        }
        if (trimmed === initialValue) {
            onCancel();
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onCommit(trimmed);
        } catch (e) {
            setError(e instanceof Error ? e.message : (i18n.t('label_failed_to_save') || 'Failed to save'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') void commit();
                        if (e.key === 'Escape') onCancel();
                    }}
                    onBlur={() => {
                        const trimmed = value.trim();
                        if (!trimmed || trimmed === initialValue) {
                            onCancel();
                        } else {
                            void commit();
                        }
                    }}
                    disabled={saving}
                    style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: error ? '1px solid #d32f2f' : '1px solid #ccc', borderRadius: 4 }}
                />
                {saving ? <span style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || '...'}</span> : null}
            </div>
            {error ? <div style={{ fontSize: 12, color: '#d32f2f' }}>{error}</div> : null}
        </div>
    );
};

export const SelectEditor: React.FC<{
    value: number | null;
    options: { id: number; name: string }[];
    includeUnassigned?: boolean;
    onCommit: (value: number | null) => Promise<void>;
    onCancel: () => void;
}> = ({ value, options, includeUnassigned, onCommit, onCancel }) => {
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [filter, setFilter] = React.useState('');

    const filtered = React.useMemo(() => {
        if (options.length <= 20) return options;
        const q = filter.trim().toLowerCase();
        if (!q) return options;
        return options.filter((o) => o.name.toLowerCase().includes(q));
    }, [filter, options]);

    const commit = async (next: number | null) => {
        if (next === value) {
            onCancel();
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onCommit(next);
        } catch (e) {
            setError(e instanceof Error ? e.message : (i18n.t('label_failed_to_save') || 'Failed to save'));
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {options.length > 20 ? (
                <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={i18n.t('label_search') || "Search..."}
                    style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }}
                    disabled={saving}
                />
            ) : null}
            <select
                value={value === null ? '' : String(value)}
                onChange={(e) => {
                    const raw = e.target.value;
                    const next = raw === '' ? null : Number(raw);
                    void commit(next);
                }}
                onBlur={(e) => {
                    // Only close if focus moves outside this component
                    const container = e.currentTarget.parentElement;
                    if (container && !container.contains(e.relatedTarget as Node)) {
                        onCancel();
                    }
                }}
                disabled={saving}
                style={{ fontSize: 13, padding: '6px 8px', border: error ? '1px solid #d32f2f' : '1px solid #ccc', borderRadius: 4 }}
            >
                {includeUnassigned ? <option value="">{i18n.t('label_unassigned') || 'Unassigned'}</option> : null}
                {filtered.map((o) => (
                    <option key={o.id} value={String(o.id)}>{o.name}</option>
                ))}
            </select>
            {error ? <div style={{ fontSize: 12, color: '#d32f2f' }}>{error}</div> : null}
        </div>
    );
};

export const DoneRatioEditor: React.FC<{
    initialValue: number;
    onCommit: (value: number) => Promise<void>;
    onCancel: () => void;
}> = ({ initialValue, onCommit, onCancel }) => {
    const [value, setValue] = React.useState(String(initialValue));
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const commit = async () => {
        const numVal = Number(value);
        if (Number.isNaN(numVal) || numVal < 0 || numVal > 100) {
            setError(i18n.t('label_must_be_0_100') || 'Must be 0-100');
            return;
        }

        if (numVal === initialValue) {
            onCancel();
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onCommit(numVal);
        } catch (e) {
            setError(e instanceof Error ? e.message : (i18n.t('label_failed_to_save') || 'Failed to save'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                    type="number"
                    min={0}
                    max={100}
                    step={10}
                    value={value}
                    disabled={saving}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') onCancel();
                        if (e.key === 'Enter') void commit();
                    }}
                    onBlur={() => {
                        const numVal = Number(value);
                        if (Number.isNaN(numVal) || numVal < 0 || numVal > 100 || numVal === initialValue) {
                            onCancel();
                        } else {
                            void commit();
                        }
                    }}
                    style={{ width: '54px', fontSize: 13, padding: '6px 8px', border: error ? '1px solid #d32f2f' : '1px solid #ccc', borderRadius: 4 }}
                />
                <span style={{ fontSize: 12, color: '#444' }}>%</span>
                {saving ? <span style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || '...'}</span> : null}
            </div>
            {error ? <div style={{ fontSize: 12, color: '#d32f2f' }}>{error}</div> : null}
        </div>
    );
};

export const DueDateEditor: React.FC<{
    initialValue: string;
    onCommit: (value: string) => Promise<void>;
    onCancel: () => void;
}> = ({ initialValue, onCommit, onCancel }) => {
    const [value, setValue] = React.useState(initialValue);
    const [saving, setSaving] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        // Auto-open the picker
        // Delay slightly to ensure layout is computed for positioning (fixes top-left issue)
        const timer = setTimeout(() => {
            if (inputRef.current && typeof inputRef.current.showPicker === 'function') {
                try {
                    inputRef.current.showPicker();
                } catch {
                    // Ignore errors
                }
            }
            inputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    const commit = async (next: string) => {
        if (next === initialValue) {
            onCancel();
            return;
        }
        setSaving(true);
        try {
            await onCommit(next);
        } catch (e) {
            useUIStore.getState().addNotification(
                e instanceof Error ? e.message : (i18n.t('label_failed_to_save') || 'Failed to save'),
                'error'
            );
            setSaving(false);
        }
    };

    const displayValue = value ? value.replace(/-/g, '/') : '';

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: '#666', padding: '0 4px', fontSize: 13 }}>{displayValue}</span>
            <input
                ref={inputRef}
                type="date"
                value={value}
                disabled={saving}
                onChange={(e) => {
                    const next = e.target.value;
                    setValue(next);
                    void commit(next);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') onCancel();
                }}
                onBlur={() => {
                    if (value === initialValue) {
                        onCancel();
                    } else {
                        void commit(value);
                    }
                }}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    border: 'none',
                    margin: 0,
                    padding: 0,
                    cursor: 'pointer'
                }}
            />
        </div>
    );
};

const formatCustomFieldValue = (meta: TaskEditMeta, customField: CustomFieldMeta) => {
    const raw = meta.customFieldValues[String(customField.id)];
    if (!raw) return '-';
    if (customField.fieldFormat === 'bool') return raw === '1' ? (i18n.t('label_yes') || 'Yes') : (i18n.t('label_no') || 'No');
    return raw;
};

export const CustomFieldEditor: React.FC<{
    customField: CustomFieldMeta;
    initialValue: string | null;
    onCommit: (value: string | null) => Promise<void>;
    onCancel: () => void;
}> = ({ customField, initialValue, onCommit, onCancel }) => {
    const [value, setValue] = React.useState(initialValue ?? '');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const validate = (next: string): string | null => {
        if (customField.isRequired && !next.trim()) return i18n.t('label_required') || 'Required';
        if (customField.maxLength && next.length > customField.maxLength) return i18n.t('label_too_long') || 'Too long';
        if (customField.minLength && next.length < customField.minLength) return i18n.t('label_too_short') || 'Too short';
        if (customField.regexp) {
            try {
                const re = new RegExp(customField.regexp);
                if (next && !re.test(next)) return i18n.t('label_invalid_format') || 'Invalid format';
            } catch {
                // ignore invalid regexp from server
            }
        }
        return null;
    };

    const commit = async (next: string) => {
        const nextError = validate(next);
        if (nextError) {
            setError(nextError);
            return;
        }
        if (next === (initialValue ?? '')) {
            onCancel();
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onCommit(next ? next : null);
        } catch (e) {
            setError(e instanceof Error ? e.message : (i18n.t('label_failed_to_save') || 'Failed to save'));
        } finally {
            setSaving(false);
        }
    };

    if (customField.fieldFormat === 'list') {
        const possibleValues = customField.possibleValues ?? [];
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <select
                    value={value}
                    disabled={saving}
                    onChange={(e) => {
                        const next = e.target.value;
                        setValue(next);
                        void commit(next);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') onCancel();
                    }}
                    onBlur={() => {
                        if (value === (initialValue ?? '')) {
                            onCancel();
                        } else {
                            void commit(value);
                        }
                    }}
                    style={{ fontSize: 13, padding: '6px 8px', border: error ? '1px solid #d32f2f' : '1px solid #ccc', borderRadius: 4 }}
                >
                    {!customField.isRequired ? <option value="">-</option> : null}
                    {possibleValues.map((pv) => (
                        <option key={pv} value={pv}>{pv}</option>
                    ))}
                </select>
                {saving ? <div style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || 'Saving...'}</div> : null}
                {error ? <div style={{ fontSize: 12, color: '#d32f2f' }}>{error}</div> : null}
            </div>
        );
    }

    if (customField.fieldFormat === 'bool') {
        const checked = value === '1';
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={checked}
                    disabled={saving}
                    onChange={(e) => {
                        const next = e.target.checked ? '1' : '0';
                        setValue(next);
                        void commit(next);
                    }}
                />
                {saving ? <span style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || '...'}</span> : null}
                {error ? <div style={{ fontSize: 12, color: '#d32f2f' }}>{error}</div> : null}
            </div>
        );
    }

    if (customField.fieldFormat === 'date') {
        return (
            <DueDateEditor
                initialValue={value}
                onCancel={onCancel}
                onCommit={async (next) => {
                    setValue(next);
                    await commit(next);
                }}
            />
        );
    }

    const inputType = customField.fieldFormat === 'int' || customField.fieldFormat === 'float' ? 'number' : 'text';
    const isText = customField.fieldFormat === 'text';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {isText ? (
                <textarea
                    value={value}
                    disabled={saving}
                    rows={3}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') onCancel();
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void commit(value);
                    }}
                    onBlur={() => {
                        if (validate(value) || value === (initialValue ?? '')) {
                            onCancel();
                        } else {
                            void commit(value);
                        }
                    }}
                    style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: error ? '1px solid #d32f2f' : '1px solid #ccc', borderRadius: 4, resize: 'vertical' }}
                />
            ) : (
                <input
                    type={inputType}
                    value={value}
                    disabled={saving}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') void commit(value);
                        if (e.key === 'Escape') onCancel();
                    }}
                    onBlur={() => {
                        if (validate(value) || value === (initialValue ?? '')) {
                            onCancel();
                        } else {
                            void commit(value);
                        }
                    }}
                    style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: error ? '1px solid #d32f2f' : '1px solid #ccc', borderRadius: 4 }}
                />
            )}
            {saving ? <div style={{ fontSize: 12, color: '#666' }}>{i18n.t('label_loading') || 'Saving...'}</div> : null}
            {error ? <div style={{ fontSize: 12, color: '#d32f2f' }}>{error}</div> : null}
        </div>
    );
};
