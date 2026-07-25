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

interface DisplaySettingsScopeControlsProps {
    displaySettingsScopeMenuRef: React.RefObject<HTMLDivElement | null>;
    className?: string;
    showDisplaySettingsScopeMenu: boolean;
    onToggleDisplaySettingsScopeMenu: () => void;
    onCloseDisplaySettingsScopeMenu: () => void;
}

const resolveSourceLabel = (source: 'project' | 'global' | 'default') => {
    switch (source) {
        case 'project':
            return i18n.t('label_display_settings_source_project') || "This project's settings";
        case 'global':
            return i18n.t('label_display_settings_source_global') || 'Shared settings across all projects';
        default:
            return i18n.t('label_display_settings_source_default') || 'Default settings';
    }
};

export const DisplaySettingsScopeControls: React.FC<DisplaySettingsScopeControlsProps> = ({
    displaySettingsScopeMenuRef,
    className,
    showDisplaySettingsScopeMenu,
    onToggleDisplaySettingsScopeMenu,
    onCloseDisplaySettingsScopeMenu
}) => {
    const {
        zoomLevel,
        viewMode,
        viewport,
        showVersions,
        organizeByDependency,
        customScales
    } = useTaskStore();
    const {
        showProgressLine,
        showTaskTitles,
        showTaskBarDates,
        showHierarchyLines,
        showPointsOrphans,
        showStartDateOnly,
        showDueDateOnly,
        showBaseline,
        visibleColumns,
        columnSettings,
        columnWidths,
        sidebarWidth,
        sidebarFontSize,
        setDisplayPreferencesGlobalEnabled
    } = useUIStore();
    const projectId = window.RedmineCanvasGantt?.projectId;
    const displayPreferences = loadDisplayPreferencesWithSource(projectId);
    const [draftShareAcrossProjects, setDraftShareAcrossProjects] = React.useState(displayPreferences.globalEnabled);

    React.useEffect(() => {
        if (!showDisplaySettingsScopeMenu) return;
        setDraftShareAcrossProjects(loadDisplayPreferencesWithSource(projectId).globalEnabled);
    }, [projectId, showDisplaySettingsScopeMenu]);

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

        if (draftShareAcrossProjects) {
            saveGlobalDisplayPreferences(snapshot, true);
            setDisplayPreferencesGlobalEnabled(true);
        } else {
            saveDisplayPreferences(snapshot, projectId);
            saveGlobalDisplayPreferences(snapshot, false);
            setDisplayPreferencesGlobalEnabled(false);
        }
        onCloseDisplaySettingsScopeMenu();
    };

    const menuIsActive = displayPreferences.source !== 'default';

    return (
        <div ref={displaySettingsScopeMenuRef} className={className} style={{ display: 'flex', alignItems: 'center', marginLeft: '8px', position: 'relative' }}>
            <button
                type="button"
                onClick={onToggleDisplaySettingsScopeMenu}
                className="gantt-toolbar-labeled-button"
                title={i18n.t('label_display_settings_scope') || 'Display settings scope'}
                aria-label={i18n.t('label_display_settings_scope') || 'Display settings scope'}
                data-testid="display-settings-scope-menu-button"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    border: `1px solid ${designTokens.controlBorder}`,
                    backgroundColor: menuIsActive ? designTokens.controlActiveBg : designTokens.controlBg,
                    color: menuIsActive ? designTokens.controlActiveFg : designTokens.controlFg,
                    cursor: 'pointer',
                    height: '32px',
                    position: 'relative'
                }}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="2" />
                    <circle cx="18" cy="6" r="2" />
                    <circle cx="12" cy="18" r="2" />
                    <path d="M8 6h8" />
                    <path d="m7 8 3 8" />
                    <path d="m17 8-3 8" />
                </svg>
                <span className="gantt-toolbar-button-label">
                    {i18n.t('label_display_short') || 'Display'}
                </span>
                {menuIsActive && <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: designTokens.iconActiveDot, borderRadius: '50%' }} />}
            </button>

            {showDisplaySettingsScopeMenu && (
                <div data-testid="display-settings-scope-menu" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: designTokens.controlBg, border: `1px solid ${designTokens.controlBorder}`, borderRadius: 8, boxShadow: designTokens.menuShadow, padding: 12, minWidth: 280, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: fontFamilies.ui, fontSize: '13px', lineHeight: 1.5 }}>
                    <div>
                        <div style={{ fontFamily: fontFamilies.mid, fontWeight: 600, marginBottom: 8 }}>
                            {i18n.t('label_display_settings') || 'Display settings'}
                        </div>
                        <div style={{ fontSize: 13, color: designTokens.textMuted, lineHeight: 1.5 }}>
                            <span>{i18n.t('label_display_settings_source') || 'Currently using'}</span>
                            <span>{': '}</span>
                            <span>{resolveSourceLabel(displayPreferences.source)}</span>
                        </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={draftShareAcrossProjects} onChange={(event) => setDraftShareAcrossProjects(event.target.checked)} />
                        <span>{i18n.t('label_share_display_settings_across_projects') || 'Share settings across all projects'}</span>
                    </label>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button type="button" onClick={onCloseDisplaySettingsScopeMenu} style={{ border: `1px solid ${designTokens.controlBorderStrong}`, background: designTokens.controlBg, borderRadius: 6, height: 28, padding: '0 8px', cursor: 'pointer' }}>
                            {i18n.t('button_cancel') || 'Cancel'}
                        </button>
                        <button type="button" onClick={handleSave} data-testid="display-settings-scope-save-button" style={{ border: `1px solid ${designTokens.brandPrimaryStrong}`, background: designTokens.brandPrimaryStrong, color: designTokens.controlBg, borderRadius: 6, height: 28, padding: '0 8px', cursor: 'pointer' }}>
                            {i18n.t('button_save') || 'Save'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
