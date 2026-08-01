import React from 'react';
import { useUIStore } from '../stores/UIStore';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';
import { taskMutationService } from '../services/taskMutationService';
import type { MutationMetadata } from '../api/client';

interface BulkSubtaskCreatorProps {
    parentId?: string;
    onTasksCreated?: (metadata: MutationMetadata) => void;
    hideStandaloneButton?: boolean;
    showTopBorder?: boolean;
    trackerOptions?: Array<{ id: number; name: string }>;
    defaultTrackerId?: number;
    onContentChange?: (hasSubjects: boolean) => void;
}
export interface BulkSubtaskRow { subject: string; tracker_id?: number }
interface EditableBulkSubtaskRow extends BulkSubtaskRow { id: number }

const MIN_TABLE_ROWS = 3;

const createEmptyRows = (nextRowId: () => number, defaultTrackerId?: number): EditableBulkSubtaskRow[] => (
    Array.from({ length: MIN_TABLE_ROWS }, () => ({ id: nextRowId(), subject: '', tracker_id: defaultTrackerId }))
);

const subjectsForTextMode = (rows: EditableBulkSubtaskRow[]): string =>
    rows.map(row => row.subject).join('\n').replace(/\n+$/, '');

const reconcileTextRows = (
    current: EditableBulkSubtaskRow[],
    subjects: string[],
    previousSubjectCount: number,
    nextRowId: () => number,
    defaultTrackerId?: number
): EditableBulkSubtaskRow[] => {
    const activeCurrent = current.slice(0, previousSubjectCount);
    const previousSubjects = activeCurrent.map(row => row.subject);
    let prefixLength = 0;
    while (
        prefixLength < previousSubjects.length &&
        prefixLength < subjects.length &&
        previousSubjects[prefixLength] === subjects[prefixLength]
    ) {
        prefixLength += 1;
    }

    let suffixLength = 0;
    while (
        suffixLength < previousSubjects.length - prefixLength &&
        suffixLength < subjects.length - prefixLength &&
        previousSubjects[previousSubjects.length - 1 - suffixLength] === subjects[subjects.length - 1 - suffixLength]
    ) {
        suffixLength += 1;
    }

    const prefix = activeCurrent.slice(0, prefixLength);
    const previousMiddle = activeCurrent.slice(prefixLength, activeCurrent.length - suffixLength);
    const nextMiddleSubjects = subjects.slice(prefixLength, subjects.length - suffixLength);
    const middle = nextMiddleSubjects.map((subject, index) => {
        const existing = previousMiddle[index];
        return existing
            ? { ...existing, subject }
            : { id: nextRowId(), subject, tracker_id: defaultTrackerId };
    });
    const suffix = suffixLength > 0 ? activeCurrent.slice(activeCurrent.length - suffixLength) : [];

    const reconciled = [...prefix, ...middle, ...suffix];
    while (reconciled.length < MIN_TABLE_ROWS) {
        reconciled.push({ id: nextRowId(), subject: '', tracker_id: defaultTrackerId });
    }
    return reconciled;
};

export interface BulkSubtaskCreatorHandle {
    createSubtasks: (newParentId?: string) => Promise<{ success: number; fail: number }>;
    hasSubjects: () => boolean;
    resetCycle: () => void;
}

export const BulkSubtaskCreator = React.forwardRef<BulkSubtaskCreatorHandle, BulkSubtaskCreatorProps>(
    ({ parentId, onTasksCreated, hideStandaloneButton, showTopBorder = true, trackerOptions = [], defaultTrackerId, onContentChange }, ref) => {
        const nextRowIdRef = React.useRef(0);
        const nextRowId = React.useCallback(() => {
            nextRowIdRef.current += 1;
            return nextRowIdRef.current;
        }, []);
        const [expanded, setExpanded] = React.useState(false);
        const [inputMode, setInputMode] = React.useState<'text' | 'table'>('text');
        const [rows, setRows] = React.useState<EditableBulkSubtaskRow[]>(() => createEmptyRows(nextRowId, defaultTrackerId));
        const [textValue, setTextValue] = React.useState('');
        const [textTrackerId, setTextTrackerId] = React.useState(defaultTrackerId);
        const [loading, setLoading] = React.useState(false);
        const [completed, setCompleted] = React.useState(false);
        const addNotification = useUIStore(state => state.addNotification);
        const tasks = useTaskStore(state => state.tasks);
        const operationIssueIds = React.useMemo(
            () => tasks.filter(task => !task.isContextOnly).map(task => task.id),
            [tasks]
        );
        const hasSubjects = React.useCallback(() => rows.some(row => row.subject.trim().length > 0), [rows]);
        React.useEffect(() => {
            onContentChange?.(hasSubjects());
        }, [hasSubjects, onContentChange]);

        const handleInputModeChange = (nextMode: 'text' | 'table') => {
            if (nextMode === inputMode) return;

            if (nextMode === 'text') {
                setTextValue(subjectsForTextMode(rows));
            }
            setInputMode(nextMode);
        };

        const createSubtasks = async (newParentId?: string) => {
            const subtasks: BulkSubtaskRow[] = rows
                .filter(row => row.subject.trim())
                .map(row => ({ subject: row.subject.trim(), ...(row.tracker_id ? { tracker_id: row.tracker_id } : {}) }));
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

                const bulkPayload = subtasks.some(row => row.tracker_id) ? { subtasks } : { subjects: subtasks.map(row => row.subject) };
                const operationIssueIdsForRequest = newParentId && !operationIssueIds.includes(targetParentId)
                    ? [...operationIssueIds, targetParentId]
                    : operationIssueIds;
                const result = await taskMutationService.bulkCreateSubtasks({
                    parentId: targetParentId,
                    ...bulkPayload,
                    operationIssueIds: operationIssueIdsForRequest
                });
                successCount = result.successCount;
                failCount = result.failCount;

                if (successCount > 0) {
                    addNotification(i18n.t('label_bulk_subtask_count_success', { count: successCount }) || `${successCount} tasks created.`, 'success');
                }

                if (successCount > 0) {
                    if (onTasksCreated) {
                        onTasksCreated(result);
                    } else {
                        useTaskStore.getState().applyTaskMutationMetadata(targetParentId, result);
                    }
                }

                if (successCount > 0 && failCount === 0) {
                    setRows(createEmptyRows(nextRowId, defaultTrackerId));
                    setTextValue('');
                    setTextTrackerId(defaultTrackerId);
                    setExpanded(false);
                    setCompleted(true);
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
                                        <tr key={row.id}>
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
                                            onChange={(event) => {
                                                const trackerId = event.target.value ? Number(event.target.value) : undefined;
                                                setTextTrackerId(trackerId);
                                                setRows(current => current.map(row => ({ ...row, tracker_id: trackerId })));
                                            }}
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
                                    value={textValue}
                                    onChange={(e) => {
                                        const nextTextValue = e.target.value;
                                        const subjects = nextTextValue.split('\n');
                                        setTextValue(nextTextValue);
                                        setRows(current => reconcileTextRows(
                                            current,
                                            subjects,
                                            textValue.split('\n').length,
                                            nextRowId,
                                            textTrackerId
                                        ));
                                    }}
                                    placeholder={i18n.t('placeholder_bulk_subtask_creation') || "Enter one ticket subject per line..."}
                                    disabled={loading}
                                    rows={5}
                                    style={{ width: '100%', padding: 12, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, color: '#45515e', border: '1px solid #d1d5db', borderRadius: 8, resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' }}
                                />
                            </>
                        )}
                        {inputMode === 'table' && <button type="button" onClick={() => setRows(current => [...current, { id: nextRowId(), subject: '', tracker_id: defaultTrackerId }])} disabled={loading}>{i18n.t('label_bulk_subtask_add_row') || '+ Add row'}</button>}
                        {!hideStandaloneButton && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    data-testid="bulk-subtask-create-button"
                                    onClick={handleCreateStandalone}
                                    disabled={loading || !hasSubjects()}
                                    style={{
                                        padding: '6px 12px',
                                        background: loading || !hasSubjects() ? '#ccc' : '#1a73e8',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: 4,
                                        fontSize: 13,
                                        cursor: loading || !hasSubjects() ? 'default' : 'pointer'
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
