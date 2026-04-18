import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from './UIStore';
import { buildColumnSettingsFromVisibleKeys } from '../components/sidebar/sidebarColumnSettings';
import { getColumnDefinitions } from '../components/sidebar/sidebarColumnCatalog';

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

    it('toggles task title visibility', () => {
        type UIStoreState = ReturnType<typeof useUIStore.getState> & {
            showTaskTitles: boolean;
            toggleTaskTitles: () => void;
        };
        const uiStore = useUIStore.getState() as UIStoreState;

        expect(uiStore.showTaskTitles).toBe(true);

        uiStore.toggleTaskTitles();
        expect((useUIStore.getState() as UIStoreState).showTaskTitles).toBe(false);

        uiStore.toggleTaskTitles();
        expect((useUIStore.getState() as UIStoreState).showTaskTitles).toBe(true);
    });

    it('toggles hierarchy line visibility', () => {
        type UIStoreState = ReturnType<typeof useUIStore.getState> & {
            showHierarchyLines: boolean;
            toggleHierarchyLines: () => void;
        };
        const uiStore = useUIStore.getState() as UIStoreState;

        expect(uiStore.showHierarchyLines).toBe(true);

        uiStore.toggleHierarchyLines();
        expect((useUIStore.getState() as UIStoreState).showHierarchyLines).toBe(false);

        uiStore.toggleHierarchyLines();
        expect((useUIStore.getState() as UIStoreState).showHierarchyLines).toBe(true);
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
        expect(useUIStore.getState().columnWidths.notification).toBe(44);
        expect(useUIStore.getState().issueDialogUrl).toBe('/redmine/issues/10');
        expect(useUIStore.getState().isSidebarResizing).toBe(true);

        useUIStore.getState().closeIssueDialog();
        useUIStore.getState().setSidebarResizing(false);
        expect(useUIStore.getState().issueDialogUrl).toBeNull();
        expect(useUIStore.getState().isSidebarResizing).toBe(false);
    });

    it('keeps columnSettings aligned with visibleColumns updates', () => {
        const columnSettings = buildColumnSettingsFromVisibleKeys(getColumnDefinitions(), ['id', 'subject', 'status']);

        useUIStore.setState({ visibleColumns: ['id', 'subject', 'status'], columnSettings });

        expect(useUIStore.getState().columnSettings.filter((column) => column.visible).map((column) => column.key).sort()).toEqual(['id', 'status', 'subject'].sort());
        expect(useUIStore.getState().visibleColumns.sort()).toEqual(['id', 'status', 'subject'].sort());
    });

    it('resets relation preferences including auto schedule move mode', () => {
        useUIStore.getState().setAutoScheduleMoveMode('off');
        expect(useUIStore.getState().autoScheduleMoveMode).toBe('off');

        useUIStore.getState().resetRelationPreferences();
        expect(useUIStore.getState().autoScheduleMoveMode).toBe('constraint_push');
    });

    it('loads display preference source metadata on store initialization', async () => {
        window.localStorage.setItem('canvasGantt:preferences', JSON.stringify({
            version: 4,
            general: {},
            display: {
                projects: {
                    'project:1': {
                        showBaseline: true,
                        sidebarWidth: 444
                    }
                },
                global: {
                    enabled: true,
                    preferences: {
                        showTaskTitles: false,
                        sidebarWidth: 420
                    }
                }
            }
        }));

        vi.resetModules();
        const { useUIStore: freshUIStore } = await import('./UIStore');

        expect(freshUIStore.getState().displayPreferencesSource).toBe('global');
        expect(freshUIStore.getState().displayPreferencesGlobalEnabled).toBe(true);
        expect(freshUIStore.getState().showTaskTitles).toBe(false);
        expect(freshUIStore.getState().sidebarWidth).toBe(420);
    });
});
