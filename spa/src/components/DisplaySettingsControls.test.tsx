import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { DisplaySettingsControls } from './DisplaySettingsControls';
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
                label_display_settings: 'Display settings',
                label_settings: 'Settings',
                help_label_autosave: 'Auto Save'
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

    it('saves the display snapshot when sharing is toggled from the chart popup', () => {
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
            sidebarFontSize: 15,
            displayPreferencesGlobalEnabled: false
        });

        render(
            <DisplaySettingsControls
                displaySettingsMenuRef={displaySettingsMenuRef}
                showDisplaySettingsMenu={true}
                onToggleDisplaySettingsMenu={vi.fn()}
            />
        );

        const shareCheckbox = screen.getByLabelText('Share settings across all projects');
        expect(shareCheckbox).not.toBeChecked();

        fireEvent.click(shareCheckbox);

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
                sidebarFontSize: 15,
                autoSave: false
            }),
            true
        );
        expect(useUIStore.getState().displayPreferencesGlobalEnabled).toBe(true);

        fireEvent.click(shareCheckbox);
        expect(vi.mocked(preferences.saveDisplayPreferences)).toHaveBeenCalledWith(expect.any(Object), 1);
        expect(vi.mocked(preferences.saveGlobalDisplayPreferences)).toHaveBeenLastCalledWith(expect.any(Object), false);
        expect(useUIStore.getState().displayPreferencesGlobalEnabled).toBe(false);
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
        expect(within(screen.getByTestId('display-settings-menu')).getByText('Settings')).toBeInTheDocument();
        expect(screen.getByTestId('display-settings-menu-button')).toHaveAttribute('title', 'Settings');
        expect(screen.getByTestId('display-settings-menu-button')).toHaveAttribute('aria-label', 'Settings');
        expect(screen.getByTestId('display-settings-menu')).toHaveStyle({
            maxHeight: '340px',
            overflowY: 'auto'
        });
        expect(screen.getByLabelText('Row height').parentElement?.parentElement).toHaveStyle({
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'
        });
        expect(screen.getByLabelText('Organize by dependency')).toBeInTheDocument();
        expect(screen.getByLabelText('Start-date-only tasks')).toBeChecked();
        expect(screen.getByLabelText('Due-date-only tasks')).toBeChecked();
        expect(screen.getByLabelText('Ticket titles')).toBeChecked();
        expect(screen.getByLabelText('Task-bar dates')).not.toBeChecked();
        expect(screen.getByLabelText('Hierarchy lines')).toBeChecked();
        expect(screen.getByLabelText('Share settings across all projects')).not.toBeChecked();
        expect(screen.getByLabelText('Auto Save')).toHaveAttribute('role', 'switch');
        expect(screen.getByLabelText('Auto Save').parentElement).toHaveStyle({ width: '32px', height: '18px' });
        expect(screen.getByTestId('display-settings-row-height-select')).toHaveValue('36');
        expect(screen.getByTestId('display-settings-font-size-select')).toHaveValue('13');
        expect(screen.getByTestId('display-settings-menu-button')).toHaveStyle({
            backgroundColor: 'rgb(255, 255, 255)'
        });
        expect(screen.queryByTestId('display-settings-active-indicator')).not.toBeInTheDocument();
        expect(screen.queryByTestId('display-settings-save-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('display-settings-scope-menu-button')).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Progress line'));
        fireEvent.click(screen.getByLabelText('Organize by dependency'));
        fireEvent.click(screen.getByLabelText('Start-date-only tasks'));
        fireEvent.click(screen.getByLabelText('Hierarchy lines'));
        fireEvent.change(screen.getByTestId('display-settings-row-height-select'), { target: { value: '52' } });
        fireEvent.change(screen.getByTestId('display-settings-font-size-select'), { target: { value: '15' } });

        expect(useUIStore.getState().showProgressLine).toBe(true);
        expect(useTaskStore.getState().organizeByDependency).toBe(true);
        expect(useUIStore.getState().showStartDateOnly).toBe(false);
        expect(useUIStore.getState().showDueDateOnly).toBe(true);
        expect(useUIStore.getState().showHierarchyLines).toBe(false);
        expect(useTaskStore.getState().viewport.rowHeight).toBe(52);
        expect(useUIStore.getState().sidebarFontSize).toBe(15);

        fireEvent.click(screen.getByLabelText('Auto Save'));
        expect(useTaskStore.getState().autoSave).toBe(true);
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

    it('uses the Auto Save transition action and disables the switch while enabling', () => {
        const displaySettingsMenuRef = React.createRef<HTMLDivElement>();
        const requestAutoSaveChange = vi.fn();
        useTaskStore.setState({ requestAutoSaveChange });

        render(
            <DisplaySettingsControls
                displaySettingsMenuRef={displaySettingsMenuRef}
                showDisplaySettingsMenu={true}
                onToggleDisplaySettingsMenu={vi.fn()}
            />
        );

        fireEvent.click(screen.getByLabelText('Auto Save'));
        expect(requestAutoSaveChange).toHaveBeenCalledWith(true);

        act(() => {
            useTaskStore.setState({ autoSaveTransition: 'enabling' });
        });
        expect(screen.getByLabelText('Auto Save')).toBeDisabled();
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
