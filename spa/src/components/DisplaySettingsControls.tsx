import React from 'react';

import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import { i18n } from '../utils/i18n';
import {
    buildStoredDisplayPreferences,
    saveDisplayPreferences,
    saveGlobalDisplayPreferences
} from '../utils/preferences';
import { fontFamilies, designTokens } from '../styles/designTokens';

const DEFAULT_DISPLAY_SETTINGS = {
    showProgressLine: false,
    organizeByDependency: false,
    showStartDateOnly: true,
    showDueDateOnly: true,
    showTaskTitles: true,
    showTaskBarDates: false,
    showHierarchyLines: true
} as const;

interface DisplaySettingsControlsProps {
    displaySettingsMenuRef: React.RefObject<HTMLDivElement | null>;
    className?: string;
    showDisplaySettingsMenu: boolean;
    onToggleDisplaySettingsMenu: () => void;
}

interface DisplaySettingSwitchProps {
    checked: boolean;
    label: string;
    onChange: React.ChangeEventHandler<HTMLInputElement>;
}

const DisplaySettingSwitch: React.FC<DisplaySettingSwitchProps> = ({ checked, label, onChange }) => (
    <label
        style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            minHeight: 32,
            padding: '2px 0',
            cursor: 'pointer'
        }}
    >
        <span>{label}</span>
        <span style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto', width: 32, height: 18 }}>
            <input
                type="checkbox"
                role="switch"
                checked={checked}
                onChange={onChange}
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    margin: 0,
                    opacity: 0,
                    cursor: 'pointer'
                }}
            />
            <span
                aria-hidden="true"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: 2,
                    borderRadius: 9999,
                    background: checked ? designTokens.brandPrimary : designTokens.controlBorder,
                    boxShadow: designTokens.controlInsetShadow,
                    transition: 'background-color 150ms ease'
                }}
            >
                <span
                    style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: designTokens.controlBg,
                        boxShadow: designTokens.controlActiveShadow,
                        transform: checked ? 'translateX(14px)' : 'translateX(0)',
                        transition: 'transform 150ms ease'
                    }}
                />
            </span>
        </span>
    </label>
);

export const DisplaySettingsControls: React.FC<DisplaySettingsControlsProps> = ({
    displaySettingsMenuRef,
    className,
    showDisplaySettingsMenu,
    onToggleDisplaySettingsMenu
}) => {
    const {
        zoomLevel,
        viewMode,
        viewport,
        showVersions,
        organizeByDependency,
        setOrganizeByDependency,
        setRowHeight,
        customScales,
        autoSave,
        setAutoSave
    } = useTaskStore();
    const {
        showProgressLine,
        showTaskTitles,
        showTaskBarDates,
        showHierarchyLines,
        showPointsOrphans,
        toggleHierarchyLines,
        showStartDateOnly,
        showDueDateOnly,
        toggleProgressLine,
        toggleStartDateOnly,
        toggleDueDateOnly,
        toggleTaskTitles,
        toggleTaskBarDates,
        showBaseline,
        visibleColumns,
        columnSettings,
        columnWidths,
        sidebarWidth,
        sidebarFontSize,
        setSidebarFontSize,
        displayPreferencesGlobalEnabled,
        setDisplayPreferencesGlobalEnabled,
        leftPaneVisible,
        rightPaneVisible,
        toggleLeftPane,
        toggleRightPane
    } = useUIStore();
    const rowHeightOptions = [
        { value: 20, label: i18n.t('label_row_height_xs') || 'XS' },
        { value: 28, label: i18n.t('label_row_height_s') || 'S' },
        { value: 36, label: i18n.t('label_row_height_m') || 'M' },
        { value: 44, label: i18n.t('label_row_height_l') || 'L' },
        { value: 52, label: i18n.t('label_row_height_xl') || 'XL' }
    ];
    const fontSizeOptions = [
        { value: 11, label: i18n.t('label_font_size_small') || 'Small' },
        { value: 13, label: i18n.t('label_font_size_medium') || 'Medium' },
        { value: 15, label: i18n.t('label_font_size_large') || 'Large' }
    ];
    const hasActiveDisplaySetting = showProgressLine !== DEFAULT_DISPLAY_SETTINGS.showProgressLine
        || organizeByDependency !== DEFAULT_DISPLAY_SETTINGS.organizeByDependency
        || showStartDateOnly !== DEFAULT_DISPLAY_SETTINGS.showStartDateOnly
        || showDueDateOnly !== DEFAULT_DISPLAY_SETTINGS.showDueDateOnly
        || showTaskTitles !== DEFAULT_DISPLAY_SETTINGS.showTaskTitles
        || showTaskBarDates !== DEFAULT_DISPLAY_SETTINGS.showTaskBarDates
        || showHierarchyLines !== DEFAULT_DISPLAY_SETTINGS.showHierarchyLines;
    const isLeftPaneMaximized = leftPaneVisible && !rightPaneVisible;
    const isRightPaneMaximized = !leftPaneVisible && rightPaneVisible;
    const selectedPaneMode = isLeftPaneMaximized
        ? 'list'
        : isRightPaneMaximized
            ? 'chart'
            : 'standard';

    const selectPaneMode = (mode: 'standard' | 'list' | 'chart') => {
        if (mode === selectedPaneMode) return;

        if (mode === 'standard') {
            if (isLeftPaneMaximized) toggleRightPane();
            if (isRightPaneMaximized) toggleLeftPane();
            return;
        }

        if (mode === 'list') {
            toggleRightPane();
        } else {
            toggleLeftPane();
        }
    };

    const projectId = window.RedmineCanvasGantt?.projectId;
    const setShareAcrossProjects = (shareAcrossProjects: boolean) => {
        const snapshot = buildStoredDisplayPreferences({
            zoomLevel,
            viewMode,
            viewport: {
                startDate: viewport.startDate,
                scrollX: viewport.scrollX,
                scrollY: viewport.scrollY,
                scale: viewport.scale
            },
            showProgressLine,
            showTaskTitles,
            showTaskBarDates,
            showHierarchyLines,
            showPointsOrphans,
            showStartDateOnly,
            showDueDateOnly,
            showVersions,
            showBaseline,
            visibleColumns,
            columnSettings,
            organizeByDependency,
            columnWidths,
            sidebarWidth,
            customScales,
            rowHeight: viewport.rowHeight,
            sidebarFontSize,
            autoSave
        });

        if (shareAcrossProjects) {
            saveGlobalDisplayPreferences(snapshot, true);
        } else {
            saveDisplayPreferences(snapshot, projectId);
            saveGlobalDisplayPreferences(snapshot, false);
        }
        setDisplayPreferencesGlobalEnabled(shareAcrossProjects);
    };

    return (
        <div ref={displaySettingsMenuRef} className={className} style={{ display: 'flex', alignItems: 'center', marginLeft: '0', position: 'relative' }}>
            <button
                type="button"
                onClick={onToggleDisplaySettingsMenu}
                className="gantt-toolbar-labeled-button"
                title={i18n.t('label_settings') || 'Settings'}
                aria-label={i18n.t('label_settings') || 'Settings'}
                data-testid="display-settings-menu-button"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    border: `1px solid ${designTokens.controlBorder}`,
                    backgroundColor: hasActiveDisplaySetting ? designTokens.controlActiveBg : designTokens.controlBg,
                    color: hasActiveDisplaySetting ? designTokens.controlActiveFg : designTokens.controlFg,
                    cursor: 'pointer',
                    height: '32px',
                    position: 'relative'
                }}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                    <circle cx="9" cy="6" r="2" fill={designTokens.controlBg} />
                    <circle cx="15" cy="12" r="2" fill={designTokens.controlBg} />
                    <circle cx="8" cy="18" r="2" fill={designTokens.controlBg} />
                </svg>
                <span className="gantt-toolbar-button-label">
                    {i18n.t('label_settings') || 'Settings'}
                </span>
                {hasActiveDisplaySetting && (
                    <div
                        data-testid="display-settings-active-indicator"
                        style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.controlActiveFg, borderRadius: '50%' }}
                    />
                )}
            </button>

            {showDisplaySettingsMenu && (
                <div
                    data-testid="display-settings-menu"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 4,
                        background: designTokens.controlBg,
                        border: `1px solid ${designTokens.controlBorder}`,
                        borderRadius: 8,
                        boxShadow: designTokens.menuShadow,
                        padding: 12,
                        minWidth: 280,
                        maxHeight: '340px',
                        overflowY: 'auto',
                        zIndex: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        fontFamily: fontFamilies.ui,
                        fontSize: '13px',
                        lineHeight: 1.5
                    }}
                >
                    <div>
                        <div style={{ fontFamily: fontFamilies.ui, fontWeight: 600, marginBottom: 4 }}>
                            {i18n.t('label_settings') || 'Settings'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
                            <DisplaySettingSwitch
                                checked={autoSave}
                                onChange={(event) => setAutoSave(event.target.checked)}
                                label={i18n.t('help_label_autosave') || 'Auto Save'}
                            />
                            <DisplaySettingSwitch
                                checked={displayPreferencesGlobalEnabled}
                                onChange={(event) => setShareAcrossProjects(event.target.checked)}
                                label={i18n.t('label_share_display_settings_across_projects') || 'Share settings across all projects'}
                            />
                        </div>

                        <div style={{ fontFamily: fontFamilies.ui, fontWeight: 600, marginTop: 12, marginBottom: 4 }}>
                            {i18n.t('label_display_short') || 'Display'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <DisplaySettingSwitch checked={showProgressLine} onChange={toggleProgressLine} label={i18n.t('label_progress_line') || 'Progress line'} />
                            <DisplaySettingSwitch checked={organizeByDependency} onChange={() => setOrganizeByDependency(!organizeByDependency)} label={i18n.t('label_organize_by_dependency') || 'Organize by dependency'} />
                            <DisplaySettingSwitch checked={showStartDateOnly} onChange={toggleStartDateOnly} label={i18n.t('label_show_start_date_only') || 'Start-date-only tasks'} />
                            <DisplaySettingSwitch checked={showDueDateOnly} onChange={toggleDueDateOnly} label={i18n.t('label_show_due_date_only') || 'Due-date-only tasks'} />
                            <DisplaySettingSwitch checked={showTaskTitles} onChange={toggleTaskTitles} label={i18n.t('label_toggle_task_titles') || 'Ticket titles'} />
                            <DisplaySettingSwitch checked={showTaskBarDates} onChange={toggleTaskBarDates} label={i18n.t('label_toggle_task_bar_dates') || 'Task-bar dates'} />
                            <DisplaySettingSwitch checked={showHierarchyLines} onChange={toggleHierarchyLines} label={i18n.t('label_toggle_hierarchy_lines') || 'Hierarchy lines'} />
                        </div>

                        <div
                            role="group"
                            aria-label={i18n.t('label_pane_layout') || 'Pane layout'}
                            data-testid="pane-layout-selector"
                            style={{
                                display: 'flex',
                                alignItems: 'stretch',
                                gap: 4,
                                marginTop: 10,
                                padding: 3,
                                background: designTokens.controlBorder,
                                borderRadius: 12
                            }}
                        >
                            <button
                                type="button"
                                data-testid="maximize-left-pane-button"
                                aria-pressed={selectedPaneMode === 'list'}
                                onClick={() => selectPaneMode('list')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flex: 1,
                                    gap: 6,
                                    minWidth: 0,
                                    minHeight: 30,
                                    padding: '0 8px',
                                    border: 0,
                                    background: selectedPaneMode === 'list' ? designTokens.controlBg : 'transparent',
                                    color: selectedPaneMode === 'list' ? designTokens.controlFg : designTokens.controlActiveFg,
                                    borderRadius: 9,
                                    boxShadow: selectedPaneMode === 'list' ? designTokens.controlActiveShadow : 'none',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    fontFamily: fontFamilies.ui,
                                    fontSize: 12,
                                    fontWeight: selectedPaneMode === 'list' ? 600 : 500,
                                    lineHeight: 1.2,
                                    order: 2
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M4 5h16M4 12h16M4 19h16" />
                                    <path d="M4 5v14" />
                                </svg>
                                {i18n.t('label_maximize_left_pane') || 'Maximize List'}
                            </button>
                            <button
                                type="button"
                                data-testid="standard-pane-button"
                                aria-pressed={selectedPaneMode === 'standard'}
                                onClick={() => selectPaneMode('standard')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flex: 1,
                                    gap: 6,
                                    minWidth: 0,
                                    minHeight: 30,
                                    padding: '0 8px',
                                    border: 0,
                                    background: selectedPaneMode === 'standard' ? designTokens.controlBg : 'transparent',
                                    color: selectedPaneMode === 'standard' ? designTokens.controlFg : designTokens.controlActiveFg,
                                    borderRadius: 9,
                                    boxShadow: selectedPaneMode === 'standard' ? designTokens.controlActiveShadow : 'none',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    fontFamily: fontFamilies.ui,
                                    fontSize: 12,
                                    fontWeight: selectedPaneMode === 'standard' ? 600 : 500,
                                    lineHeight: 1.2,
                                    order: 1
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="3" y="4" width="18" height="16" rx="1" />
                                    <path d="M9 4v16M3 9h18" />
                                </svg>
                                {i18n.t('label_standard_view') || 'Standard'}
                            </button>
                            <button
                                type="button"
                                data-testid="maximize-right-pane-button"
                                aria-pressed={selectedPaneMode === 'chart'}
                                onClick={() => selectPaneMode('chart')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flex: 1,
                                    gap: 6,
                                    minWidth: 0,
                                    minHeight: 30,
                                    padding: '0 8px',
                                    border: 0,
                                    background: selectedPaneMode === 'chart' ? designTokens.controlBg : 'transparent',
                                    color: selectedPaneMode === 'chart' ? designTokens.controlFg : designTokens.controlActiveFg,
                                    borderRadius: 9,
                                    boxShadow: selectedPaneMode === 'chart' ? designTokens.controlActiveShadow : 'none',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    fontFamily: fontFamilies.ui,
                                    fontSize: 12,
                                    fontWeight: selectedPaneMode === 'chart' ? 600 : 500,
                                    lineHeight: 1.2,
                                    order: 3
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M4 20V5M4 20h16" />
                                    <path d="m8 16 3-4 3 2 5-7" />
                                </svg>
                                {i18n.t('label_maximize_right_pane') || 'Maximize Chart'}
                            </button>
                        </div>

                        <div style={{ borderTop: `1px solid ${designTokens.borderSubtle}`, marginTop: 8, paddingTop: 8, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                            <label style={{ display: 'grid', gap: 4 }}>
                                <span>{i18n.t('label_row_height') || 'Row height'}</span>
                                <select
                                    data-testid="display-settings-row-height-select"
                                    aria-label={i18n.t('label_row_height') || 'Row height'}
                                    value={viewport.rowHeight}
                                    onChange={(event) => setRowHeight(Number(event.target.value))}
                                    style={{ height: 30, borderRadius: 6, border: `1px solid ${designTokens.controlBorderStrong}`, background: designTokens.controlBg, padding: '0 8px' }}
                                >
                                    {rowHeightOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                            <label style={{ display: 'grid', gap: 4 }}>
                                <span>{i18n.t('label_font_size') || 'Font size'}</span>
                                <select
                                    data-testid="display-settings-font-size-select"
                                    aria-label={i18n.t('label_font_size') || 'Font size'}
                                    value={sidebarFontSize}
                                    onChange={(event) => setSidebarFontSize(Number(event.target.value))}
                                    style={{ height: 30, borderRadius: 6, border: `1px solid ${designTokens.controlBorderStrong}`, background: designTokens.controlBg, padding: '0 8px' }}
                                >
                                    {fontSizeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};
