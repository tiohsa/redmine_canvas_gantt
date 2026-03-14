import React, { useEffect, useRef } from 'react';
import { useUIStore } from '../stores/UIStore';
import { i18n } from '../utils/i18n';

const IconWrapper: React.FC<{ children: React.ReactNode; active?: boolean }> = ({ children, active }) => (
    <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        borderRadius: '6px',
        border: '1px solid #e0e0e0',
        backgroundColor: active ? '#e8f0fe' : '#fff',
        color: active ? '#1a73e8' : '#333',
        flexShrink: 0
    }}>
        {children}
    </div>
);

const HelpRow: React.FC<{ icon: React.ReactNode; title: string; description: string; active?: boolean }> = ({ icon, title, description, active }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
        <IconWrapper active={active}>{icon}</IconWrapper>
        <div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#333', marginBottom: '4px' }}>{title}</div>
            <div style={{ fontSize: '13px', color: '#555', lineHeight: 1.5 }}>{description}</div>
        </div>
    </div>
);

export const HelpDialog: React.FC = () => {
    const isHelpDialogOpen = useUIStore(state => state.isHelpDialogOpen);
    const closeHelpDialog = useUIStore(state => state.closeHelpDialog);
    const dialogRef = useRef<HTMLDivElement>(null);

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

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2500, // Higher than IssueIframeDialog if needed, or similar
                padding: '24px' // Gap around the dialog
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    closeHelpDialog();
                }
            }}
        >
            <div
                ref={dialogRef}
                style={{
                    width: '100%',
                    maxWidth: '1200px',
                    height: '100%',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxSizing: 'border-box'
                }}
            >
                {/* Header */}
                <div style={{
                    flex: '0 0 auto',
                    padding: '16px 24px',
                    borderBottom: '1px solid #e0e0e0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#f8f9fa'
                }}>
                    <h2 style={{ margin: 0, fontSize: '18px', color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        {i18n.t('label_help') || 'Help'}
                    </h2>
                    <button
                        onClick={closeHelpDialog}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#666',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '4px',
                            borderRadius: '4px'
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {/* Content Body */}
                <div style={{
                    flex: '1 1 auto',
                    overflowY: 'auto',
                    padding: '24px 32px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '40px'
                }}>

                    {/* Chapter 1: Toolbar Icons */}
                    <section>
                        <h3 style={{ fontSize: '16px', color: '#1a73e8', borderBottom: '2px solid #e8f0fe', paddingBottom: '8px', marginBottom: '20px' }}>
                            {i18n.t('label_help_toolbar_icons') || '1. Header Menu Icons'}
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 'x20px' }}>
                            <HelpRow
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="15" y1="3" x2="15" y2="21" /></svg>}
                                title={i18n.t('label_maximize_left_pane') || 'Maximize List / Restore Split View'}
                                description={i18n.t('help_desc_maximize_left') || 'Expands the task list to fill the screen, hiding the chart. Click again to restore the split view.'}
                            />
                            <HelpRow
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>}
                                title={i18n.t('label_maximize_right_pane') || 'Maximize Chart / Restore Split View'}
                                description={i18n.t('help_desc_maximize_right') || 'Expands the Gantt chart to fill the screen, hiding the task list. Click again to restore the split view.'}
                            />
                            <HelpRow
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
                                title={i18n.t('label_issue_new') || 'New Issue'}
                                description={i18n.t('help_desc_issue_new') || 'Opens a dialog to create a new Redmine issue without leaving the Gantt view.'}
                            />
                            <HelpRow
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>}
                                title={i18n.t('label_filter_tasks') || 'Filter Tasks (Subject)'}
                                description={i18n.t('help_desc_filter_tasks') || 'Quickly filter the visible tasks by typing a keyword that matches the issue subject. Shortcut: Ctrl+F.'}
                            />
                            <HelpRow
                                icon={<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg><div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, backgroundColor: '#1a73e8', borderRadius: '50%' }} /></>}
                                title={i18n.t('label_column_plural') || 'Columns'}
                                description={i18n.t('help_desc_columns') || 'Select which columns (Status, Assignee, Start Date, Due Date, etc.) are visible in the left task list.'}
                                active
                            />
                            <HelpRow
                                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
                                title={i18n.t('field_assigned_to') || 'Assignee Filter'}
                                description={i18n.t('help_desc_assignee_filter') || 'Filter tasks by specific assignees, or group tasks by their assignee.'}
                            />
                            <HelpRow
                                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>}
                                title={i18n.t('label_project_plural') || 'Project Filter'}
                                description={i18n.t('help_desc_project_filter') || 'Filter tasks by project, or group tasks by their parent project.'}
                            />
                            <HelpRow
                                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>}
                                title={i18n.t('label_version_plural') || 'Target Version Filter'}
                                description={i18n.t('help_desc_version_filter') || 'Filter tasks by target version, or toggle the visibility of version group headers.'}
                            />
                            <HelpRow
                                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}
                                title={i18n.t('field_status') || 'Status Filter'}
                                description={i18n.t('help_desc_status_filter') || 'Filter tasks by their current issue status (e.g., New, In Progress, Closed).'}
                            />
                            <HelpRow
                                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
                                title={i18n.t('label_progress_line') || 'Progress Line'}
                                description={i18n.t('help_desc_progress_line') || 'Toggle the visibility of a progress line on the chart to visualize if tasks are ahead or behind schedule.'}
                            />
                            <HelpRow
                                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h6" /><path d="M14 12h6" /><circle cx="10" cy="12" r="2" /><circle cx="14" cy="12" r="2" /></svg>}
                                title={i18n.t('label_relation_title') || 'Dependency Settings'}
                                description={i18n.t('help_desc_dependency_settings') || 'Configure default behavior for drawing dependencies, such as relation type and auto-calculating delay.'}
                            />
                            <HelpRow
                                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>}
                                title={i18n.t('label_export') || 'Export'}
                                description={i18n.t('help_desc_export') || 'Export the current Gantt view as a PNG image, or download the visible task data as CSV including hierarchy and dependency columns.'}
                            />
                            <HelpRow
                                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 6h6v6H5z" /><path d="M13 12h6v6h-6z" /><path d="M11 9l2 2" /><path d="M7 12l6-6" /></svg>}
                                title={i18n.t('label_organize_by_dependency') || 'Organize by Dependency'}
                                description={i18n.t('help_desc_organize_by_dependency') || 'Sort tasks based on their dependencies. Preceding tasks will be listed before succeeding tasks.'}
                            />
                            <HelpRow
                                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 5h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z" /></svg>}
                                title={i18n.t('label_toggle_points_orphans') || 'Toggle Orphan Date Points'}
                                description={i18n.t('help_desc_points_orphans') || 'Show or hide milestone indicators for tasks that only have a start date or a due date.'}
                            />
                            <HelpRow
                                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
                                title={i18n.t('label_today') || 'Today'}
                                description={i18n.t('help_desc_today') || 'Scrolls the timeline view to center on the current day.'}
                            />
                            <HelpRow
                                icon={<span style={{ fontSize: '13px', fontWeight: 600 }}>M</span>}
                                title={i18n.t('help_label_zoom') || 'Zoom Levels (Month, Week, Day)'}
                                description={i18n.t('help_desc_zoom') || 'Adjust the timescale of the Gantt chart. Month view for high-level planning, Day view for details.'}
                            />
                            <HelpRow
                                icon={<div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '13px', fontWeight: 500 }}>M<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></div>}
                                title={i18n.t('label_row_height') || 'Row Height'}
                                description={i18n.t('help_desc_row_height') || 'Change the vertical size of task rows to fit more tasks on screen or to make them easier to read.'}
                            />
                            <HelpRow
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>}
                                title={i18n.t('help_label_fullscreen') || 'Full Screen'}
                                description={i18n.t('help_desc_fullscreen') || 'Toggle full screen mode to maximize your workspace.'}
                            />
                            <HelpRow
                                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>}
                                title={i18n.t('help_label_autosave') || 'Auto Save'}
                                description={i18n.t('help_desc_autosave') || 'When enabled, changes (like dragging tasks) are saved to Redmine immediately. When disabled, you must manually click "Save".'}
                                active
                            />
                        </div>
                    </section>

                    {/* Chapter 2: Additional Essential Operations (Basic placeholder examples as per instructions) */}
                    <section>
                        <h3 style={{ fontSize: '16px', color: '#1a73e8', borderBottom: '2px solid #e8f0fe', paddingBottom: '8px', marginBottom: '20px' }}>
                            {i18n.t('help_label_basic_operations') || '2. Basic Operations'}
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ fontSize: '24px', color: '#666', marginTop: '-4px' }}>🖱️</div>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#333' }}>{i18n.t('help_op_drag_drop') || 'Drag & Drop'}</div>
                                    <div style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>
                                        {i18n.t('help_op_drag_drop_desc') || 'Drag a task bar in the chart to change its start and due dates. Drag the edges of a bar to change its duration.'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ fontSize: '24px', color: '#666', marginTop: '-4px' }}>🔗</div>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#333' }}>{i18n.t('help_op_dependency') || 'Draw Dependencies'}</div>
                                    <div style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>
                                        {i18n.t('help_op_dependency_desc') || 'Hover over a task bar to see connection points. Click and drag from a point to another task to create a dependency relation.'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ fontSize: '24px', color: '#666', marginTop: '-4px' }}>✏️</div>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#333' }}>{i18n.t('help_op_inline_edit') || 'Inline Editing'}</div>
                                    <div style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>
                                        {i18n.t('help_op_inline_edit_desc') || 'Double-click or press Enter on a cell in the left task list to quickly edit its value without opening the full issue page.'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ fontSize: '24px', color: '#666', marginTop: '-4px' }}>📋</div>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#333' }}>{i18n.t('help_op_context_menu') || 'Context Menu'}</div>
                                    <div style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>
                                        {i18n.t('help_op_context_menu_desc') || 'Right-click on a task row or task bar to access a context menu for editing, assigning, updating status, or opening the issue.'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ fontSize: '24px', color: '#666', marginTop: '-4px' }}>📅</div>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#333' }}>{i18n.t('help_op_unscheduled') || 'Schedule Tasks'}</div>
                                    <div style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>
                                        {i18n.t('help_op_unscheduled_desc') || 'For tasks with no dates (which do not appear on the chart), you can drag them from the left list onto the chart to set their dates.'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Footer with Close Button */}
                <div style={{
                    flex: '0 0 auto',
                    padding: '16px 24px',
                    borderTop: '1px solid #e0e0e0',
                    backgroundColor: '#f8f9fa',
                    display: 'flex',
                    justifyContent: 'flex-start'
                }}>
                    <button
                        onClick={closeHelpDialog}
                        style={{
                            padding: '0 20px',
                            height: '34px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#fff',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            color: '#333',
                            fontSize: '14px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            lineHeight: 1,
                            boxSizing: 'border-box'
                        }}
                    >
                        {i18n.t('button_close') || 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
};
