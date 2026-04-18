import type { CriticalPathTaskMetrics } from '../../scheduling/criticalPath';
import type { SchedulingStateInfo } from '../../scheduling/constraintGraph';
import { i18n } from '../../utils/i18n';
import { designTokens } from '../../styles/designTokens';

export type TaskNotificationDescriptor = {
    iconName: 'rcg-icon-notification-unscheduled' | 'rcg-icon-notification-warning' | 'rcg-icon-notification-critical';
    color: string;
    tooltip: string;
    testIdSuffix: string;
};

type CriticalPathNotificationMetrics = Pick<CriticalPathTaskMetrics, 'critical' | 'totalSlackDays'>;

const getSchedulingNotification = (schedulingState?: SchedulingStateInfo): TaskNotificationDescriptor | null => {
    if (!schedulingState || schedulingState.state === 'normal') return null;

    if (schedulingState.state === 'invalid') {
        return {
            iconName: 'rcg-icon-notification-warning',
            color: designTokens.notificationError,
            tooltip: schedulingState.message,
            testIdSuffix: 'invalid'
        };
    }

    if (schedulingState.state === 'cyclic') {
        return {
            iconName: 'rcg-icon-notification-warning',
            color: designTokens.notificationWarning,
            tooltip: schedulingState.message,
            testIdSuffix: 'cyclic'
        };
    }

    if (schedulingState.state === 'conflicted') {
        return {
            iconName: 'rcg-icon-notification-warning',
            color: designTokens.notificationBlocked,
            tooltip: schedulingState.message,
            testIdSuffix: 'conflicted'
        };
    }

    return {
        iconName: 'rcg-icon-notification-unscheduled',
        color: designTokens.notificationMuted,
        tooltip: schedulingState.message,
        testIdSuffix: 'unscheduled'
    };
};

const getCriticalPathNotification = (criticalPathMetrics?: CriticalPathNotificationMetrics): TaskNotificationDescriptor | null => {
    if (!criticalPathMetrics?.critical) return null;

    const days = criticalPathMetrics.totalSlackDays;
    return {
        iconName: 'rcg-icon-notification-critical',
        color: designTokens.notificationCritical,
        tooltip: i18n.t('label_critical_path_total_slack', { days }) || `Critical path task. Total slack: ${days} working day(s).`,
        testIdSuffix: 'critical'
    };
};

export const getTaskNotification = (
    schedulingState?: SchedulingStateInfo,
    criticalPathMetrics?: CriticalPathNotificationMetrics
): TaskNotificationDescriptor | null => (
    getSchedulingNotification(schedulingState) ?? getCriticalPathNotification(criticalPathMetrics)
);
