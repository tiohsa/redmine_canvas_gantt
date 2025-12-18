import React from 'react';

import type { ZoomLevel } from '../types';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore, DEFAULT_COLUMNS } from '../stores/UIStore';

interface GanttToolbarProps {
    zoomLevel: ZoomLevel;
    onZoomChange: (level: ZoomLevel) => void;
}

export const GanttToolbar: React.FC<GanttToolbarProps> = ({ zoomLevel, onZoomChange }) => {
    const { viewport, updateViewport, groupByProject, setGroupByProject, filterText, setFilterText } = useTaskStore();
    const {
        showProgressLine,
        toggleProgressLine,
        visibleColumns,
        setVisibleColumns,
        toggleLeftPane,
        isFullScreen,
        toggleFullScreen
    } = useUIStore();
    const [showColumnMenu, setShowColumnMenu] = React.useState(false);
    const [showFilterMenu, setShowFilterMenu] = React.useState(false);

    const handleTodayClick = () => {
        const now = Date.now();
        let newStartDate = viewport.startDate;

        // If today is before current start date, move start date back
        if (now < newStartDate) {
            // Move start date to 1 month before today to give some context
            const d = new Date(now);
            d.setMonth(d.getMonth() - 1);
            newStartDate = d.getTime();
        }

        const todayX = (now - newStartDate) * viewport.scale;
        // Center the view (assuming width is available in viewport, otherwise guess)
        const centeredX = Math.max(0, todayX - (viewport.width / 2));
        updateViewport({ startDate: newStartDate, scrollX: centeredX });
    };

    const navigateMonth = (offset: number) => {
        const leftDate = new Date(viewport.startDate + viewport.scrollX / viewport.scale);
        leftDate.setDate(1);
        leftDate.setMonth(leftDate.getMonth() + offset);
        leftDate.setHours(0, 0, 0, 0);
        updateViewport({ startDate: leftDate.getTime(), scrollX: 0 });
    };

    const toggleColumn = (key: string) => {
        const next = visibleColumns.includes(key)
            ? visibleColumns.filter(k => k !== key)
            : [...visibleColumns, key];
        setVisibleColumns(next);
    };

    const columnOptions = [
        { key: 'id', label: 'ID' },
        { key: 'status', label: 'Status' },
        { key: 'assignee', label: 'Assignee' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'ratioDone', label: 'Progress' }
    ];

    const ZOOM_OPTIONS: { level: ZoomLevel; label: string }[] = [
        { level: 0, label: 'Month' },
        { level: 1, label: 'Week' },
        { level: 2, label: 'Day' }
    ];

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #e0e0e0',
            height: '60px',
            boxSizing: 'border-box'
        }}>
            {/* Left: Filter & Options */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', position: 'relative' }}>
                <button
                    onClick={toggleLeftPane}
                    title="Toggle Sidebar"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: '#fff',
                        color: '#333',
                        cursor: 'pointer',
                        width: '36px',
                        height: '36px'
                    }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                </button>

                <button
                    onClick={() => {
                        const projectId = window.RedmineCanvasGantt?.projectId;
                        if (projectId) {
                            useUIStore.getState().openIssueDialog(`/projects/${projectId}/issues/new`);
                        }
                    }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: '#1a73e8',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        height: '36px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {window.RedmineCanvasGantt?.i18n?.label_issue_new || 'New Ticket'}
                </button>

                <div style={{ width: 1, height: 24, backgroundColor: '#e0e0e0', margin: '0 4px' }} />



                <button
                    onClick={() => setShowFilterMenu(prev => !prev)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: filterText ? '#e8f0fe' : '#fff',
                        color: filterText ? '#1a73e8' : '#333',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="4" y1="6" x2="20" y2="6" />
                        <line x1="6" y1="12" x2="18" y2="12" />
                        <line x1="8" y1="18" x2="16" y2="18" />
                    </svg>
                    Filter {filterText ? '(Active)' : ''}
                </button>

                {showFilterMenu && (
                    <div
                        style={{
                            position: 'absolute',
                            top: '48px',
                            left: '120px', // Adjust depending on button position, or calculate dynamically
                            background: '#fff',
                            border: '1px solid #e0e0e0',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            padding: '12px',
                            zIndex: 20,
                            minWidth: '220px'
                        }}
                    >
                        <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>Filter Tasks</div>
                        <input
                            type="text"
                            placeholder="Filter by subject..."
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d0d0d0',
                                borderRadius: '4px',
                                outline: 'none',
                                boxSizing: 'border-box'
                            }}
                            autoFocus
                        />
                        {filterText && (
                            <button
                                onClick={() => setFilterText('')}
                                style={{
                                    marginTop: '8px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#d32f2f',
                                    cursor: 'pointer',
                                    padding: 0,
                                    fontSize: 13
                                }}
                            >
                                Clear Filter
                            </button>
                        )}
                    </div>
                )}

                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowColumnMenu(prev => !prev)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: '#fff',
                            color: '#333',
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 5h16" />
                            <path d="M7 12h10" />
                            <path d="M10 19h4" />
                        </svg>
                        Columns
                    </button>

                    {showColumnMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                background: '#fff',
                                border: '1px solid #e0e0e0',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                padding: '12px',
                                zIndex: 20,
                                minWidth: '200px'
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>Columns</div>
                            {columnOptions.map(option => (
                                <label key={option.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: '#444' }}>
                                    <input
                                        type="checkbox"
                                        checked={visibleColumns.includes(option.key)}
                                        onChange={() => toggleColumn(option.key)}
                                    />
                                    {option.label}
                                </label>
                            ))}
                            <button
                                onClick={() => setVisibleColumns(DEFAULT_COLUMNS)}
                                style={{
                                    marginTop: '8px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#1a73e8',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            >
                                Reset
                            </button>
                        </div>
                    )}
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#555', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                        type="checkbox"
                        checked={showProgressLine}
                        onChange={toggleProgressLine}
                        style={{ cursor: 'pointer' }}
                    />
                    Progress Line
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#555', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                        type="checkbox"
                        checked={groupByProject}
                        onChange={(e) => setGroupByProject(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                    />
                    Group by project
                </label>
            </div>

            {/* Right: Zoom Level & Today */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>

                    <button
                        onClick={() => navigateMonth(-1)}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: '#fff',
                            color: '#333',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        ◀ Prev Month
                    </button>
                    <button
                        onClick={() => navigateMonth(1)}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: '#fff',
                            color: '#333',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        Next Month ▶
                    </button>
                </div>

                {/* Final Decision: Put Today in a similar container OR just style it to match the segmented control's HEIGHT/FONT/LOOK but standalone. */}

                <button
                    onClick={handleTodayClick}
                    style={{
                        padding: '6px 16px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0', // Keep border if outside, or remove to match flat look?
                        // "Day" button (inside group) has no border, just bg.
                        // Let's give Today a similar look to the segmented control container but clickable?
                        backgroundColor: '#fff',
                        color: '#333',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        height: '32px', // Match standard height of the checks
                        display: 'flex',
                        alignItems: 'center'
                    }}
                >
                    Today
                </button>



                <div style={{
                    display: 'flex',
                    backgroundColor: '#e9ecef',
                    borderRadius: '8px',
                    padding: '3px',
                    gap: '2px',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)'
                }}>
                    {ZOOM_OPTIONS.map((option) => {
                        const isActive = zoomLevel === option.level;
                        return (
                            <button
                                key={option.level}
                                onClick={() => onZoomChange(option.level)}
                                style={{
                                    border: 'none',
                                    background: isActive ? '#fff' : 'transparent',
                                    color: isActive ? '#1a1a1a' : '#6c757d',
                                    padding: '6px 16px',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: isActive ? 600 : 500,
                                    cursor: 'pointer',
                                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                    transition: 'all 0.2s ease',
                                    outline: 'none',
                                    minWidth: '60px'
                                }}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={toggleFullScreen}
                    style={{
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: isFullScreen ? '#1a73e8' : '#fff',
                        color: isFullScreen ? '#fff' : '#333',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        height: '32px',
                        width: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}

                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {isFullScreen ? (
                            <>
                                <polyline points="9 9 3 9 3 3" />
                                <line x1="3" y1="3" x2="9" y2="9" />
                                <polyline points="15 15 21 15 21 21" />
                                <line x1="15" y1="15" x2="21" y2="21" />
                            </>
                        ) : (
                            <>
                                <polyline points="3 9 9 9 9 3" />
                                <line x1="9" y1="3" x2="3" y2="9" />
                                <polyline points="21 15 15 15 15 21" />
                                <line x1="15" y1="21" x2="21" y2="15" />
                            </>
                        )}
                    </svg>
                </button>

                <button
                    onClick={() => updateViewport({ scrollY: 0 })}
                    style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: '#fff',
                        color: '#333',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}

                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="19" x2="12" y2="5"></line>
                        <polyline points="5 12 12 5 19 12"></polyline>
                        <line x1="5" y1="19" x2="19" y2="19"></line>
                    </svg>
                    Top
                </button>
            </div>
        </div>
    );
};
