import React from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useUIStore } from '../stores/UIStore';
import type { CustomFieldMeta } from '../types/editMeta';
import { i18n } from '../utils/i18n';
import { designTokens } from '../styles/designTokens';
import { formatDate, getDateFormat, getCurrentLocale } from '../utils/dateUtils';

const DEFAULT_CONTROL_HEIGHT = 24;

const getResolvedControlHeight = (controlHeight?: number) => controlHeight ?? DEFAULT_CONTROL_HEIGHT;

const buildControlStyle = ({
    controlHeight,
    fontSize = 13,
    width = '100%',
    padding = '0 8px',
    border,
    borderRadius = 4
}: {
    controlHeight?: number;
    fontSize?: number;
    width?: React.CSSProperties['width'];
    padding?: React.CSSProperties['padding'];
    border: string;
    borderRadius?: React.CSSProperties['borderRadius'];
}): React.CSSProperties => {
    const resolvedHeight = getResolvedControlHeight(controlHeight);
    return {
        boxSizing: 'border-box',
        margin: 0,
        width,
        height: resolvedHeight,
        lineHeight: `${Math.max(resolvedHeight - 2, 18)}px`,
        fontSize,
        padding,
        border,
        borderRadius
    };
};

export const SubjectEditor: React.FC<{
    initialValue: string;
    onCommit: (value: string) => Promise<void>;
    onCancel: () => void;
    controlHeight?: number;
}> = ({ initialValue, onCommit, onCancel, controlHeight }) => {
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
                    style={buildControlStyle({
                        controlHeight,
                        border: error ? `1px solid ${designTokens.controlErrorBorder}` : `1px solid ${designTokens.controlBorder}`
                    })}
                />
                {saving ? <span style={{ fontSize: 12, color: designTokens.controlLoadingFg }}>{i18n.t('label_loading') || '...'}</span> : null}
            </div>
            {error ? <div style={{ fontSize: 12, color: designTokens.controlErrorFg }}>{error}</div> : null}
        </div>
    );
};

export const SelectEditor: React.FC<{
    value: number | null;
    options: { id: number; name: string }[];
    includeUnassigned?: boolean;
    emptyOptionLabel?: string;
    onCommit: (value: number | null) => Promise<void>;
    onCancel: () => void;
    controlHeight?: number;
}> = ({ value, options, includeUnassigned, emptyOptionLabel, onCommit, onCancel, controlHeight }) => {
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
                    placeholder={i18n.t('label_search') || 'Search...'}
                    style={buildControlStyle({
                        controlHeight,
                        fontSize: 12,
                        border: `1px solid ${designTokens.controlBorder}`
                    })}
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
                    const container = e.currentTarget.parentElement;
                    if (container && !container.contains(e.relatedTarget as Node)) {
                        onCancel();
                    }
                }}
                disabled={saving}
            style={buildControlStyle({
                controlHeight,
                padding: '0 24px 0 8px',
                border: error ? `1px solid ${designTokens.controlErrorBorder}` : `1px solid ${designTokens.controlBorder}`
            })}
        >
                {includeUnassigned ? <option value="">{emptyOptionLabel || i18n.t('label_unassigned') || 'Unassigned'}</option> : null}
                {filtered.map((o) => (
                    <option key={o.id} value={String(o.id)}>{o.name}</option>
                ))}
            </select>
            {error ? <div style={{ fontSize: 12, color: designTokens.controlErrorFg }}>{error}</div> : null}
        </div>
    );
};

export const DoneRatioEditor: React.FC<{
    initialValue: number;
    onCommit: (value: number) => Promise<void>;
    onCancel: () => void;
    controlHeight?: number;
}> = ({ initialValue, onCommit, onCancel, controlHeight }) => {
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
                    style={buildControlStyle({
                        controlHeight,
                        width: '54px',
                        border: error ? `1px solid ${designTokens.controlErrorBorder}` : `1px solid ${designTokens.controlBorder}`
                    })}
                />
                <span style={{ fontSize: 12, color: designTokens.controlFg }}>%</span>
                {saving ? <span style={{ fontSize: 12, color: designTokens.controlLoadingFg }}>{i18n.t('label_loading') || '...'}</span> : null}
            </div>
            {error ? <div style={{ fontSize: 12, color: designTokens.controlErrorFg }}>{error}</div> : null}
        </div>
    );
};

export const EstimatedHoursEditor: React.FC<{
    initialValue: number;
    onCommit: (value: number) => Promise<void>;
    onCancel: () => void;
    controlHeight?: number;
}> = ({ initialValue, onCommit, onCancel, controlHeight }) => {
    const [value, setValue] = React.useState(String(initialValue));
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const commit = async () => {
        const numVal = Number(value);
        if (Number.isNaN(numVal) || numVal < 0) {
            setError(i18n.t('label_must_be_positive_number') || 'Must be 0 or greater');
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
                    step={0.5}
                    value={value}
                    disabled={saving}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') onCancel();
                        if (e.key === 'Enter') void commit();
                    }}
                    onBlur={() => {
                        const numVal = Number(value);
                        if (Number.isNaN(numVal) || numVal < 0 || numVal === initialValue) {
                            onCancel();
                        } else {
                            void commit();
                        }
                    }}
                    style={buildControlStyle({
                        controlHeight,
                        width: '72px',
                        border: error ? `1px solid ${designTokens.controlErrorBorder}` : `1px solid ${designTokens.controlBorder}`
                    })}
                />
                <span style={{ fontSize: 12, color: designTokens.controlFg }}>h</span>
                {saving ? <span style={{ fontSize: 12, color: designTokens.controlLoadingFg }}>{i18n.t('label_loading') || '...'}</span> : null}
            </div>
            {error ? <div style={{ fontSize: 12, color: designTokens.controlErrorFg }}>{error}</div> : null}
        </div>
    );
};

const CustomDateInput = React.forwardRef<HTMLDivElement, { value: string; onClick?: () => void; controlHeight: number }>(
    ({ value, onClick, controlHeight }, ref) => (
        <div
            ref={ref}
            onClick={onClick}
            style={{
                color: designTokens.textMuted,
                padding: 0,
                fontSize: 13,
                lineHeight: `${Math.max(controlHeight - 2, 18)}px`,
                width: '100%',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
            }}
        >
            {value ? formatDate(new Date(value)) : '-'}
        </div>
    )
);
CustomDateInput.displayName = 'CustomDateInput';

export const DueDateEditor: React.FC<{
    initialValue: string;
    onCommit: (value: string) => Promise<void> | void;
    onCancel: () => void;
    min?: string;
    max?: string;
    controlHeight?: number;
}> = ({ initialValue, onCommit, onCancel, min, max, controlHeight }) => {
    const [saving, setSaving] = React.useState(false);
    const resolvedControlHeight = getResolvedControlHeight(controlHeight);

    const parseValue = (val: string) => {
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    };

    const formatDate = (d: Date | null) => {
        if (!d) return '';
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

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

    const startDate = parseValue(initialValue);
    const minDate = parseValue(min ?? '');
    const maxDate = parseValue(max ?? '');

    return (
        <div
            style={{
                width: '100%',
                height: resolvedControlHeight,
                position: 'relative',
                display: 'flex',
                alignItems: 'center'
            }}
        >
            <DatePicker
                selected={startDate}
                onChange={(date: Date | null) => {
                    if (!date) {
                        void commit('');
                        return;
                    }
                    void commit(formatDate(date));
                }}
                onClickOutside={onCancel}
                minDate={minDate || undefined}
                maxDate={maxDate || undefined}
                portalId="root"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                autoFocus
                startOpen
                calendarClassName="minimax-datepicker"
                disabled={saving}
                dateFormat={getDateFormat()}
                locale={getCurrentLocale()}
                customInput={<CustomDateInput value={initialValue} controlHeight={resolvedControlHeight} />}
            >
                <div className="minimax-datepicker-footer">
                    <button
                        type="button"
                        className="minimax-datepicker-btn"
                        onClick={(e) => {
                            e.preventDefault();
                            void commit(formatDate(new Date()));
                        }}
                    >
                        {i18n.t('label_today') || 'Today'}
                    </button>
                    <button
                        type="button"
                        className="minimax-datepicker-btn minimax-datepicker-btn--clear"
                        onClick={(e) => {
                            e.preventDefault();
                            void commit('');
                        }}
                    >
                        {i18n.t('button_clear') || 'Clear'}
                    </button>
                </div>
            </DatePicker>
        </div>
    );
};

export const CustomFieldEditor: React.FC<{
    customField: CustomFieldMeta;
    initialValue: string | null;
    onCommit: (value: string | null) => Promise<void>;
    onCancel: () => void;
    controlHeight?: number;
}> = ({ customField, initialValue, onCommit, onCancel, controlHeight }) => {
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
                    style={buildControlStyle({
                        controlHeight,
                        padding: '0 24px 0 8px',
                        border: error ? `1px solid ${designTokens.controlErrorBorder}` : `1px solid ${designTokens.controlBorder}`
                    })}
                >
                    {!customField.isRequired ? <option value="">-</option> : null}
                    {possibleValues.map((pv) => (
                        <option key={pv} value={pv}>{pv}</option>
                    ))}
                </select>
                {saving ? <div style={{ fontSize: 12, color: designTokens.controlLoadingFg }}>{i18n.t('label_loading') || 'Saving...'}</div> : null}
                {error ? <div style={{ fontSize: 12, color: designTokens.controlErrorFg }}>{error}</div> : null}
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
                    onBlur={() => {
                        if (value === (initialValue ?? '')) {
                            onCancel();
                        } else {
                            void commit(value);
                        }
                    }}
                />
                {saving ? <span style={{ fontSize: 12, color: designTokens.controlLoadingFg }}>{i18n.t('label_loading') || 'Saving...'}</span> : null}
                {error ? <span style={{ fontSize: 12, color: designTokens.controlErrorFg }}>{error}</span> : null}
            </div>
        );
    }

    if (customField.fieldFormat === 'date') {
        return (
            <DueDateEditor
                initialValue={value}
                onCancel={onCancel}
                controlHeight={controlHeight}
                onCommit={async (next) => {
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
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void commit(value);
                    }}
                    onBlur={() => {
                        if (value === (initialValue ?? '')) {
                            onCancel();
                        } else {
                            void commit(value);
                        }
                    }}
                    style={{ fontSize: 13, padding: '6px 8px', border: error ? `1px solid ${designTokens.controlErrorBorder}` : `1px solid ${designTokens.controlBorder}`, borderRadius: 4, resize: 'vertical' }}
                />
            ) : (
                <input
                    type={inputType}
                    value={value}
                    disabled={saving}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') onCancel();
                        if (e.key === 'Enter') void commit(value);
                    }}
                    onBlur={() => {
                        if (value === (initialValue ?? '')) {
                            onCancel();
                        } else {
                            void commit(value);
                        }
                    }}
                    style={buildControlStyle({
                        controlHeight,
                        border: error ? `1px solid ${designTokens.controlErrorBorder}` : `1px solid ${designTokens.controlBorder}`
                    })}
                />
            )}
            {saving ? <div style={{ fontSize: 12, color: designTokens.controlLoadingFg }}>{i18n.t('label_loading') || 'Saving...'}</div> : null}
            {error ? <div style={{ fontSize: 12, color: designTokens.controlErrorFg }}>{error}</div> : null}
        </div>
    );
};
