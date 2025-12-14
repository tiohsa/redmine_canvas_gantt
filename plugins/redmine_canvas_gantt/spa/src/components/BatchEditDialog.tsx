import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { useBatchEditStore } from '../stores/BatchEditStore';
import { useEditMetaStore } from '../stores/EditMetaStore';
import type { Task } from '../types';
import type { CustomFieldMeta, EditOption } from '../types/editMeta';

interface ColumnDef {
    key: string;
    label: string;
    width: number | string;
    minWidth?: number;
    type?: 'string' | 'list' | 'date' | 'number' | 'custom_field';
    options?: EditOption[];
    cfMeta?: CustomFieldMeta;
}

const BatchEditDialog: React.FC = () => {
    const { setBatchEditMode, tasks } = useTaskStore();
    const { updates, newTasks, error, save, initialize } = useBatchEditStore();
    const { fetchEditMeta, metaByTaskId } = useEditMetaStore();

    // Dynamic columns state
    const [columns, setColumns] = React.useState<ColumnDef[]>([
        { key: 'subject', label: 'Subject', width: '30%', minWidth: 200, type: 'string' },
        { key: 'assignedToId', label: 'Assigned To', width: '150px', type: 'list' },
        { key: 'statusId', label: 'Status', width: '120px', type: 'list' },
        { key: 'ratioDone', label: 'Done %', width: '80px', type: 'number' },
        { key: 'startDate', label: 'Start Date', width: '110px', type: 'date' },
        { key: 'dueDate', label: 'Due Date', width: '110px', type: 'date' },
    ]);
    const [metaLoaded, setMetaLoaded] = React.useState(false);

    // Merge existing tasks with newTasks for display
    // Insert newTasks after the task they were added from (afterTaskId)
    const displayTasks = React.useMemo(() => {
        const result: Task[] = [];
        const newTasksWithAfter = newTasks as (Partial<Task> & { afterTaskId?: string })[];
        tasks.forEach(task => {
            result.push(task);
            // Insert newTasks that should appear after this task
            const newTasksAfterThis = newTasksWithAfter.filter(nt => nt.afterTaskId === task.id);
            result.push(...newTasksAfterThis as Task[]);
        });
        // Add newTasks without afterTaskId at the end
        const orphanNewTasks = newTasksWithAfter.filter(nt => !nt.afterTaskId);
        result.push(...orphanNewTasks as Task[]);
        return result;
    }, [tasks, newTasks]);

    const [isSaving, setIsSaving] = React.useState(false);

    // Initialize store on mount
    React.useEffect(() => {
        initialize(tasks);
    }, [initialize, tasks]);

    // Load meta for the first task to determine columns
    React.useEffect(() => {
        const loadMeta = async () => {
            if (tasks.length === 0) return;
            // Try to find a real task ID (numeric)
            const sampleTask = tasks.find(t => !t.id.startsWith('new_'));
            if (!sampleTask) return;

            let meta = metaByTaskId[sampleTask.id];
            if (!meta) {
                try {
                    meta = await fetchEditMeta(sampleTask.id);
                } catch (e) {
                    console.error("Failed to load meta for batch edit columns", e);
                    return;
                }
            }

            if (meta) {
                // Build dynamic columns
                const newCols: ColumnDef[] = [
                    { key: 'subject', label: 'Subject', width: '30%', minWidth: 200, type: 'string' },
                ];

                // Assignee
                newCols.push({
                    key: 'assignedToId',
                    label: 'Assigned To',
                    width: '150px',
                    type: 'list',
                    options: meta.options.assignees
                });

                // Status
                newCols.push({
                    key: 'statusId',
                    label: 'Status',
                    width: '120px',
                    type: 'list',
                    options: meta.options.statuses
                });

                // Done Ratio
                newCols.push({ key: 'ratioDone', label: 'Done %', width: '80px', type: 'number' });

                // Dates
                newCols.push({ key: 'startDate', label: 'Start Date', width: '110px', type: 'date' });
                newCols.push({ key: 'dueDate', label: 'Due Date', width: '110px', type: 'date' });

                // Custom Fields
                if (meta.options.customFields) {
                    meta.options.customFields.forEach(cf => {
                        newCols.push({
                            key: `cf:${cf.id}`,
                            label: cf.name,
                            width: '120px',
                            type: 'custom_field',
                            cfMeta: cf
                        });
                    });
                }

                setColumns(newCols);
                setMetaLoaded(true);
            }
        };

        if (!metaLoaded) {
            loadMeta();
        }
    }, [tasks, fetchEditMeta, metaByTaskId, metaLoaded]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await save();
            setBatchEditMode(false);
            window.location.reload();
        } catch (e) {
            // Error handled in store
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = React.useCallback(() => {
        const hasChanges = Object.keys(updates).length > 0 || newTasks.length > 0;
        if (hasChanges) {
            if (!confirm('You have unsaved changes. Discard?')) {
                return;
            }
        }
        setBatchEditMode(false);
    }, [updates, newTasks, setBatchEditMode]);

    // Keyboard shortcut for Esc
    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [handleCancel]);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                height: 60,
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                backgroundColor: '#fff',
                flexShrink: 0
            }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#333' }}>
                    Batch Edit Mode
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    {error && <span style={{ color: '#d32f2f', fontSize: 14, marginRight: 12, display: 'flex', alignItems: 'center' }}>{error}</span>}
                    <button
                        onClick={handleCancel}
                        disabled={isSaving}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                        style={{
                            padding: '8px 16px',
                            border: '1px solid #d0d0d0',
                            borderRadius: 4,
                            background: '#fff',
                            cursor: 'pointer',
                            fontSize: 14,
                            color: '#333',
                            transition: 'background-color 0.2s',
                            fontWeight: 500
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#155db5'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1a73e8'}
                        style={{
                            padding: '8px 24px',
                            border: 'none',
                            borderRadius: 4,
                            background: '#1a73e8',
                            cursor: 'pointer',
                            fontSize: 14,
                            color: '#fff',
                            fontWeight: 600,
                            opacity: isSaving ? 0.7 : 1,
                            transition: 'background-color 0.2s',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}
                    >
                        {isSaving ? 'Saving...' : 'Save All Changes'}
                    </button>
                </div>
            </div>

            {/* Table Area */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
                        <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                            {/* Actions col (Moved to LEFT) */}
                            <th style={{ width: 40, padding: 8 }}></th>

                            {columns.map((c, i) => (
                                <th key={i} style={{ textAlign: 'left', padding: '12px 8px', width: c.width, minWidth: c.minWidth, color: '#555', fontSize: 13, fontWeight: 600 }}>
                                    {c.label}
                                </th>
                            ))}
                            <th style={{ width: 40 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayTasks.map(task => (
                            <EditableRow key={task.id} task={task} columns={columns} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

interface EditableRowProps {
    task: Task;
    columns: ColumnDef[];
}

const EditableRow: React.FC<EditableRowProps> = ({ task, columns }) => {
    const { updates, updateTask, addNewTask, deleteTask, deletedTaskIds } = useBatchEditStore();
    const { taskExpansion, toggleTaskExpansion, setHoveredTask } = useTaskStore();
    const [isHovered, setIsHovered] = React.useState(false);

    // Merge original task with updates
    const currentTask = { ...task, ...(updates[task.id] || {}) };
    const changed = Boolean(updates[task.id]);
    const isDeleted = Array.isArray(deletedTaskIds) && deletedTaskIds.includes(task.id);

    const { metaByTaskId, fetchEditMeta } = useEditMetaStore();
    const meta = metaByTaskId[task.id];

    // Load meta on mount if valid
    React.useEffect(() => {
        if (!task.id.startsWith('new_') && !meta) void fetchEditMeta(task.id);
    }, [task.id, meta, fetchEditMeta]);

    const handleAdd = () => {
        addNewTask(task.parentId ?? null, task.id);
    };

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this task?')) {
            deleteTask(task.id);
        }
    };

    const indent = (task.indentLevel ?? 0) * 20;

    if (isDeleted) return null;

    return (
        <tr
            style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: changed ? '#fffde7' : undefined }}
            onMouseEnter={() => {
                setIsHovered(true);
                setHoveredTask(task.id);
            }}
            onMouseLeave={() => {
                setIsHovered(false);
                setHoveredTask(null);
            }}
        >
            {/* Add Action (Left Side) */}
            <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                {isHovered && (
                    <button
                        title="Add task below"
                        onClick={handleAdd}
                        style={{
                            width: 24, height: 24,
                            borderRadius: '50%',
                            border: 'none',
                            background: '#e8f0fe',
                            color: '#1a73e8',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 16
                        }}
                    >
                        +
                    </button>
                )}
            </td>

            {columns.map(col => {
                if (col.key === 'subject') {
                    return (
                        <td key={col.key} style={{ padding: '8px 4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: indent }}>
                                {task.hasChildren ? (
                                    <button
                                        onClick={() => toggleTaskExpansion(task.id)}
                                        style={{
                                            width: 20, height: 20, marginRight: 6,
                                            border: '1px solid #ccc', background: '#fff', borderRadius: 3,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {(taskExpansion[task.id] ?? true) ? '▼' : '▶'}
                                    </button>
                                ) : <div style={{ width: 26 }} />}

                                <input
                                    value={currentTask.subject}
                                    onChange={(e) => updateTask(task.id, 'subject', e.target.value)}
                                    style={{
                                        width: '100%',
                                        border: '1px solid #d0d0d0', // VISIBLE BORDER DEFAULT
                                        background: '#fff',
                                        padding: '4px',
                                        borderRadius: 4,
                                        fontWeight: task.hasChildren ? 600 : 400
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#1a73e8'}
                                    onBlur={(e) => e.target.style.borderColor = '#d0d0d0'}
                                />
                            </div>
                        </td>
                    );
                }

                if (col.key === 'assignedToId') {
                    return (
                        <td key={col.key} style={{ padding: '8px 4px' }}>
                            <select
                                value={currentTask.assignedToId ?? ''}
                                onChange={(e) => updateTask(task.id, 'assignedToId', e.target.value ? Number(e.target.value) : null)}
                                style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ddd' }}
                            >
                                <option value="">(Unassigned)</option>
                                {(col.options || meta?.options.assignees)?.map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                        </td>
                    );
                }

                if (col.key === 'statusId') {
                    return (
                        <td key={col.key} style={{ padding: '8px 4px' }}>
                            <select
                                value={currentTask.statusId}
                                onChange={(e) => updateTask(task.id, 'statusId', Number(e.target.value))}
                                style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ddd' }}
                            >
                                {(col.options || meta?.options.statuses)?.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </td>
                    );
                }

                if (col.key === 'ratioDone') {
                    return (
                        <td key={col.key} style={{ padding: '8px 4px' }}>
                            <input
                                type="number"
                                min="0" max="100" step="10"
                                value={currentTask.ratioDone}
                                onChange={(e) => updateTask(task.id, 'ratioDone', Number(e.target.value))}
                                style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ddd' }}
                            />
                        </td>
                    );
                }

                if (col.key === 'startDate' || col.key === 'dueDate') {
                    const val = col.key === 'startDate' ? currentTask.startDate : currentTask.dueDate;
                    return (
                        <td key={col.key} style={{ padding: '8px 4px' }}>
                            <input
                                type="date"
                                value={val ? new Date(val).toISOString().split('T')[0] : ''}
                                onChange={(e) => updateTask(task.id, col.key, e.target.valueAsNumber || null)}
                                style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}
                            />
                        </td>
                    );
                }

                if (col.type === 'custom_field' && col.cfMeta) {
                    const cfId = col.cfMeta.id;
                    // For now, only string CFs are supported for simplicity, or basic input
                    // We need to support reading/writing CFs to updates state.
                    // Updates store CFs as `cf:ID` keys in the task object (if we map appropriately).
                    // Or we can store them in a separate `customFieldValues` object on the task?
                    // The `Task` type doesn't natively have generic CFs bag on top level.
                    // But `updates` is `Partial<Task>`. 
                    // Let's assume we overload `Task` or `updates` to carry these keys.
                    // In `BatchEditStore`, we already handle `cf:` keys.

                    const val = (currentTask as any)[col.key] ?? meta?.customFieldValues?.[String(cfId)] ?? '';

                    return (
                        <td key={col.key} style={{ padding: '8px 4px' }}>
                            {col.cfMeta.possibleValues ? (
                                <select
                                    value={val}
                                    onChange={(e) => updateTask(task.id, col.key, e.target.value)}
                                    style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ddd' }}
                                >
                                    <option value=""></option>
                                    {col.cfMeta.possibleValues.map(v => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    value={val}
                                    onChange={(e) => updateTask(task.id, col.key, e.target.value)}
                                    style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ddd' }}
                                />
                            )}
                        </td>
                    );
                }

                return <td key={col.key} />;
            })}

            {/* Delete Action (Right Side) */}
            <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                {isHovered && (
                    <button
                        title="Delete task"
                        onClick={handleDelete}
                        style={{
                            width: 24, height: 24,
                            borderRadius: 4,
                            border: 'none',
                            background: 'transparent',
                            color: '#d32f2f',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14
                        }}
                    >
                        🗑️
                    </button>
                )}
            </td>
        </tr>
    );
};

export default BatchEditDialog;
