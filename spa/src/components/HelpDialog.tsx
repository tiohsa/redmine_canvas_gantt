import React, { useEffect } from 'react';
import { useUIStore } from '../stores/UIStore';
import { i18n } from '../utils/i18n';
import { fontFamilies, designTokens } from '../styles/designTokens';

type HelpItem = {
    icon: React.ReactNode;
    title: string;
    description: string;
    active?: boolean;
};

type HelpSection = {
    title: string;
    items: HelpItem[];
};

const IconWrapper: React.FC<{ children: React.ReactNode; active?: boolean }> = ({ children, active }) => (
    <div
        style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            border: `1px solid ${designTokens.controlBorder}`,
            backgroundColor: active ? designTokens.controlActiveBg : designTokens.controlBg,
            color: active ? designTokens.controlActiveFg : designTokens.controlFg,
            flexShrink: 0
        }}
    >
        {children}
    </div>
);

const HelpRow: React.FC<HelpItem> = ({ icon, title, description, active }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
        <IconWrapper active={active}>{icon}</IconWrapper>
        <div>
            <div style={{ fontFamily: fontFamilies.mid, fontWeight: 600, fontSize: '14px', color: designTokens.controlFg, marginBottom: '4px' }}>
                {title}
            </div>
            <div style={{ fontSize: '13px', color: designTokens.textSecondary, lineHeight: 1.5 }}>
                {description}
            </div>
        </div>
    </div>
);

const HelpSectionCard: React.FC<HelpSection> = ({ title, items }) => (
    <section>
        <h3
            style={{
                fontFamily: fontFamilies.display,
                fontSize: '16px',
                fontWeight: 600,
                color: designTokens.controlActiveFg,
                borderBottom: `2px solid ${designTokens.controlActiveBg}`,
                paddingBottom: '8px',
                marginBottom: '20px'
            }}
        >
            {title}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {items.map((item) => (
                <HelpRow
                    key={`${item.title}-${item.description}`}
                    icon={item.icon}
                    title={item.title}
                    description={item.description}
                    active={item.active}
                />
            ))}
        </div>
    </section>
);

const iconStroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
};

const splitIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
);

const queryIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h10" />
    </svg>
);

const filterIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
);

const columnsIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
);

const sliderIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <path d="M8 6h8" />
        <path d="m7 8 3 8" />
        <path d="m17 8-3 8" />
    </svg>
);

const eyeIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const workloadIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
);

const lineChartIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
);

const hierarchyIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M7 5v14" />
        <path d="M7 5h6" />
        <path d="M7 12h6" />
        <path d="M7 19h6" />
        <path d="M13 5v14" />
        <path d="M13 12h4" />
    </svg>
);

const calendarIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);

const zoomIcon = (
    <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em' }}>M/W/D</div>
);

const rowHeightIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="8 9 12 5 16 9" />
        <polyline points="8 15 12 19 16 15" />
    </svg>
);

const exportIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const fullscreenIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
);

const topIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
        <line x1="5" y1="5" x2="19" y2="5" />
    </svg>
);

const dragIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <line x1="3" y1="12" x2="21" y2="12" />
        <polyline points="8 7 3 12 8 17" />
        <polyline points="16 7 21 12 16 17" />
    </svg>
);

const dependencyIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M4 12h6" />
        <path d="M14 12h6" />
        <circle cx="10" cy="12" r="2" />
        <circle cx="14" cy="12" r="2" />
    </svg>
);

const editIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M4 20l4-1 9-9-3-3-9 9-1 4z" />
        <path d="M13 6l3 3" />
    </svg>
);

const dotsIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
    </svg>
);

const saveIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M5 3h11l3 3v15H5z" />
        <path d="M9 3v6h6" />
        <path d="M9 17h6" />
    </svg>
);

const cancelIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const questionIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" {...iconStroke}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

export const HelpDialog: React.FC = () => {
    const isHelpDialogOpen = useUIStore((state) => state.isHelpDialogOpen);
    const closeHelpDialog = useUIStore((state) => state.closeHelpDialog);

    useEffect(() => {
        if (!isHelpDialogOpen) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeHelpDialog();
            }
        };

        window.addEventListener('keydown', handleEscape, true);
        return () => {
            window.removeEventListener('keydown', handleEscape, true);
        };
    }, [isHelpDialogOpen, closeHelpDialog]);

    if (!isHelpDialogOpen) return null;

    const t = (key: string, fallback: string) => i18n.t(key) || fallback;

    const sections: HelpSection[] = [
        {
            title: t('help_label_layout_filters', '1. Layout and Filters'),
            items: [
                {
                    icon: splitIcon,
                    title: t('label_maximize_left_pane', 'Maximize List / Restore Split View'),
                    description: t('help_desc_maximize_left', 'Expands the task list to fill the screen, hiding the chart. Click again to restore the split view.')
                },
                {
                    icon: splitIcon,
                    title: t('label_maximize_right_pane', 'Maximize Chart / Restore Split View'),
                    description: t('help_desc_maximize_right', 'Expands the Gantt chart to fill the screen, hiding the task list. Click again to restore the split view.')
                },
                {
                    icon: queryIcon,
                    title: t('label_saved_queries', 'Saved Queries'),
                    description: 'Switch between saved query presets, clear the active query, or open the current query in Redmine.'
                },
                {
                    icon: filterIcon,
                    title: t('label_filter_tasks', 'Filter Tasks (Subject)'),
                    description: t('help_desc_filter_tasks', 'Filter the visible tasks by matching the issue subject. Shortcut: Ctrl+F.')
                },
                {
                    icon: editIcon,
                    title: t('label_edit_query_in_redmine', 'Edit Query in Redmine'),
                    description: t('help_desc_edit_query', "Open the current query in Redmine's standard issue list to edit or save the shared filter conditions.")
                },
                {
                    icon: columnsIcon,
                    title: t('label_column_plural', 'Columns'),
                    description: t('help_desc_columns', 'Select which columns are visible in the left task list.')
                },
                {
                    icon: sliderIcon,
                    title: t('label_display_settings', 'Display Settings'),
                    description: 'Save display preferences and optionally share them across all projects.'
                },
                {
                    icon: eyeIcon,
                    title: t('label_show_baseline', 'Baseline'),
                    description: 'Save a baseline snapshot and compare it with the current plan.'
                },
                {
                    icon: workloadIcon,
                    title: t('label_workload', 'Workload'),
                    description: t('help_desc_workload', 'Toggle the workload pane and adjust workload options such as daily capacity threshold, leaf issues only, whether closed issues are included, and whether to focus on today onward only.')
                }
            ]
        },
        {
            title: t('help_label_timeline_view', '2. Timeline and View Controls'),
            items: [
                {
                    icon: calendarIcon,
                    title: `${t('label_prev_month', 'Previous month')} / ${t('label_next_month', 'Next month')}`,
                    description: t('help_desc_prev_next_month', 'Use the previous and next month buttons to jump the visible timeline window by whole months.')
                },
                {
                    icon: calendarIcon,
                    title: t('label_today', 'Today'),
                    description: t('help_desc_today', 'Scrolls the timeline view to center on the current day.')
                },
                {
                    icon: zoomIcon,
                    title: t('help_label_zoom', 'Zoom Levels (Month, Week, Day)'),
                    description: t('help_desc_zoom', 'Adjust the timescale of the Gantt chart. Month view for high-level planning, Day view for details.')
                },
                {
                    icon: rowHeightIcon,
                    title: `${t('label_row_height', 'Row height')} / ${t('label_font_size', 'Font size')}`,
                    description: t('help_desc_row_height', 'Change the vertical size of task rows.')
                },
                {
                    icon: lineChartIcon,
                    title: t('label_progress_line', 'Progress Line'),
                    description: t('help_desc_progress_line', 'Toggle the visibility of a progress line on the chart to visualize if tasks are ahead or behind schedule.')
                },
                {
                    icon: hierarchyIcon,
                    title: t('label_toggle_hierarchy_lines', 'Toggle Hierarchy Lines'),
                    description: 'Show or hide the structural lines in the task list.'
                },
                {
                    icon: eyeIcon,
                    title: t('label_toggle_points_orphans', 'Toggle Orphan Date Points'),
                    description: t('help_desc_points_orphans', 'Show or hide milestone indicators for tasks that only have a start date or a due date.')
                },
                {
                    icon: eyeIcon,
                    title: t('label_toggle_task_titles', 'Toggle Task Titles'),
                    description: t('help_desc_task_titles', 'Show or hide the task titles rendered on the chart next to task bars and milestone points.')
                },
                {
                    icon: dependencyIcon,
                    title: t('label_organize_by_dependency', 'Organize by Dependency'),
                    description: 'Sort tasks so predecessors appear before successors.'
                },
                {
                    icon: sliderIcon,
                    title: t('label_relation_title', 'Dependency Settings'),
                    description: t('help_desc_dependency_settings', 'Configure default dependency behavior, including relation type, auto-calculated delay, auto-applying the default dependency, and how tasks move during auto scheduling.')
                },
                {
                    icon: exportIcon,
                    title: t('label_export', 'Export'),
                    description: t('help_desc_export', 'Export the current Gantt view as a PNG image, or download the visible task data as CSV including hierarchy and dependency columns.')
                },
                {
                    icon: fullscreenIcon,
                    title: t('help_label_fullscreen', 'Full Screen'),
                    description: t('help_desc_fullscreen', 'Toggle full screen mode to maximize your workspace.')
                },
                {
                    icon: topIcon,
                    title: t('button_top', 'Top'),
                    description: 'Scroll the task list back to the top.'
                }
            ]
        },
        {
            title: t('help_label_editing_saving', '3. Editing and Saving'),
            items: [
                {
                    icon: dragIcon,
                    title: t('help_op_drag_drop', 'Drag & Drop'),
                    description: t('help_op_drag_drop_desc', 'Drag a task bar in the chart to change its start and due dates. Drag the edges of a bar to change its duration.')
                },
                {
                    icon: dependencyIcon,
                    title: t('help_op_dependency', 'Draw Dependencies'),
                    description: t('help_op_dependency_desc', 'Hover over a task bar to see connection points. Click and drag from a point to another task to create a dependency relation.')
                },
                {
                    icon: editIcon,
                    title: t('help_op_inline_edit', 'Inline Editing'),
                    description: t('help_op_inline_edit_desc', 'Double-click or press Enter on a cell in the left task list to quickly edit its value without opening the full issue page.')
                },
                {
                    icon: dotsIcon,
                    title: t('help_op_context_menu', 'Context Menu'),
                    description: t('help_op_context_menu_desc', 'Right-click on a task row or task bar to access a context menu for editing, assigning, updating status, or opening the issue.')
                },
                {
                    icon: calendarIcon,
                    title: t('help_op_unscheduled', 'Schedule Tasks'),
                    description: t('help_op_unscheduled_desc', 'For tasks without dates, edit the start date or due date directly in the left task list. Once dates are set, the task will also appear on the chart.')
                },
                {
                    icon: saveIcon,
                    title: t('help_label_autosave', 'Auto Save'),
                    description: t('help_desc_autosave', 'When enabled, changes such as dragging tasks or inline edits are saved immediately. When disabled, changes stay pending until you save them manually.'),
                    active: true
                },
                {
                    icon: saveIcon,
                    title: t('button_save', 'Save'),
                    description: t('help_desc_save', 'Shown when auto save is off and there are pending edits. Save all pending changes at once.')
                },
                {
                    icon: cancelIcon,
                    title: t('button_cancel', 'Cancel'),
                    description: t('help_desc_cancel', 'Shown when auto save is off and there are pending edits. Discard the unsaved changes currently pending in the toolbar.')
                }
            ]
        }
    ];

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: designTokens.surfaceOverlay,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2500,
                padding: '24px',
                fontFamily: fontFamilies.ui,
                fontSize: '13px',
                lineHeight: 1.5
            }}
            onClick={(event) => {
                if (event.target === event.currentTarget) {
                    closeHelpDialog();
                }
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '1200px',
                    height: '100%',
                    backgroundColor: '#ffffff',
                    borderRadius: '13px',
                    boxShadow: '0px 0px 22.576px rgba(0,0,0,0.08), 6.5px 2px 17.5px rgba(44,30,116,0.11)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    border: '1px solid rgba(0,0,0,0.06)'
                }}
            >
                <div
                    style={{
                        flex: '0 0 auto',
                        padding: '16px 24px',
                        borderBottom: `1px solid rgba(0,0,0,0.06)`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: '#ffffff'
                    }}
                >
                    <h2 style={{ margin: 0, fontFamily: fontFamilies.display, fontSize: '18px', fontWeight: 600, color: '#222222', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {questionIcon}
                        {i18n.t('label_help') || 'Help'}
                    </h2>
                    <button
                        onClick={closeHelpDialog}
                        style={{
                            background: 'rgba(0,0,0,0.04)',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#45515e',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            padding: 0,
                            borderRadius: '9999px',
                            transition: 'background 0.2s'
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div
                    style={{
                        flex: '1 1 auto',
                        overflowY: 'auto',
                        padding: '24px 32px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '40px'
                    }}
                >
                    {sections.map((section) => (
                        <HelpSectionCard key={section.title} title={section.title} items={section.items} />
                    ))}
                </div>

                <div
                    style={{
                        flex: '0 0 auto',
                        padding: '16px 24px',
                        borderTop: `1px solid rgba(0,0,0,0.06)`,
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        justifyContent: 'flex-start'
                    }}
                >
                    <button
                        onClick={closeHelpDialog}
                        style={{
                            padding: '0 20px',
                            height: '34px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#f0f0f0',
                            border: 'none',
                            borderRadius: '9999px',
                            color: '#222222',
                            fontSize: '13px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            lineHeight: 1,
                            boxSizing: 'border-box',
                            transition: 'background 0.2s'
                        }}
                    >
                        {i18n.t('button_close') || 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
};
