import { create } from 'zustand';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
    id: string;
    message: string;
    type: NotificationType;
}

interface UIState {
    notifications: Notification[];
    showProgressLine: boolean;
    addNotification: (message: string, type?: NotificationType) => void;
    removeNotification: (id: string) => void;
    toggleProgressLine: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    notifications: [],
    showProgressLine: false,
    addNotification: (message, type = 'info') => {
        const id = Math.random().toString(36).substring(7);
        set((state) => ({
            notifications: [...state.notifications, { id, message, type }]
        }));

        // Auto-remove after 3 seconds
        setTimeout(() => {
            set((state) => ({
                notifications: state.notifications.filter((n) => n.id !== id)
            }));
        }, 3000);
    },
    removeNotification: (id) =>
        set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id)
        })),
    toggleProgressLine: () => set((state) => ({ showProgressLine: !state.showProgressLine }))
}));
