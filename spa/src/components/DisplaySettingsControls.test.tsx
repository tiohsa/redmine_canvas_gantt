import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

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
            i18n: {}
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

    it('shows the current source and saves the global display snapshot', () => {
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
            <DisplaySettingsControls
                displaySettingsMenuRef={displaySettingsMenuRef}
                showDisplaySettingsMenu={true}
                onToggleDisplaySettingsMenu={vi.fn()}
                onCloseDisplaySettingsMenu={vi.fn()}
            />
        );

        expect(screen.getByText('Currently using')).toBeInTheDocument();
        expect(screen.getByText("This project's settings")).toBeInTheDocument();

        const shareCheckbox = screen.getByLabelText('Share settings across all projects');
        expect(shareCheckbox).toBeChecked();

        fireEvent.click(shareCheckbox);
        expect(shareCheckbox).not.toBeChecked();
        fireEvent.click(screen.getByTestId('display-settings-save-button'));

        expect(vi.mocked(preferences.saveDisplayPreferences)).toHaveBeenCalledWith(
            expect.objectContaining({
                zoomLevel: 2,
                viewMode: 'Month',
                showProgressLine: true,
                showTaskTitles: false,
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
});
