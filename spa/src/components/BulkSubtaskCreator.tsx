import React from 'react';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';
import { apiClient } from '../api/client';

interface BulkSubtaskCreatorProps {
    parentId?: string;
    onTasksCreated?: () => void;
    hideStandaloneButton?: boolean;
    showTopBorder?: boolean;
    trackerOptions?: Array<{ id: number; name: string }>;
    defaultTrackerId?: number;
    onContentChange?: (hasSubjects: boolean) => void;
}
export interface BulkSubtaskRow { subject: string; tracker_id?: number }

const MIN_TABLE_ROWS = 3;

const createEmptyRows = (defaultTrackerId?: number): BulkSubtaskRow[] => (
    Array.from({ length: MIN_TABLE_ROWS }, () => ({ subject: '', tracker_id: defaultTrackerId }))
);

export interface BulkSubtaskCreatorHandle {
    createSubtasks: (newParentId?: string) => Promise<{ success: number; fail: number }>;
    hasSubjects: () => boolean;
    resetCycle: () => void;
}

export const BulkSubtaskCreator = React.forwardRef<BulkSubtaskCreatorHandle, BulkSubtaskCreatorProps>(
    ({ parentId, onTasksCreated, hideStandaloneButton, showTopBorder = true, trackerOptions = [], defaultTrackerId, onContentChange }, ref) => {
        const [expanded, setExpanded] = React.useState(false);
        const [inputMode, setInputMode] = React.useState<'text' | 'table'>('text');
        const [subjects, setSubjects] = React.useState('');
        const [rows, setRows] = React.useState<BulkSubtaskRow[]>(() => createEmptyRows(defaultTrackerId));
        const [textTrackerId, setTextTrackerId] = React.useState(defaultTrackerId);
        const [loading, setLoading] = React.useState(false);
        const [completed, setCompleted] = React.useState(false);
        const addNotification = useUIStore(state => state.addNotification);
        const tasks = useTaskStore(state => state.tasks);
        const operationIssueIds = React.useMemo(
            () => tasks.filter(task => !task.isContextOnly).map(task => task.id),
            [tasks]
        );
        const hasSubjects = React.useCallback(() => (
            inputMode === 'table'
                ? rows.some(row => row.subject.trim().length > 0)
                : subjects.split('\n').some(subject => subject.trim().length > 0)
        ), [inputMode, rows, subjects]);

        React.useEffect(() => {
            onContentChange?.(hasSubjects());
        }, [hasSubjects, onContentChange]);

        const handleInputModeChange = (nextMode: 'text' | 'table') => {
            if (nextMode === inputMode) return;

            if (nextMode === 'table') {
                const textSubjects = subjects.split('\n');
                setRows(current => {
                    const rowCount = Math.max(MIN_TABLE_ROWS, current.length, textSubjects.length);
                    return Array.from({ length: rowCount }, (_, index) => ({
                        subject: textSubjects[index] ?? '',
                        tracker_id: current[index]?.tracker_id ?? defaultTrackerId
                    }));
                });
            } else {
                let lastSubjectIndex = rows.length;
                while (lastSubjectIndex > 0 && rows[lastSubjectIndex - 1].subject === '') {
                    lastSubjectIndex -= 1;
                }
                setSubjects(rows.slice(0, lastSubjectIndex).map(row => row.subject).join('\n'));
            }

            setInputMode(nextMode);
        };

        const createSubtasks = async (newParentId?: string) => {
            const subtasks: BulkSubtaskRow[] = inputMode === 'table'
                ? rows.filter(row => row.subject.trim()).map(row => ({ subject: row.subject.trim(), ...(row.tracker_id ? { tracker_id: row.tracker_id } : {}) }))
                : subjects.split('\n').map(subject => subject.trim()).filter(Boolean).map(subject => ({ subject, ...(textTrackerId ? { tracker_id: textTrackerId } : {}) }));
            if (subtasks.length === 0) return { success: 0, fail: 0 };

            setLoading(true);
            let successCount = 0;
            let failCount = 0;

            try {
                const targetParentId = newParentId || parentId;
                if (!targetParentId) {
                    addNotification(i18n.t('label_failed_to_save') || 'Failed to save', 'error');
                    return { success: 0, fail: subtasks.length };
                }

                const bulkPayload = inputMode === 'table' || textTrackerId
                    ? { subtasks }
                    : { subjects: subtasks.map(row => row.subject) };
                const result = await apiClient.bulkCreateSubtasks({
                    parentId: targetParentId,
                    ...bulkPayload,
                    operationIssueIds: newParentId && !operationIssueIds.includes(targetParentId)
                        ? [...operationIssueIds, targetParentId]
                        : operationIssueIds
                });
                successCount = result.successCount;
                failCount = result.failCount;

                if (successCount > 0) {
                    addNotification(i18n.t('label_bulk_subtask_count_success', { count: successCount }) || `${successCount} tasks created.`, 'success');
                }

                if (successCount > 0 && failCount === 0) {
                    setSubjects('');
                    setRows(createEmptyRows(defaultTrackerId));
                    setTextTrackerId(defaultTrackerId);
                    setExpanded(false);
                    setCompleted(true);
                    onTasksCreated?.();
                }

                if (failCount > 0) {
                    const firstError = result.results.find((row) => row.status === 'error' && row.errors && row.errors.length > 0);
                    const detail = firstError?.errors?.[0];
                    const defaultMessage = i18n.t('label_bulk_subtask_count_failed', { count: failCount }) || `${failCount} tasks failed.`;
                    addNotification(detail ? `${defaultMessage} (${detail})` : defaultMessage, 'error');
                }
                return { success: successCount, fail: failCount };
            } catch (e) {
                console.error(e);
                addNotification(i18n.t('label_failed_to_save') || 'Failed to save', 'error');
                return { success: successCount, fail: failCount };
            } finally {
                setLoading(false);
            }
        };

        React.useImperativeHandle(ref, () => ({
            createSubtasks,
            hasSubjects,
            resetCycle: () => setCompleted(false)
        }));

        const handleCreateStandalone = async () => {
            await createSubtasks();
        };

        return (
            <div style={{
                marginTop: showTopBorder ? 12 : 0,
                borderTop: showTopBorder ? '1px solid #e0e0e0' : 'none',
                paddingTop: 8
            }}>
                <div
                    onClick={() => {
                        if (!completed && !loading) setExpanded(!expanded);
                    }}
                    aria-disabled={completed || loading}
                    style={{ display: 'flex', alignItems: 'center', cursor: completed || loading ? 'default' : 'pointer', opacity: completed ? 0.55 : 1, userSelect: 'none', marginBottom: 8 }}
                >
                    <div style={{
                        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                        marginRight: 6,
                        fontSize: 10,
                        color: '#666'
                    }}>
                        ▶
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                        {i18n.t('label_bulk_subtask_creation') || 'Bulk Ticket Creation'}
                    </div>
                </div>

                {expanded && (
                    <div style={{ paddingLeft: 16 }}>
                        <div
                            style={{
                                display: 'inline-flex',
                                gap: 2,
                                padding: 4,
                                marginBottom: 10,
                                background: '#f0f0f0',
                                border: '1px solid #e5e7eb',
                                borderRadius: 13
                            }}
                            role="group"
                            aria-label={i18n.t('label_bulk_subtask_mode') || 'Input mode'}
                        >
                            <button
                                type="button"
                                onClick={() => handleInputModeChange('table')}
                                disabled={loading || completed}
                                aria-pressed={inputMode === 'table'}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 7,
                                    padding: '5px 10px',
                                    border: 'none',
                                    borderRadius: 8,
                                    background: inputMode === 'table' ? '#ffffff' : 'transparent',
                                    boxShadow: inputMode === 'table' ? '0 2px 6px rgba(0, 0, 0, 0.10)' : 'none',
                                    color: '#45515e',
                                    fontFamily: 'inherit',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: loading || completed ? 'default' : 'pointer'
                                }}
                            >
                                <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>▤</span>
                                {i18n.t('label_bulk_subtask_table_mode') || 'Table input'}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleInputModeChange('text')}
                                disabled={loading || completed}
                                aria-pressed={inputMode === 'text'}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 7,
                                    padding: '5px 10px',
                                    border: 'none',
                                    borderRadius: 8,
                                    background: inputMode === 'text' ? '#ffffff' : 'transparent',
                                    boxShadow: inputMode === 'text' ? '0 2px 6px rgba(0, 0, 0, 0.10)' : 'none',
                                    color: '#18181b',
                                    fontFamily: 'inherit',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: loading || completed ? 'default' : 'pointer'
                                }}
                            >
                                <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>≡</span>
                                {i18n.t('label_bulk_subtask_text_mode') || 'Text input'}
                            </button>
                        </div>
                        {inputMode === 'table' ? (
                            <table data-testid="bulk-subtask-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                                <thead><tr><th style={{ textAlign: 'left' }}>#</th><th style={{ textAlign: 'left' }}>{i18n.t('label_bulk_subtask_subject') || 'Subject'}</th><th /></tr></thead>
                                <tbody>
                                    {rows.map((row, index) => (
                                        <tr key={index}>
                                            <td>{index + 1}</td>
                                            <td><input value={row.subject} onChange={(e) => setRows(current => current.map((value, i) => i === index ? { ...value, subject: e.target.value } : value))} disabled={loading} aria-label={`${i18n.t('label_bulk_subtask_subject') || 'Subject'} ${index + 1}`} style={{ width: '100%', boxSizing: 'border-box' }} /></td>
                                            <td>{trackerOptions.length > 0 && <select aria-label={`${i18n.t('field_tracker') || 'Tracker'} ${index + 1}`} value={row.tracker_id ?? ''} onChange={(e) => setRows(current => current.map((value, i) => i === index ? { ...value, tracker_id: e.target.value ? Number(e.target.value) : undefined } : value))} disabled={loading}><option value="">{i18n.t('label_default') || 'Default'}</option>{trackerOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>}</td>
                                            <td><button type="button" onClick={() => setRows(current => current.filter((_, i) => i !== index))} disabled={loading || rows.length === 1} aria-label={`${i18n.t('label_bulk_subtask_delete_row') || 'Delete row'} ${index + 1}`}>×</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <>
                                {trackerOptions.length > 0 && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, color: '#45515e', fontSize: 13, fontWeight: 600 }}>
                                        <span>{i18n.t('field_tracker') || 'Tracker'}</span>
                                        <select
                                            aria-label={i18n.t('field_tracker') || 'Tracker'}
                                            value={textTrackerId ?? ''}
                                            onChange={(event) => setTextTrackerId(event.target.value ? Number(event.target.value) : undefined)}
                                            disabled={loading}
                                            style={{
                                                width: 275,
                                                maxWidth: 'calc(100% - 80px)',
                                                height: 32,
                                                padding: '4px 32px 4px 10px',
                                                border: '1px solid #d1d5db',
                                                borderRadius: 4,
                                                background: '#ffffff',
                                                color: '#222222',
                                                fontFamily: 'inherit',
                                                fontSize: 13
                                            }}
                                        >
                                            <option value="">{i18n.t('label_default') || 'Default'}</option>
                                            {trackerOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                                        </select>
                                    </label>
                                )}
                                <textarea
                                    data-testid="bulk-subtask-subjects"
                                    value={subjects}
                                    onChange={(e) => setSubjects(e.target.value)}
                                    placeholder={i18n.t('placeholder_bulk_subtask_creation') || "Enter one ticket subject per line..."}
                                    disabled={loading}
                                    rows={5}
                                    style={{ width: '100%', padding: 12, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, color: '#45515e', border: '1px solid #d1d5db', borderRadius: 8, resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' }}
                                />
                            </>
                        )}
                        {inputMode === 'table' && <button type="button" onClick={() => setRows(current => [...current, { subject: '', tracker_id: defaultTrackerId }])} disabled={loading}>{i18n.t('label_bulk_subtask_add_row') || '+ Add row'}</button>}
                        {!hideStandaloneButton && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    data-testid="bulk-subtask-create-button"
                                    onClick={handleCreateStandalone}
                                    disabled={loading || !(inputMode === 'table' ? rows.some(row => row.subject.trim()) : subjects.trim())}
                                    style={{
                                        padding: '6px 12px',
                                        background: loading || !subjects.trim() ? '#ccc' : '#1a73e8',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: 4,
                                        fontSize: 13,
                                        cursor: loading || !subjects.trim() ? 'default' : 'pointer'
                                    }}
                                >
                                    {loading ? (i18n.t('label_loading') || 'Creating...') : (i18n.t('button_create') || 'Create')}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }
);
