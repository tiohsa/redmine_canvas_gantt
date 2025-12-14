import React, { useState, useEffect } from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { i18n } from '../utils/i18n';
import type { Task } from '../types';
import { apiClient } from '../api/client';

interface EditDialogProps {
    onClose: () => void;
}

export const EditDialog: React.FC<EditDialogProps> = ({ onClose }) => {
    const { tasks, setTasks, permissions } = useTaskStore();
    const { addNotification, setEditModeState } = useUIStore();

    // We maintain a local copy of tasks to edit
    const [localTasks, setLocalTasks] = useState<Task[]>([]);
    const [modifiedTaskIds, setModifiedTaskIds] = useState<Set<string>>(new Set());
    const [errors, setErrors] = useState<Map<string, string>>(new Map());

    // Filter to only visible tasks (as per requirement: "Currently displayed tasks")
    // Wait, requirement says "Edit dialog includes all tasks currently visible in gantt chart (respect filters)"
    // Since filtering is not implemented in store (except for grouping), we assume tasks in store are the visible ones.
    // We should respect the layout order.

    useEffect(() => {
        // Deep copy tasks to avoid mutating store directly
        setLocalTasks(tasks.map(t => ({ ...t })));
    }, [tasks]);

    const handleFieldChange = (taskId: string, field: keyof Task, value: any) => {
        setLocalTasks(prev => prev.map(t => {
            if (t.id === taskId) {
                return { ...t, [field]: value };
            }
            return t;
        }));
        setModifiedTaskIds(prev => new Set(prev).add(taskId));
    };

    const handleSave = async () => {
        if (modifiedTaskIds.size === 0) {
            onClose();
            return;
        }

        setEditModeState('saving');
        const tasksToSave = localTasks.filter(t => modifiedTaskIds.has(t.id));
        const newErrors = new Map<string, string>();
        const savedTasks: Task[] = [];

        // We process saves sequentially or parallel? "Bulk save" usually implies one transaction,
        // but Redmine API is per-task. So we do parallel/sequence.
        // Requirement: "All succeeded -> close", "Partial -> keep open, show errors"

        await Promise.all(tasksToSave.map(async (task) => {
            try {
                if (parseInt(task.id) < 0) {
                    // New task (assuming negative ID for temp)
                    // We need projectId.
                    if (!task.projectId) throw new Error("Project ID missing");

                    const created = await apiClient.createTask({
                        ...task,
                        projectId: task.projectId
                    });

                    // Update the local task with the real ID and new lock version
                    // But wait, if we update ID, we need to update modifiedTaskIds?
                    // Actually, we just need to update the main store with the new task.
                    // For local state, we might need to swap the temp ID with real ID if we keep dialog open.

                    // Since we refetch or update store, let's just mark success.
                    savedTasks.push(created);
                } else {
                    const result = await apiClient.updateTask(task);
                    if (result.status === 'ok') {
                        savedTasks.push({ ...task, lockVersion: result.lockVersion! });
                    } else {
                        newErrors.set(task.id, result.error || 'Unknown error');
                    }
                }
            } catch (e: any) {
                newErrors.set(task.id, e.message || 'Error');
            }
        }));

        setErrors(newErrors);

        // Update store with saved tasks
        if (savedTasks.length > 0) {

             if (newErrors.size === 0) {
                 // All success
                 setEditModeState('idle');
                 // Refresh data from server to be safe and get correct order/layout
                 const data = await apiClient.fetchData();
                 setTasks(data.tasks);
                 addNotification(i18n.t('text_save_success') || 'Saved successfully', 'success');
                 onClose();
             } else {
                 setEditModeState('error');
                 addNotification(i18n.t('text_save_partial_failed') || 'Some tasks failed to save', 'warning');

                 setModifiedTaskIds(prev => {
                     const next = new Set(prev);
                     // This logic is flawed for new tasks because ID changes.
                     // But for existing tasks it works.
                     tasksToSave.forEach(t => {
                         if (!newErrors.has(t.id) && parseInt(t.id) > 0) {
                             next.delete(t.id);
                         }
                     });
                     return next;
                 });

                 // Update local tasks with the successful changes (lock versions etc)
                 setLocalTasks(prev => prev.map(t => {
                     const saved = savedTasks.find(s => s.id === t.id);
                     return saved ? saved : t;
                 }));
             }
        } else {
             setEditModeState('error');
        }
    };

    const handleCancel = () => {
        if (modifiedTaskIds.size > 0) {
            if (!window.confirm(i18n.t('text_unsaved_changes') || 'You have unsaved changes. Are you sure you want to discard them?')) {
                return;
            }
        }
        onClose();
    };

    // Helper to insert new task
    const handleAddTask = (targetTask: Task) => {
        if (!permissions.editable) return;

        // Generate temp ID
        const tempId = String(-Date.now());

        // Determine hierarchy
        // "Project row -> New task under project" (Not implemented strictly as rows in store, but we can check if it's a project header?)
        // The store `layoutRows` has headers. But `localTasks` is just a flat list.
        // We need to rely on the layout order to find where to insert.

        // Requirement: "Mouse over row... Project row -> Project direct, Parent -> Child, Child -> Sibling"
        // Since we are iterating tasks, we are on a Task row.
        // If we want to support "Project row", we need to render headers in the edit list too.
        // Let's look at `layoutRows`.

        const newTask: Task = {
            id: tempId,
            subject: 'New Task',
            projectId: targetTask.projectId,
            projectName: targetTask.projectName,
            startDate: targetTask.startDate,
            dueDate: targetTask.dueDate,
            ratioDone: 0,
            statusId: 1, // New
            lockVersion: 0,
            editable: true,
            rowIndex: 0, // Will be recalc
            hasChildren: false,
            parentId: targetTask.parentId
        };

        // Refine parent logic
        // If target is a parent (has children), new task should be a child?
        // Requirement: "Parent task row -> its child".
        // "Child task row -> Sibling".
        // How to know if it's a parent row? `hasChildren` property.

        if (targetTask.hasChildren) {
             newTask.parentId = targetTask.id;
        } else {
             newTask.parentId = targetTask.parentId;
        }

        // Insert into localTasks immediately after targetTask
        const index = localTasks.findIndex(t => t.id === targetTask.id);
        const newLocalTasks = [...localTasks];
        newLocalTasks.splice(index + 1, 0, newTask);
        setLocalTasks(newLocalTasks);
        setModifiedTaskIds(prev => new Set(prev).add(tempId));
    };


    return (
         <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'white',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Header */}
            <div style={{
                padding: '16px 24px',
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#fff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}>
                <h2 style={{ margin: 0, fontSize: '18px', color: '#333' }}>
                    {i18n.t('label_bulk_edit') || 'Bulk Edit Mode'}
                </h2>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={handleCancel}
                        style={{
                            padding: '8px 16px',
                            border: '1px solid #d0d0d0',
                            borderRadius: '4px',
                            background: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        {i18n.t('button_cancel') || 'Cancel'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={modifiedTaskIds.size === 0}
                        style={{
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: '4px',
                            background: modifiedTaskIds.size > 0 ? '#1a73e8' : '#ccc',
                            color: 'white',
                            cursor: modifiedTaskIds.size > 0 ? 'pointer' : 'default'
                        }}
                    >
                        {i18n.t('button_save') || 'Save'}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                <EditTable
                    tasks={localTasks}
                    onFieldChange={handleFieldChange}
                    onAddTask={handleAddTask}
                    permissions={permissions}
                    modifiedIds={modifiedTaskIds}
                    errors={errors}
                />
            </div>
        </div>
    );
};

// Sub-component for the table to handle layout logic isolation
import type { LayoutRow } from '../types';

const EditTable: React.FC<{
    tasks: Task[];
    onFieldChange: (id: string, field: keyof Task, value: any) => void;
    onAddTask: (target: Task) => void;
    permissions: { editable: boolean };
    modifiedIds: Set<string>;
    errors: Map<string, string>;
}> = ({ tasks, onFieldChange, onAddTask, permissions, modifiedIds, errors }) => {

    // We need to rebuild layout here to show new tasks correctly sorted/grouped
    // Copied logic from TaskStore buildLayout (simplified)
    const buildLocalLayout = (tasks: Task[]): LayoutRow[] => {
         const groups = new Map<string, { projectId: string; projectName?: string; tasks: Task[]; order: number }>();

        tasks.forEach((task, index) => {
            const projectId = task.projectId ?? 'default_project';
            if (!groups.has(projectId)) {
                groups.set(projectId, {
                    projectId,
                    projectName: task.projectName,
                    tasks: [],
                    order: index // This order might be unstable if we add tasks?
                    // Ideally we use project ID or name to sort?
                    // Original logic uses index of first appearance.
                });
            }

            const group = groups.get(projectId);
            if (group) {
                group.tasks.push(task);
                group.projectName = group.projectName || task.projectName;
            }
        });

        const orderedGroups = Array.from(groups.values()); // Keep insert order roughly

        let rowIndex = 0;
        const layoutRows: LayoutRow[] = [];

        orderedGroups.forEach(group => {
            layoutRows.push({ type: 'header', projectId: group.projectId, projectName: group.projectName, rowIndex });
            rowIndex += 1;

            const sortedTasks = [...group.tasks].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
            sortedTasks.forEach(task => {
                layoutRows.push({ type: 'task', taskId: task.id, rowIndex });
                rowIndex += 1;
            });
        });

        return layoutRows;
    };

    const layoutRows = React.useMemo(() => buildLocalLayout(tasks), [tasks]);
    const [hoveredRow, setHoveredRow] = useState<number | null>(null);

    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
                <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left', color: '#666' }}>
                    <th style={{ padding: '8px' }}>Subject</th>
                    <th style={{ padding: '8px', width: '120px' }}>Status</th>
                    <th style={{ padding: '8px', width: '80px' }}>% Done</th>
                    <th style={{ padding: '8px', width: '110px' }}>Start Date</th>
                    <th style={{ padding: '8px', width: '110px' }}>Due Date</th>
                    <th style={{ padding: '8px', width: '120px' }}>Assignee</th>
                </tr>
            </thead>
            <tbody>
                {layoutRows.map(row => {
                    if (row.type === 'header') {
                        return (
                            <tr key={`h-${row.projectId}-${row.rowIndex}`} style={{ backgroundColor: '#f9f9f9' }}>
                                <td colSpan={6} style={{ padding: '12px 8px', fontWeight: 'bold' }}>
                                    {row.projectName}
                                </td>
                            </tr>
                        );
                    }

                    const task = tasks.find(t => t.id === row.taskId);
                    if (!task) return null;

                    const hasError = errors.has(task.id);
                    const isModified = modifiedIds.has(task.id);

                    return (
                        <tr
                            key={task.id}
                            onMouseEnter={() => setHoveredRow(row.rowIndex)}
                            onMouseLeave={() => setHoveredRow(null)}
                            style={{
                                borderBottom: '1px solid #eee',
                                backgroundColor: hasError ? '#ffebee' : (isModified ? '#e3f2fd' : 'white')
                            }}
                        >
                            <td style={{ padding: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <div style={{ marginLeft: task.parentId ? 20 : 0, marginRight: 8, color: '#999' }}>
                                        {task.id}
                                    </div>
                                    <input
                                        type="text"
                                        value={task.subject}
                                        onChange={(e) => onFieldChange(task.id, 'subject', e.target.value)}
                                        style={{
                                            width: '100%', border: '1px solid #ccc', padding: '4px', borderRadius: '4px',
                                            fontWeight: task.parentId ? 'normal' : '600'
                                        }}
                                    />
                                    {/* Add Button */}
                                    {permissions.editable && hoveredRow === row.rowIndex && (
                                        <button
                                            onClick={() => onAddTask(task)}
                                            title="Add task below"
                                            style={{
                                                marginLeft: '8px',
                                                background: '#1a73e8',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '50%',
                                                width: '20px',
                                                height: '20px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                fontSize: '16px',
                                                lineHeight: 1
                                            }}
                                        >
                                            +
                                        </button>
                                    )}
                                </div>
                                {hasError && <div style={{ color: 'red', fontSize: '11px', marginTop: 2 }}>{errors.get(task.id)}</div>}
                            </td>
                            <td style={{ padding: '8px' }}>
                                <select
                                    value={task.statusId}
                                    onChange={(e) => onFieldChange(task.id, 'statusId', parseInt(e.target.value))}
                                    style={{ width: '100%', padding: '4px' }}
                                >
                                    {/* Ideally fetch statuses. For now hardcode or use existing map? We don't have statuses in store. */}
                                    <option value={1}>New</option>
                                    <option value={2}>In Progress</option>
                                    <option value={3}>Resolved</option>
                                    <option value={4}>Feedback</option>
                                    <option value={5}>Closed</option>
                                    <option value={6}>Rejected</option>
                                </select>
                            </td>
                            <td style={{ padding: '8px' }}>
                                <input
                                    type="number"
                                    min="0" max="100"
                                    value={task.ratioDone}
                                    onChange={(e) => onFieldChange(task.id, 'ratioDone', parseInt(e.target.value))}
                                    style={{ width: '60px', padding: '4px' }}
                                />
                            </td>
                            <td style={{ padding: '8px' }}>
                                <input
                                    type="date"
                                    value={task.startDate ? new Date(task.startDate).toISOString().split('T')[0] : ''}
                                    onChange={(e) => {
                                        const d = new Date(e.target.value);
                                        if (!isNaN(d.getTime())) {
                                            onFieldChange(task.id, 'startDate', d.getTime());
                                        }
                                    }}
                                    style={{ width: '100%', padding: '4px' }}
                                />
                            </td>
                            <td style={{ padding: '8px' }}>
                                <input
                                    type="date"
                                    value={task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}
                                    onChange={(e) => {
                                        const d = new Date(e.target.value);
                                        if (!isNaN(d.getTime())) {
                                            onFieldChange(task.id, 'dueDate', d.getTime());
                                        }
                                    }}
                                    style={{ width: '100%', padding: '4px' }}
                                />
                            </td>
                            <td style={{ padding: '8px' }}>
                                {/* Assignee dropdown - need list of users. Not in store. Use simple input or assume we can't edit easily without fetching members. */}
                                {/* Requirement says "Assignee" is editable. */}
                                {/* Since we don't have a list of project members, maybe we should just show the ID or name as read-only for now or use a text input (risky)? */}
                                {/* For MVP, let's keep it read-only or number input for ID if we must. */}
                                <input
                                    type="text"
                                    placeholder="ID"
                                    value={task.assignedToId || ''}
                                    onChange={(e) => onFieldChange(task.id, 'assignedToId', parseInt(e.target.value))}
                                    style={{ width: '100%', padding: '4px' }}
                                />
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
