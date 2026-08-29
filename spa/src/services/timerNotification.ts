import { i18n } from '../utils/i18n';
import { useUIStore } from '../stores/UIStore';

export interface SendTimerNotificationParams {
    issueId: number | string;
    subject: string;
    minutes: number;
    type: 'running_expired' | 'stopped';
}

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return 'denied';
    }

    try {
        const result = await Notification.requestPermission();
        return result;
    } catch {
        return 'denied';
    }
};

export const sendTimerNotification = ({
    issueId,
    subject,
    minutes,
    type
}: SendTimerNotificationParams): void => {
    const title = (i18n.t('label_timer_notification_title') || 'Timer: #%{id} %{subject}')
        .replace('%{id}', String(issueId))
        .replace('%{subject}', subject);

    const bodyTemplate = type === 'stopped'
        ? (i18n.t('label_timer_notification_body_stopped') || '%{minutes} minutes auto-stopped. Work time is not recorded yet.')
        : (i18n.t('label_timer_notification_body_running') || '%{minutes} minutes elapsed. Timer continues.');

    const body = bodyTemplate.replace('%{minutes}', String(minutes));

    // 1. Try Web Notifications API if granted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, {
                body,
                tag: `timer-${issueId}-${Date.now()}`
            });
            return;
        } catch (e) {
            console.debug('Failed to show desktop notification, falling back to in-app toast', e);
        }
    }

    // 2. In-app fallback notification
    try {
        useUIStore.getState().addNotification(`${title} - ${body}`, type === 'stopped' ? 'warning' : 'info');
    } catch (e) {
        console.debug('Failed to show in-app notification', e);
    }
};
