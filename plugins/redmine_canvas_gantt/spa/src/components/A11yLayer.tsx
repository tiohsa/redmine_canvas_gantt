import React, { useEffect, useRef } from 'react';
import { useTaskStore } from '../stores/TaskStore';
import type { Task } from '../types';

export const A11yLayer: React.FC = () => {
    const tasks = useTaskStore(state => state.tasks);
    const selectedTaskId = useTaskStore(state => state.selectedTaskId);
    const selectTask = useTaskStore(state => state.selectTask);

    const listRef = useRef<HTMLUListElement>(null);

    // Update focus when selection changes via Canvas
    useEffect(() => {
        if (selectedTaskId && listRef.current) {
            const el = listRef.current.querySelector<HTMLElement>(`[data-id="${selectedTaskId}"]`);
            if (el && document.activeElement !== el) {
                el.focus({ preventScroll: true });
            }
        }
    }, [selectedTaskId]);

    const handleKeyDown = (e: React.KeyboardEvent, task: Task) => {
        if (e.key === 'Enter') {
            alert(`Details for: ${task.subject}`);
        }
    };

    const handleFocus = (taskId: string) => {
        if (selectedTaskId !== taskId) {
            selectTask(taskId);
        }
    };

    return (
        <ul
            ref={listRef}
            style={{
                position: 'absolute',
                width: 1,
                height: 1,
                overflow: 'hidden',
                clip: 'rect(0 0 0 0)',
                margin: 0,
                padding: 0
            }}
            aria-label="Gantt Chart Task List"
        >
            {tasks.map(task => (
                <li
                    key={task.id}
                    tabIndex={0}
                    data-id={task.id}
                    onFocus={() => handleFocus(task.id)}
                    onKeyDown={(e) => handleKeyDown(e, task)}
                    aria-label={`Task: ${task.subject}. Start: ${(task.startDate && Number.isFinite(task.startDate)) ? new Date(task.startDate).toLocaleDateString() : 'Not set'}. End: ${(task.dueDate && Number.isFinite(task.dueDate)) ? new Date(task.dueDate).toLocaleDateString() : 'Not set'}. Status: ${task.ratioDone}%`}
                >
                    {task.subject}
                </li>
            ))}
        </ul>
    );
};
