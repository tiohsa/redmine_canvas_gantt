import { create } from 'zustand';
import type { Task } from '../types';
import { InlineEditService } from '../services/InlineEditService';


export interface BatchEditState {
    originalTasks: Task[];
    updates: Record<string, Partial<Task>>;
    newTasks: Partial<Task>[]; // Temporary new tasks
    status: 'idle' | 'saving' | 'error';
    error: string | null;

    initialize: (tasks: Task[]) => void;
    updateTask: (taskId: string, field: keyof Task | string, value: any) => void;
    // New tasks currently handled by just editing existing ones for MVP, or we can add specific new task logic.
    // Spec says: hovering row -> add icon -> insert new row.
    addNewTask: (parentId: string | null, afterTaskId?: string) => void;

    save: () => Promise<void>;
    reset: () => void;
}

export const useBatchEditStore = create<BatchEditState>((set, get) => ({
    originalTasks: [],
    updates: {},
    newTasks: [],
    status: 'idle',
    error: null,

    initialize: (tasks) => {
        set({
            originalTasks: tasks,
            updates: {},
            newTasks: [],
            status: 'idle',
            error: null
        });
    },

    updateTask: (taskId, field, value) => {
        set((state) => {
            const currentUpdates = state.updates[taskId] || {};
            return {
                updates: {
                    ...state.updates,
                    [taskId]: { ...currentUpdates, [field]: value }
                }
            };
        });
    },

    addNewTask: (parentId, _afterTaskId) => {
        // Implementation for adding a placeholder new task
        // We need a temporary ID for it.
        const tempId = `new_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newTask: Partial<Task> = {
            id: tempId,
            subject: '',
            parentId: parentId ?? undefined,
            // copying some defaults or inferred values
            startDate: Date.now(),
            dueDate: Date.now() + 86400000,
            ratioDone: 0,
            statusId: 1, // Default New
            editable: true,
            // We might need to handle 'afterTaskId' for sorting order if we support reordering or strict placement
        };

        set(state => ({
            newTasks: [...state.newTasks, newTask]
        }));
    },

    save: async () => {
        const { updates, originalTasks, newTasks } = get();
        set({ status: 'saving', error: null });

        try {
            // MVP: Iterate and save individually.
            // Ideally should be a batch endpoint.

            // 1. Update modified tasks
            const updatePromises = Object.entries(updates).map(async ([taskId, changes]) => {
                const original = originalTasks.find(t => t.id === taskId);
                if (!original) return;

                // Separate custom fields from standard fields if needed, 
                // but InlineEditService.saveTaskFields handles that mapping if we pass correct structure.

                // We need to map our flat 'updates' to the structure expected by InlineEditService
                // which distinguishes optimistic, rollback, and API fields.

                // Construct API fields
                const apiFields: Record<string, any> = {};
                if ('subject' in changes) apiFields['subject'] = changes.subject;
                if ('assignedToId' in changes) apiFields['assigned_to_id'] = changes.assignedToId;
                if ('statusId' in changes) apiFields['status_id'] = changes.statusId;
                if ('ratioDone' in changes) apiFields['done_ratio'] = changes.ratioDone;
                if ('dueDate' in changes) apiFields['due_date'] = changes.dueDate ? new Date(changes.dueDate as number).toISOString().split('T')[0] : '';
                if ('startDate' in changes) apiFields['start_date'] = changes.startDate ? new Date(changes.startDate as number).toISOString().split('T')[0] : '';

                // Handle Custom Fields (keys like 'cf:1')
                const customFieldValues: Record<string, string> = {};
                let hasCf = false;
                Object.keys(changes).forEach(key => {
                    if (key.startsWith('cf:')) {
                        const cfId = key.split(':')[1];
                        customFieldValues[cfId] = String(changes[key as keyof Task]);
                        hasCf = true;
                    }
                });
                if (hasCf) {
                    apiFields['custom_field_values'] = customFieldValues;
                }

                await InlineEditService.saveTaskFields({
                    taskId,
                    optimisticTaskUpdates: changes,
                    rollbackTaskUpdates: {}, // We reload after save anyway
                    fields: apiFields
                });
            });

            // 2. Create new tasks
            // We need to dynamically import client to avoid circular deps if any (though client is standalone)
            // or just import at top. Let's import at top if possible, but store often used in components. 
            // Dynamic import is safer in stores.
            if (newTasks.length > 0) {
                const { apiClient } = await import('../api/client');
                const createPromises = newTasks.map(async (t: Partial<Task>) => {
                    // We need to merge with updates if the user edited the new task immediately!
                    // The 'updates' map is keyed by ID. The new task has a temp ID.
                    // So we should look up if there are updates for this temp ID and merge them.
                    const userEdits = updates[t.id || ''] || {};
                    const finalTask = { ...t, ...userEdits };

                    await apiClient.createTask(finalTask);
                });
                await Promise.all(createPromises);
            }

            await Promise.all(updatePromises);

            // Reload all tasks to refresh state
            // Triggering a reload in TaskStore would be ideal.
            // For now, we assume simple success.

            set({ status: 'idle', updates: {}, newTasks: [] });

            // Close mode? Spec says "Dialog closes and Gantt redraws" on success.
            // We'll let the component call setBatchEditMode(false) after successful save.

        } catch (e) {
            console.error(e);
            set({ status: 'error', error: e instanceof Error ? e.message : 'Save failed' });
            throw e; // Re-throw to let caller know
        }
    },

    reset: () => {
        set({
            originalTasks: [],
            updates: {},
            newTasks: [],
            status: 'idle',
            error: null
        });
    }
}));
