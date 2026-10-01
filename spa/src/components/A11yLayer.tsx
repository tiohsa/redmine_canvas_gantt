import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTaskStore } from '../stores/TaskStore';
import { i18n } from '../utils/i18n';
import type { Task } from '../types';
import { toLocalDisplayDate } from '../utils/dateOnly';
import { LayoutEngine } from '../engines/LayoutEngine';

const WINDOW_RADIUS = 25;

export const A11yLayer: React.FC = () => {
    const tasks = useTaskStore(state => state.tasks);
    const selectedTaskId = useTaskStore(state => state.selectedTaskId);
    const selectTask = useTaskStore(state => state.selectTask);

    const viewport = useTaskStore(state => state.viewport);
    const listRef = useRef<HTMLUListElement>(null);
    const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
    const lastFocusedIndexRef = useRef<number | null>(null);
    const ownsFocusRef = useRef(false);
    const pendingFocusRef = useRef<string | null>(null);
    const previousSelectionRef = useRef<string | null>(null);
    const taskIndices = useMemo(() => new Map(tasks.map((task, index) => [task.id, index])), [tasks]);
    const focusedIndex = focusedTaskId ? taskIndices.get(focusedTaskId) : undefined;
    const selectedIndex = selectedTaskId ? taskIndices.get(selectedTaskId) : undefined;
    const recoveringFocus = focusedTaskId !== null && focusedIndex === undefined;
    const firstVisible = LayoutEngine.sliceTasksInRowRange(
        tasks, Math.floor(viewport.scrollY / viewport.rowHeight),
        Math.ceil((viewport.scrollY + viewport.height) / viewport.rowHeight)
    )[0];
    const centerIndex = focusedIndex ?? selectedIndex ?? (firstVisible ? taskIndices.get(firstVisible.id)! : 0);
    const renderedIndices = new Set<number>();
    for (let index = Math.max(0, centerIndex - WINDOW_RADIUS);
        index <= Math.min(tasks.length - 1, centerIndex + WINDOW_RADIUS); index += 1) {
        renderedIndices.add(index);
    }
    if (tasks.length > 0) {
        renderedIndices.add(0);
        renderedIndices.add(tasks.length - 1);
    }
    if (selectedIndex !== undefined) renderedIndices.add(selectedIndex);
    if (focusedIndex !== undefined) renderedIndices.add(focusedIndex);

    // A real focus change outside the list cancels recovery. Removing a focused
    // virtual row does not dispatch focusin, so its previous position survives.
    useEffect(() => {
        const handleDocumentFocus = (event: FocusEvent) => {
            if (!listRef.current?.contains(event.target as Node)) {
                ownsFocusRef.current = false;
                setFocusedTaskId(null);
            }
        };
        document.addEventListener('focusin', handleDocumentFocus);
        return () => document.removeEventListener('focusin', handleDocumentFocus);
    }, []);

    useLayoutEffect(() => {
        // Commit the latest ordinal so removal can recover from the last displayed order.
        if (focusedIndex !== undefined) lastFocusedIndexRef.current = focusedIndex;
        const selectionChanged = previousSelectionRef.current !== selectedTaskId;
        previousSelectionRef.current = selectedTaskId;
        const pendingId = pendingFocusRef.current;
        pendingFocusRef.current = null;
        const recoveryId = ownsFocusRef.current && recoveringFocus
            ? tasks[Math.min(lastFocusedIndexRef.current ?? 0, tasks.length - 1)]?.id
            : undefined;
        const targetId = pendingId ?? recoveryId ?? (selectionChanged ? selectedTaskId : null);
        if (targetId) {
            const element = Array.from(listRef.current?.children ?? []).find(
                child => (child as HTMLElement).dataset.id === targetId
            ) as HTMLElement | undefined;
            if (element && document.activeElement !== element) {
                element.focus({ preventScroll: true });
            } else if (!element && recoveryId) {
                // Mount an out-of-window recovery target before focusing it.
                pendingFocusRef.current = recoveryId;
                selectTask(recoveryId);
            }
        }
        if (tasks.length === 0) {
            ownsFocusRef.current = false;
            lastFocusedIndexRef.current = null;
            // Clear bookkeeping after the focused DOM row disappears with an empty list.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setFocusedTaskId(null);
        }
    }, [tasks, selectedTaskId, selectTask, focusedTaskId, focusedIndex, recoveringFocus]);

    const handleKeyDown = (e: React.KeyboardEvent, task: Task) => {
        if (e.key === 'Tab') {
            const index = taskIndices.get(task.id)!;
            const nextTask = tasks[index + (e.shiftKey ? -1 : 1)];
            if (nextTask) {
                e.preventDefault();
                pendingFocusRef.current = nextTask.id;
                selectTask(nextTask.id);
            }
        }
        if (e.key === 'Enter') {
            alert(i18n.t('label_task_details_for', { subject: task.subject }) || `Details for: ${task.subject}`);
        }
    };

    const handleFocus = (taskId: string) => {
        ownsFocusRef.current = true;
        lastFocusedIndexRef.current = taskIndices.get(taskId)!;
        setFocusedTaskId(taskId);
        if (selectedTaskId !== taskId) selectTask(taskId);
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
            aria-label={i18n.t('label_gantt_chart_task_list') || 'Gantt Chart Task List'}
        >
            {Array.from(renderedIndices).sort((a, b) => a - b).map(index => {
                const task = tasks[index];
                return (
                    <li
                        key={task.id}
                        tabIndex={0}
                        aria-posinset={index + 1}
                        aria-setsize={tasks.length}
                        data-id={task.id}
                        onFocus={() => handleFocus(task.id)}
                        onKeyDown={(e) => handleKeyDown(e, task)}
                        aria-label={i18n.t('label_task_aria_label', {
                            subject: task.subject,
                            start: (task.startDate && Number.isFinite(task.startDate)) ? toLocalDisplayDate(task.startDate).toLocaleDateString() : (i18n.t('label_not_set') || 'Not set'),
                            end: (task.dueDate && Number.isFinite(task.dueDate)) ? toLocalDisplayDate(task.dueDate).toLocaleDateString() : (i18n.t('label_not_set') || 'Not set'),
                            status: task.ratioDone
                        }) || `Task: ${task.subject}. Start: ${(task.startDate && Number.isFinite(task.startDate)) ? toLocalDisplayDate(task.startDate).toLocaleDateString() : 'Not set'}. End: ${(task.dueDate && Number.isFinite(task.dueDate)) ? toLocalDisplayDate(task.dueDate).toLocaleDateString() : 'Not set'}. Status: ${task.ratioDone}%`}
                    >
                        {task.subject}
                    </li>
                );
            })}
        </ul>
    );
};
