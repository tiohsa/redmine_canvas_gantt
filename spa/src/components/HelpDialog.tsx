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
            <div style={{ fontFamily: fontFamilies.ui, fontWeight: 600, fontSize: '14px', color: designTokens.controlFg, marginBottom: '4px' }}>
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
                fontFamily: fontFamilies.ui,
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

const queryIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h10" />
    </svg>
);

const plusIcon = (
    <svg data-testid="help-icon-plus" width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

const filterIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
);

const assigneeIcon = (
    <svg data-testid="help-icon-assignee" width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const projectIcon = (
    <svg data-testid="help-icon-project" width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
);

const versionIcon = (
    <svg data-testid="help-icon-version" width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
);

const statusIcon = (
    <svg data-testid="help-icon-status" width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
);

const columnsIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
);

const chartSettingsIcon = (
    <svg data-testid="help-icon-chart-settings" width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
        <circle cx="9" cy="6" r="2" fill={designTokens.controlBg} />
        <circle cx="15" cy="12" r="2" fill={designTokens.controlBg} />
        <circle cx="8" cy="18" r="2" fill={designTokens.controlBg} />
    </svg>
);

const baselineIcon = (
    <svg data-testid="help-icon-baseline" width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M4 5h16v14H4z" />
        <path d="M8 5v4h8V5" />
        <path d="M8 19v-5h8v5" />
    </svg>
);

const workloadIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
);

const monthNavigationIcon = (
    <svg data-testid="help-icon-month-navigation" width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
        <polyline points="15 18 9 12 15 6" />
        <polyline points="9 18 15 12 9 6" />
    </svg>
);

const todayCalendarIcon = (
    <svg data-testid="help-icon-today-calendar" width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);

const organizeDependencyIcon = (
    <svg data-testid="help-icon-organize-dependency" width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M5 6h6v6H5z" />
        <path d="M13 12h6v6h-6z" />
        <path d="M11 9l2 2" />
        <path d="M7 12l6-6" />
    </svg>
);

const relationIcon = (
    <svg data-testid="help-icon-relation" width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
        <path d="M4 12h6" />
        <path d="M14 12h6" />
        <circle cx="10" cy="12" r="2" />
        <circle cx="14" cy="12" r="2" />
    </svg>
);

const calendarIcon = (
    <svg data-testid="help-icon-calendar" width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
    </svg>
);

const zoomIcon = (
    <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em' }}>M/W/D</div>
);

const exportIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
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
    <svg width="16" height="16" viewBox="0 0 24 24" {...iconStroke}>
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
    <svg data-testid="help-icon-save" width="18" height="18" viewBox="0 0 24 24" {...iconStroke}>
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
            title: t('label_help_toolbar_icons', '1. Header Menu Icons'),
            items: [
                {
                    icon: plusIcon,
                    title: t('label_issue_new', 'New issue'),
                    description: t('help_desc_issue_new', 'Opens a dialog to create a new issue.')
                },
                {
                    icon: queryIcon,
                    title: t('label_saved_queries', 'Saved Queries'),
                    description: t('help_desc_saved_queries', 'Switch between saved query presets, clear the active query, or open the current query in Redmine.')
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
                    icon: assigneeIcon,
                    title: t('label_assigned_to_filter', 'Filter by assignee'),
                    description: t('help_desc_assignee_filter', 'Filter tasks by specific assignees, or group tasks by their assignee.')
                },
                {
                    icon: projectIcon,
                    title: t('label_project_filter', 'Filter by project'),
                    description: t('help_desc_project_filter', 'Filter tasks by project, or group tasks by their parent project.')
                },
                {
                    icon: versionIcon,
                    title: t('label_version_filter', 'Filter by version'),
                    description: t('help_desc_version_filter', 'Filter tasks by target version, or toggle the visibility of version group headers.')
                },
                {
                    icon: statusIcon,
                    title: t('label_status_filter', 'Filter by status'),
                    description: t('help_desc_status_filter', 'Filter tasks by their current issue status (e.g., New, In Progress, Closed).')
                },
                {
                    icon: chartSettingsIcon,
                    title: t('label_settings', 'Settings'),
                    description: t('help_desc_settings', 'Configure Auto Save, progress line, dependency ordering, start-date-only and due-date-only tasks, ticket titles, task-bar dates, hierarchy lines, and sharing settings across all projects. Choose Standard, Maximize List, or Maximize Chart, then set row height and task-list font size.')
                },
                {
                    icon: relationIcon,
                    title: t('label_relation_title', 'Link'),
                    description: t('help_desc_dependency_settings', 'Set the default dependency type, automatic delay calculation, automatic application of the default dependency, and auto-scheduling move mode.')
                },
                {
                    icon: baselineIcon,
                    title: t('label_show_baseline', 'Baseline'),
                    description: t('help_desc_baseline', 'Save a baseline snapshot and compare it with the current plan.')
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
                    icon: monthNavigationIcon,
                    title: `${t('label_prev_month', 'Previous month')} / ${t('label_next_month', 'Next month')}`,
                    description: t('help_desc_prev_next_month', 'Use the previous and next month buttons to jump the visible timeline window by whole months.')
                },
                {
                    icon: todayCalendarIcon,
                    title: t('label_today', 'Today'),
                    description: t('help_desc_today', 'Scrolls the timeline view to center on the current day.')
                },
                {
                    icon: zoomIcon,
                    title: t('help_label_zoom', 'Zoom Levels (Month, Week, Day)'),
                    description: t('help_desc_zoom', 'Adjust the timescale of the Gantt chart. Month view for high-level planning, Day view for details.')
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
                    description: t('help_desc_top', 'Scroll the task list back to the top.')
                }
            ]
        },
        {
            title: t('help_label_editing_saving', '3. Editing and Saving'),
            items: [
                {
                    icon: dragIcon,
                    title: t('help_op_drag_drop', 'Drag & Drop'),
                    description: t('help_op_drag_drop_desc', 'Drag an editable task bar in the chart to change its start and due dates. Drag the edges of a dated leaf task bar to change its duration.')
                },
                {
                    icon: organizeDependencyIcon,
                    title: t('help_op_dependency', 'Draw Dependencies'),
                    description: t('help_op_dependency_desc', 'Hover over a task bar to show connection handles, then drag from a handle to another task. Depending on the dependency settings, the relation is created immediately or opens draft settings.')
                },
                {
                    icon: editIcon,
                    title: t('help_op_inline_edit', 'Inline Editing'),
                    description: t('help_op_inline_edit_desc', 'Double-click an editable cell in the left task list to edit it inline. Press Enter in the editor to save or Escape to cancel. Edit the subject from its edit badge, which opens the issue editor.')
                },
                {
                    icon: dotsIcon,
                    title: t('help_op_context_menu', 'Context Menu'),
                    description: t('help_op_context_menu_desc', 'Right-click a task row or task bar to open actions such as editing, adding or removing parent links, creating a child task, deleting the task, or removing dependencies.')
                },
                {
                    icon: calendarIcon,
                    title: t('help_op_unscheduled', 'Schedule Tasks'),
                    description: t('help_op_unscheduled_desc', 'For tasks without dates, double-click an editable start-date or due-date cell in the left task list. Once a date is set, the task can appear on the chart.')
                },
                {
                    icon: saveIcon,
                    title: t('button_save', 'Save'),
                    description: t('help_desc_save', 'Shown only when auto save is off and there are pending changes. Saves all pending changes and refreshes the chart.')
                },
                {
                    icon: cancelIcon,
                    title: t('button_cancel', 'Cancel'),
                    description: t('help_desc_cancel', 'Shown only when auto save is off and there are pending changes. Refreshes the data and discards the pending changes.')
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
                    <h2 style={{ margin: 0, fontFamily: fontFamilies.ui, fontSize: '18px', fontWeight: 600, color: '#222222', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
