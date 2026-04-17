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

interface DisplaySettingsControlsProps {
    displaySettingsMenuRef: React.RefObject<HTMLDivElement | null>;
    showDisplaySettingsMenu: boolean;
    onToggleDisplaySettingsMenu: () => void;
    onCloseDisplaySettingsMenu: () => void;
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

export const DisplaySettingsControls: React.FC<DisplaySettingsControlsProps> = ({
    displaySettingsMenuRef,
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
        customScales
    } = useTaskStore();
    const {
        showProgressLine,
        showTaskTitles,
        showHierarchyLines,
        showPointsOrphans,
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
        if (!showDisplaySettingsMenu) return;
        setDraftShareAcrossProjects(loadDisplayPreferencesWithSource(projectId).globalEnabled);
    }, [projectId, showDisplaySettingsMenu]);

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
            showHierarchyLines,
            showPointsOrphans,
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
        onCloseDisplaySettingsMenu();
    };

    const menuIsActive = displayPreferences.source !== 'default';

    return (
        <div ref={displaySettingsMenuRef} style={{ display: 'flex', alignItems: 'center', marginLeft: '4px', position: 'relative' }}>
            <button
                type="button"
                onClick={onToggleDisplaySettingsMenu}
                title={i18n.t('label_display_settings') || 'Display settings'}
                data-testid="display-settings-menu-button"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0',
                    borderRadius: '6px',
                    border: '1px solid #e0e0e0',
                    backgroundColor: menuIsActive ? '#e8f0fe' : '#fff',
                    color: menuIsActive ? '#1a73e8' : '#333',
                    cursor: 'pointer',
                    height: '32px',
                    width: '32px',
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
                {menuIsActive && (
                    <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: '#1a73e8', borderRadius: '50%' }} />
                )}
            </button>

            {showDisplaySettingsMenu && (
                <div
                    data-testid="display-settings-menu"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 6,
                        background: '#fff',
                        border: '1px solid #e0e0e0',
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        padding: 12,
                        minWidth: 280,
                        zIndex: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10
                    }}
                >
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>
                            {i18n.t('label_display_settings') || 'Display settings'}
                        </div>
                        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
                            <span>{i18n.t('label_display_settings_source') || 'Currently using'}</span>
                            <span>{': '}</span>
                            <span>{resolveSourceLabel(displayPreferences.source)}</span>
                        </div>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={draftShareAcrossProjects}
                            onChange={(event) => setDraftShareAcrossProjects(event.target.checked)}
                        />
                        <span>{i18n.t('label_share_display_settings_across_projects') || 'Share display settings across all projects'}</span>
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                            type="button"
                            onClick={onCloseDisplaySettingsMenu}
                            style={{
                                border: '1px solid #ddd',
                                background: '#fff',
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
                                border: '1px solid #1d4ed8',
                                background: '#1d4ed8',
                                color: '#fff',
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
