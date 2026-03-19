import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from './UIStore';

describe('UIStore', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.RedmineCanvasGantt = {
            ...(window.RedmineCanvasGantt ?? {
                projectId: 1,
                apiBase: '',
                redmineBase: '',
                authToken: '',
                apiKey: '',
                nonWorkingWeekDays: [],
                i18n: {}
            }),
            settings: {
                ...(window.RedmineCanvasGantt?.settings ?? {}),
            }
        };
        useUIStore.setState(useUIStore.getInitialState(), true);
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('addNotification appends and auto-removes after 3 seconds', () => {
        vi.useFakeTimers();
        useUIStore.getState().addNotification('Saved', 'success');

        expect(useUIStore.getState().notifications).toHaveLength(1);
        expect(useUIStore.getState().notifications[0]?.message).toBe('Saved');
        expect(useUIStore.getState().notifications[0]?.type).toBe('success');

        vi.advanceTimersByTime(3000);
        expect(useUIStore.getState().notifications).toHaveLength(0);
    });

    it('toggles fullscreen and pane maximization states', () => {
        expect(useUIStore.getState().isFullScreen).toBe(false);
        expect(useUIStore.getState().leftPaneVisible).toBe(true);
        expect(useUIStore.getState().rightPaneVisible).toBe(true);

        useUIStore.getState().toggleFullScreen();
        useUIStore.getState().toggleLeftPane();

        expect(useUIStore.getState().isFullScreen).toBe(true);
        expect(useUIStore.getState().leftPaneVisible).toBe(false);
        expect(useUIStore.getState().rightPaneVisible).toBe(true);

        useUIStore.getState().toggleRightPane();
        expect(useUIStore.getState().leftPaneVisible).toBe(true);
        expect(useUIStore.getState().rightPaneVisible).toBe(false);

        useUIStore.getState().toggleRightPane();
        expect(useUIStore.getState().leftPaneVisible).toBe(true);
        expect(useUIStore.getState().rightPaneVisible).toBe(true);
    });

    it('switches directly between left and right maximized states', () => {
        useUIStore.getState().toggleLeftPane();
        expect(useUIStore.getState().leftPaneVisible).toBe(false);
        expect(useUIStore.getState().rightPaneVisible).toBe(true);

        useUIStore.getState().toggleRightPane();
        expect(useUIStore.getState().leftPaneVisible).toBe(true);
        expect(useUIStore.getState().rightPaneVisible).toBe(false);

        useUIStore.getState().toggleLeftPane();
        expect(useUIStore.getState().leftPaneVisible).toBe(false);
        expect(useUIStore.getState().rightPaneVisible).toBe(true);
    });

    it('updates visible columns, width and issue dialog state', () => {
        useUIStore.getState().setVisibleColumns(['id', 'subject']);
        useUIStore.getState().setColumnWidth('subject', 360);
        window.RedmineCanvasGantt = {
            ...window.RedmineCanvasGantt!,
            redmineBase: '/redmine'
        };

        useUIStore.getState().openIssueDialog('/issues/10');
        useUIStore.getState().setSidebarResizing(true);

        expect(useUIStore.getState().visibleColumns).toEqual(['id', 'subject']);
        expect(useUIStore.getState().columnWidths.subject).toBe(360);
        expect(useUIStore.getState().issueDialogUrl).toBe('/redmine/issues/10');
        expect(useUIStore.getState().isSidebarResizing).toBe(true);

        useUIStore.getState().closeIssueDialog();
        useUIStore.getState().setSidebarResizing(false);
        expect(useUIStore.getState().issueDialogUrl).toBeNull();
        expect(useUIStore.getState().isSidebarResizing).toBe(false);
    });

    it('resets relation preferences including auto schedule move mode', () => {
        useUIStore.getState().setAutoScheduleMoveMode('off');
        expect(useUIStore.getState().autoScheduleMoveMode).toBe('off');

        useUIStore.getState().resetRelationPreferences();
        expect(useUIStore.getState().autoScheduleMoveMode).toBe('constraint_push');
    });
});
