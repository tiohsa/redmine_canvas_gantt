import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { DisplaySettingsControls } from './DisplaySettingsControls';
import { DisplaySettingsScopeControls } from './DisplaySettingsScopeControls';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import * as preferences from '../utils/preferences';

vi.mock('../utils/preferences', async () => {
    const actual = await vi.importActual<typeof import('../utils/preferences')>('../utils/preferences');
        return {
            ...actual,
            loadDisplayPreferencesWithSource: vi.fn(() => ({
                source: 'default',
                preferences: {},
                globalEnabled: false
            })),
            saveDisplayPreferences: vi.fn(),
            saveGlobalDisplayPreferences: vi.fn()
        };
    });

describe('DisplaySettingsControls', () => {
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
            i18n: {
                label_display_settings_visibility: 'Chart',
                label_display_settings_heading: 'Chart display'
            }
        };
        useTaskStore.setState(useTaskStore.getInitialState(), true);
        useUIStore.setState(useUIStore.getInitialState(), true);
        vi.clearAllMocks();
        vi.mocked(preferences.loadDisplayPreferencesWithSource).mockReturnValue({
            source: 'project',
            preferences: {},
            globalEnabled: true
        });
    });

    it('keeps the shared-scope save button and saves the global display snapshot', () => {
        const taskState = useTaskStore.getState();
        const uiState = useUIStore.getState();
        const displaySettingsMenuRef = React.createRef<HTMLDivElement>();

        useTaskStore.setState({
            zoomLevel: 2,
            viewMode: 'Month',
            viewport: {
                ...taskState.viewport,
                startDate: 123,
                scrollX: 45,
                scrollY: 67,
                scale: 1.5,
                rowHeight: 44
            },
            showVersions: false,
            organizeByDependency: true,
            customScales: { 2: 1.25 }
        });
        useUIStore.setState({
            showProgressLine: true,
            showTaskTitles: false,
            showTaskBarDates: true,
            showHierarchyLines: false,
            showPointsOrphans: false,
            showBaseline: true,
            visibleColumns: uiState.visibleColumns,
            columnSettings: uiState.columnSettings,
            columnWidths: uiState.columnWidths,
            sidebarWidth: 420,
            sidebarFontSize: 15
        });

        render(
            <DisplaySettingsScopeControls
                displaySettingsScopeMenuRef={displaySettingsMenuRef}
                showDisplaySettingsScopeMenu={true}
                onToggleDisplaySettingsScopeMenu={vi.fn()}
                onCloseDisplaySettingsScopeMenu={vi.fn()}
            />
        );

        expect(screen.getByText('Currently using')).toBeInTheDocument();
        expect(screen.getByText("This project's settings")).toBeInTheDocument();

        const shareCheckbox = screen.getByLabelText('Share settings across all projects');
        expect(shareCheckbox).toBeChecked();

        fireEvent.click(shareCheckbox);
        expect(shareCheckbox).not.toBeChecked();
        fireEvent.click(screen.getByTestId('display-settings-scope-save-button'));

        expect(vi.mocked(preferences.saveDisplayPreferences)).toHaveBeenCalledWith(
            expect.objectContaining({
                zoomLevel: 2,
                viewMode: 'Month',
                showProgressLine: true,
                showTaskTitles: false,
                showTaskBarDates: true,
                showHierarchyLines: false,
                showPointsOrphans: false,
                showVersions: false,
                showBaseline: true,
                organizeByDependency: true,
                rowHeight: 44,
                sidebarWidth: 420,
                sidebarFontSize: 15
            }),
            1
        );

        expect(vi.mocked(preferences.saveGlobalDisplayPreferences)).toHaveBeenCalledWith(
            expect.objectContaining({
                zoomLevel: 2,
                viewMode: 'Month',
                showProgressLine: true,
                showTaskTitles: false,
                showTaskBarDates: true,
                showHierarchyLines: false,
                showPointsOrphans: false,
                showVersions: false,
                showBaseline: true,
                organizeByDependency: true,
                rowHeight: 44,
                sidebarWidth: 420,
                sidebarFontSize: 15
            }),
            false
        );
    });

    it('groups chart visibility and dependency ordering controls in the popup', () => {
        const displaySettingsMenuRef = React.createRef<HTMLDivElement>();
        useTaskStore.setState({ organizeByDependency: false });
        useTaskStore.setState({ viewport: { ...useTaskStore.getState().viewport, rowHeight: 36 } });
        useUIStore.setState({
            showProgressLine: false,
            showStartDateOnly: true,
            showDueDateOnly: true,
            showTaskTitles: true,
            showTaskBarDates: false,
            showHierarchyLines: true,
            sidebarFontSize: 13
        });

        render(
            <DisplaySettingsControls
                displaySettingsMenuRef={displaySettingsMenuRef}
                showDisplaySettingsMenu={true}
                onToggleDisplaySettingsMenu={vi.fn()}
            />
        );

        expect(screen.getByLabelText('Progress line')).toBeInTheDocument();
        expect(screen.getByText('Chart display')).toBeInTheDocument();
        expect(screen.getByTestId('display-settings-menu-button')).toHaveAttribute('title', 'Chart');
        expect(screen.getByTestId('display-settings-menu-button')).toHaveAttribute('aria-label', 'Chart');
        expect(screen.getByTestId('display-settings-menu')).toHaveStyle({
            maxHeight: '400px',
            overflowY: 'auto'
        });
        expect(screen.getByLabelText('Row height').parentElement?.parentElement).toHaveStyle({
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'
        });
        expect(screen.getByLabelText('Organize by dependency')).toBeInTheDocument();
        expect(screen.getByLabelText('Show start-date-only tasks')).toBeChecked();
        expect(screen.getByLabelText('Show due-date-only tasks')).toBeChecked();
        expect(screen.getByLabelText('Show tickets')).toBeChecked();
        expect(screen.getByLabelText('Show task-bar dates')).not.toBeChecked();
        expect(screen.getByLabelText('Show hierarchy lines')).toBeChecked();
        expect(screen.getByTestId('display-settings-row-height-select')).toHaveValue('36');
        expect(screen.getByTestId('display-settings-font-size-select')).toHaveValue('13');
        expect(screen.getByTestId('display-settings-menu-button')).toHaveStyle({
            backgroundColor: 'rgb(255, 255, 255)'
        });
        expect(screen.queryByTestId('display-settings-active-indicator')).not.toBeInTheDocument();
        expect(screen.queryByTestId('display-settings-save-button')).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Progress line'));
        fireEvent.click(screen.getByLabelText('Organize by dependency'));
        fireEvent.click(screen.getByLabelText('Show start-date-only tasks'));
        fireEvent.click(screen.getByLabelText('Show hierarchy lines'));
        fireEvent.change(screen.getByTestId('display-settings-row-height-select'), { target: { value: '52' } });
        fireEvent.change(screen.getByTestId('display-settings-font-size-select'), { target: { value: '15' } });

        expect(useUIStore.getState().showProgressLine).toBe(true);
        expect(useTaskStore.getState().organizeByDependency).toBe(true);
        expect(useUIStore.getState().showStartDateOnly).toBe(false);
        expect(useUIStore.getState().showDueDateOnly).toBe(true);
        expect(useUIStore.getState().showHierarchyLines).toBe(false);
        expect(useTaskStore.getState().viewport.rowHeight).toBe(52);
        expect(useUIStore.getState().sidebarFontSize).toBe(15);
    });

    it('applies display setting changes immediately without a popup save button', () => {
        const displaySettingsMenuRef = React.createRef<HTMLDivElement>();
        render(
            <DisplaySettingsControls
                displaySettingsMenuRef={displaySettingsMenuRef}
                showDisplaySettingsMenu={true}
                onToggleDisplaySettingsMenu={vi.fn()}
            />
        );

        expect(screen.queryByTestId('display-settings-save-button')).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Progress line'));

        expect(useUIStore.getState().showProgressLine).toBe(true);
    });

    it('keeps pane maximization controls in the popup and leaves it open after toggling', () => {
        const displaySettingsMenuRef = React.createRef<HTMLDivElement>();

        render(
            <DisplaySettingsControls
                displaySettingsMenuRef={displaySettingsMenuRef}
                showDisplaySettingsMenu={true}
                onToggleDisplaySettingsMenu={vi.fn()}
            />
        );

        const leftPaneButton = screen.getByTestId('maximize-left-pane-button');
        const standardPaneButton = screen.getByTestId('standard-pane-button');
        const rightPaneButton = screen.getByTestId('maximize-right-pane-button');

        expect(leftPaneButton).toHaveAttribute('aria-pressed', 'false');
        expect(standardPaneButton).toHaveAttribute('aria-pressed', 'true');
        expect(rightPaneButton).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(leftPaneButton);
        expect(useUIStore.getState().leftPaneVisible).toBe(true);
        expect(useUIStore.getState().rightPaneVisible).toBe(false);
        expect(leftPaneButton).toHaveAttribute('aria-pressed', 'true');
        expect(standardPaneButton).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByTestId('display-settings-menu')).toBeInTheDocument();

        fireEvent.click(rightPaneButton);
        expect(useUIStore.getState().leftPaneVisible).toBe(false);
        expect(useUIStore.getState().rightPaneVisible).toBe(true);
        expect(rightPaneButton).toHaveAttribute('aria-pressed', 'true');
        expect(standardPaneButton).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(standardPaneButton);
        expect(useUIStore.getState().leftPaneVisible).toBe(true);
        expect(useUIStore.getState().rightPaneVisible).toBe(true);
        expect(leftPaneButton).toHaveAttribute('aria-pressed', 'false');
        expect(rightPaneButton).toHaveAttribute('aria-pressed', 'false');
        expect(standardPaneButton).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('display-settings-menu')).toBeInTheDocument();
    });

    it('marks the display settings icon active when a non-default option is enabled', () => {
        const displaySettingsMenuRef = React.createRef<HTMLDivElement>();

        render(
            <DisplaySettingsControls
                displaySettingsMenuRef={displaySettingsMenuRef}
                showDisplaySettingsMenu={true}
                onToggleDisplaySettingsMenu={vi.fn()}
            />
        );

        const menuButton = screen.getByTestId('display-settings-menu-button');
        expect(menuButton).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)' });
        expect(screen.queryByTestId('display-settings-active-indicator')).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Progress line'));

        expect(menuButton).toHaveStyle({ backgroundColor: 'rgb(232, 240, 254)' });
        expect(screen.getByTestId('display-settings-active-indicator')).toBeInTheDocument();
    });
});
