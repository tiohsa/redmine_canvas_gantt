import React from 'react';

import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';
import {
    buildStoredDisplayPreferences,
    loadDisplayPreferencesWithSource,
    saveDisplayPreferences,
    saveGlobalDisplayPreferences
} from '../utils/preferences';
import { i18n } from '../utils/i18n';
import { fontFamilies, designTokens } from '../styles/designTokens';

interface DisplaySettingsControlsProps {
    displaySettingsMenuRef: React.RefObject<HTMLDivElement | null>;
    className?: string;
    showDisplaySettingsMenu: boolean;
    onToggleDisplaySettingsMenu: () => void;
    onCloseDisplaySettingsMenu: () => void;
}

export const DisplaySettingsControls: React.FC<DisplaySettingsControlsProps> = ({
    displaySettingsMenuRef,
    className,
    showDisplaySettingsMenu,
    onToggleDisplaySettingsMenu,
    onCloseDisplaySettingsMenu
}) => {
    const {
        zoomLevel,
        viewMode,
        viewport,
        showVersions,
        organizeByDependency,
        setOrganizeByDependency,
        setRowHeight,
        customScales
    } = useTaskStore();
    const {
        showProgressLine,
        showTaskTitles,
        showTaskBarDates,
        showHierarchyLines,
        toggleHierarchyLines,
        showPointsOrphans,
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
        setSidebarFontSize
    } = useUIStore();
    const projectId = window.RedmineCanvasGantt?.projectId;
    const displayPreferences = loadDisplayPreferencesWithSource(projectId);
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
    const handleSave = () => {
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
            sidebarFontSize
        });

        if (displayPreferences.globalEnabled) {
            saveGlobalDisplayPreferences(snapshot, true);
        } else {
            saveDisplayPreferences(snapshot, projectId);
        }
        onCloseDisplaySettingsMenu();
    };

    return (
        <div ref={displaySettingsMenuRef} className={className} style={{ display: 'flex', alignItems: 'center', marginLeft: '8px', position: 'relative' }}>
            <button
                type="button"
                onClick={onToggleDisplaySettingsMenu}
                title={i18n.t('label_display_settings_visibility') || 'Chart display'}
                aria-label={i18n.t('label_display_settings_visibility') || 'Chart display'}
                data-testid="display-settings-menu-button"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0',
                    borderRadius: '6px',
                    border: `1px solid ${designTokens.controlBorder}`,
                    backgroundColor: designTokens.controlBg,
                    color: designTokens.controlFg,
                    cursor: 'pointer',
                    height: '32px',
                    width: '32px',
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
            </button>

            {showDisplaySettingsMenu && (
                <div
                    data-testid="display-settings-menu"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 8,
                        background: designTokens.controlBg,
                        border: `1px solid ${designTokens.controlBorder}`,
                        borderRadius: 8,
                        boxShadow: designTokens.menuShadow,
                        padding: 12,
                        minWidth: 280,
                        zIndex: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        fontFamily: fontFamilies.ui,
                        fontSize: '13px',
                        lineHeight: 1.5
                    }}
                >
                    <div style={{ borderTop: `1px solid ${designTokens.borderSubtle}`, paddingTop: 8 }}>
                        <div style={{ fontFamily: fontFamilies.mid, fontWeight: 600, marginBottom: 4 }}>
                            {i18n.t('label_display_settings_visibility') || 'Chart display'}
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                            <input type="checkbox" checked={showProgressLine} onChange={toggleProgressLine} />
                            <span>{i18n.t('label_progress_line') || 'Progress line'}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                            <input type="checkbox" checked={organizeByDependency} onChange={() => setOrganizeByDependency(!organizeByDependency)} />
                            <span>{i18n.t('label_organize_by_dependency') || 'Organize by dependency'}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                            <input type="checkbox" checked={showStartDateOnly} onChange={toggleStartDateOnly} />
                            <span>{i18n.t('label_show_start_date_only') || 'Show start-date-only tasks'}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                            <input type="checkbox" checked={showDueDateOnly} onChange={toggleDueDateOnly} />
                            <span>{i18n.t('label_show_due_date_only') || 'Show due-date-only tasks'}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                            <input type="checkbox" checked={showTaskTitles} onChange={toggleTaskTitles} />
                            <span>{i18n.t('label_toggle_task_titles') || 'Show tickets'}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                            <input type="checkbox" checked={showTaskBarDates} onChange={toggleTaskBarDates} />
                            <span>{i18n.t('label_toggle_task_bar_dates') || 'Show task-bar dates'}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                            <input type="checkbox" checked={showHierarchyLines} onChange={toggleHierarchyLines} />
                            <span>{i18n.t('label_toggle_hierarchy_lines') || 'Show hierarchy lines'}</span>
                        </label>

                        <div style={{ borderTop: `1px solid ${designTokens.borderSubtle}`, marginTop: 8, paddingTop: 8, display: 'grid', gap: 8 }}>
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

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                            type="button"
                            onClick={onCloseDisplaySettingsMenu}
                            style={{
                                border: `1px solid ${designTokens.controlBorderStrong}`,
                                background: designTokens.controlBg,
                                borderRadius: 6,
                                height: 28,
                                padding: '0 8px',
                                cursor: 'pointer'
                            }}
                        >
                            {i18n.t('button_cancel') || 'Cancel'}
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            data-testid="display-settings-save-button"
                            style={{
                                border: `1px solid ${designTokens.brandPrimaryStrong}`,
                                background: designTokens.brandPrimaryStrong,
                                color: designTokens.controlBg,
                                borderRadius: 6,
                                height: 28,
                                padding: '0 8px',
                                cursor: 'pointer'
                            }}
                        >
                            {i18n.t('button_save') || 'Save'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
