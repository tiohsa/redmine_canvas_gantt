import React from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { useBatchEditStore } from '../stores/BatchEditStore';
import { useEditMetaStore } from '../stores/EditMetaStore';
import type { Task } from '../types';

const BatchEditDialog: React.FC = () => {
    const { setBatchEditMode, tasks } = useTaskStore();
    const { updates, newTasks, error, save, initialize } = useBatchEditStore();
    // We reuse layoutRows logic from TaskStore which is already calculated for "visible" tasks in Gantt terms. 
    // Spec says: "Displays all tasks currently shown in Gantt".
    // So we can iterate `tasks` (which are the flattened, filtered, sorted tasks).

    // However, `tasks` from store are "layout tasks".
    // Let's use `tasks` directly.

    // Merge existing tasks with newTasks for display
    // New tasks need to be inserted into the list. 
    // Since 'tasks' is a flat list sorted by displayOrder, we might just append new tasks for MVP 
    // or try to place them if we had logic. 
    // For now, let's just concat newTasks at the bottom for visibility if they are not in `tasks`.
    // Actually, `tasks` comes from TaskStore. `newTasks` are local.

    // Simple display strategy:
    const displayTasks = React.useMemo(() => {
        // We need to cast newTasks (Partial<Task>) to Task for the component, or adjust component type.
        // Let's cast for now as we ensure minimal required fields.
        return [...tasks, ...newTasks as Task[]];
    }, [tasks, newTasks]);

    const [isSaving, setIsSaving] = React.useState(false);

    // Initialize store on mount
    React.useEffect(() => {
        initialize(tasks);
    }, [initialize, tasks]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await save();
            setBatchEditMode(false);
            window.location.reload(); // Simple reload to refresh everything for now as per spec "Gantt redraw"
        } catch (e) {
            // Error handled in store
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        // Spec 9.2: Warn if unsaved changes
        const hasChanges = Object.keys(updates).length > 0 || newTasks.length > 0;
        if (hasChanges) {
            if (!confirm('You have unsaved changes. Discard?')) {
                return;
            }
        }
        setBatchEditMode(false);
    };

    // Keyboard shortcut for Esc
    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [updates, newTasks]); // Depend on changes to warn correctly? Actually handleCancel reads from store ref if implemented well or we can just let state be fresh. 
    // But `handleCancel` closes over updates if not careful.
    // Ideally use a ref or check store directly. simpler here: let it re-bind.

    // Table Header
    const columns = [
        { label: 'Subject', width: '30%', minWidth: 200 },
        { label: 'Assigned To', width: '150px' },
        { label: 'Status', width: '120px' },
        { label: 'Done %', width: '80px' },
        { label: 'Start Date', width: '110px' },
        { label: 'Due Date', width: '110px' },
    ];

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
                        style={{
                            padding: '8px 16px',
                            border: '1px solid #d0d0d0',
                            borderRadius: 4,
                            background: '#fff',
                            cursor: 'pointer',
                            fontSize: 14,
                            color: '#333'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        style={{
                            padding: '8px 24px',
                            border: 'none',
                            borderRadius: 4,
                            background: '#1a73e8',
                            cursor: 'pointer',
                            fontSize: 14,
                            color: '#fff',
                            fontWeight: 600,
                            opacity: isSaving ? 0.7 : 1
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
                            {columns.map((c, i) => (
                                <th key={i} style={{ textAlign: 'left', padding: '12px 8px', width: c.width, minWidth: c.minWidth, color: '#555', fontSize: 13, fontWeight: 600 }}>
                                    {c.label}
                                </th>
                            ))}
                            {/* Actions col */}
                            <th style={{ width: 40 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayTasks.map(task => (
                            <EditableRow key={task.id} task={task} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const EditableRow: React.FC<{ task: Task }> = ({ task }) => {
    const { updates, updateTask, addNewTask } = useBatchEditStore();
    const { taskExpansion, toggleTaskExpansion, setHoveredTask } = useTaskStore();
    const [isHovered, setIsHovered] = React.useState(false);

    // Merge original task with updates
    const currentTask = { ...task, ...(updates[task.id] || {}) };
    const changed = Boolean(updates[task.id]);

    const { metaByTaskId, fetchEditMeta } = useEditMetaStore();
    const meta = metaByTaskId[task.id];

    // Load meta on mount if valid
    // Only load if it's a real task (numeric ID usually, or length check? our temps are long strings starting 'new_')
    React.useEffect(() => {
        if (!task.id.startsWith('new_') && !meta) void fetchEditMeta(task.id);
    }, [task.id, meta, fetchEditMeta]);

    const handleAdd = () => {
        addNewTask(task.parentId ?? null, task.id);
    };

    const indent = (task.indentLevel ?? 0) * 20;

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
            {/* Subject with Indent */}
            <td style={{ padding: '8px 4px' }}>
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
                            border: '1px solid transparent',
                            background: 'transparent',
                            padding: '4px',
                            borderRadius: 4,
                            fontWeight: task.hasChildren ? 600 : 400
                        }}
                        onFocus={(e) => e.target.style.border = '1px solid #1a73e8'}
                        onBlur={(e) => e.target.style.border = '1px solid transparent'}
                    />
                </div>
            </td>

            {/* Assignee */}
            <td style={{ padding: '8px 4px' }}>
                {meta ? (
                    <select
                        value={currentTask.assignedToId ?? ''}
                        onChange={(e) => updateTask(task.id, 'assignedToId', e.target.value ? Number(e.target.value) : null)}
                        style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ddd' }}
                    >
                        <option value="">(Unassigned)</option>
                        {meta.options.assignees.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                ) : <span style={{ fontSize: 12, color: '#999' }}>Loading...</span>}
            </td>

            {/* Status */}
            <td style={{ padding: '8px 4px' }}>
                {meta ? (
                    <select
                        value={currentTask.statusId}
                        onChange={(e) => updateTask(task.id, 'statusId', Number(e.target.value))}
                        style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ddd' }}
                    >
                        {meta.options.statuses.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                ) : <span style={{ fontSize: 12, color: '#999' }}>...</span>}
            </td>

            {/* Done Ratio */}
            <td style={{ padding: '8px 4px' }}>
                <input
                    type="number"
                    min="0" max="100" step="10"
                    value={currentTask.ratioDone}
                    onChange={(e) => updateTask(task.id, 'ratioDone', Number(e.target.value))}
                    style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ddd' }}
                />
            </td>

            {/* Start Date */}
            <td style={{ padding: '8px 4px' }}>
                <input
                    type="date"
                    value={currentTask.startDate ? new Date(currentTask.startDate).toISOString().split('T')[0] : ''}
                    onChange={(e) => updateTask(task.id, 'startDate', e.target.valueAsNumber || null)}
                    style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}
                />
            </td>

            {/* Due Date */}
            <td style={{ padding: '8px 4px' }}>
                <input
                    type="date"
                    value={currentTask.dueDate ? new Date(currentTask.dueDate).toISOString().split('T')[0] : ''}
                    onChange={(e) => updateTask(task.id, 'dueDate', e.target.valueAsNumber || null)}
                    style={{ width: '100%', padding: 4, borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}
                />
            </td>

            {/* Add Action */}
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
        </tr>
    );
};

export default BatchEditDialog;
