import React, { useState } from 'react';

import type { ZoomLevel } from '../types';
import { useTaskStore } from '../stores/TaskStore';
import { useUIStore } from '../stores/UIStore';

interface GanttToolbarProps {
    zoomLevel: ZoomLevel;
    onZoomChange: (level: ZoomLevel) => void;
}

export const GanttToolbar: React.FC<GanttToolbarProps> = ({ zoomLevel, onZoomChange }) => {
    const { viewport, updateViewport } = useTaskStore();
    const {
        showProgressLine, toggleProgressLine,
        visibleColumns, toggleColumn,
        groupByProject, toggleGroupByProject
    } = useUIStore();

    const [showColumnMenu, setShowColumnMenu] = useState(false);

    const handleTodayClick = () => {
        const now = Date.now();
        const todayX = (now - viewport.startDate) * viewport.scale;
        const centeredX = Math.max(0, todayX - (viewport.width / 2));
        updateViewport({ scrollX: centeredX });
    };

    // Requirement 5: Prev/Next Month
    const handlePrevMonth = () => {
        const currentScrollDate = viewport.startDate + (viewport.scrollX / viewport.scale);
        const d = new Date(currentScrollDate);
        d.setMonth(d.getMonth() - 1);
        const newX = (d.getTime() - viewport.startDate) * viewport.scale;
        updateViewport({ scrollX: Math.max(0, newX) });
    };

    const handleNextMonth = () => {
        const currentScrollDate = viewport.startDate + (viewport.scrollX / viewport.scale);
        const d = new Date(currentScrollDate);
        d.setMonth(d.getMonth() + 1);
        const newX = (d.getTime() - viewport.startDate) * viewport.scale;
        updateViewport({ scrollX: Math.max(0, newX) });
    };

    const ZOOM_OPTIONS: { level: ZoomLevel; label: string }[] = [
        { level: 0, label: 'Month' },
        { level: 1, label: 'Week' },
        { level: 2, label: 'Day' }
    ];

    const AVAILABLE_COLUMNS = [
        { key: 'subject', label: 'Subject' },
        { key: 'status', label: 'Status' },
        { key: 'assignee', label: 'Assignee' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'ratioDone', label: 'Progress' },
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
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowColumnMenu(!showColumnMenu)}
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
                        Columns
                    </button>
                    {showColumnMenu && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            marginTop: 4,
                            backgroundColor: 'white',
                            border: '1px solid #ddd',
                            borderRadius: 6,
                            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                            zIndex: 100,
                            padding: 8,
                            minWidth: 150
                        }}>
                            {AVAILABLE_COLUMNS.map(col => (
                                <label key={col.key} style={{ display: 'flex', alignItems: 'center', padding: 4, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={visibleColumns.includes(col.key)}
                                        onChange={() => toggleColumn(col.key)}
                                        style={{ marginRight: 8 }}
                                    />
                                    {col.label}
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                <button
                    onClick={toggleGroupByProject}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: groupByProject ? '#e6f7ff' : '#fff',
                        color: groupByProject ? '#1890ff' : '#333',
                        borderColor: groupByProject ? '#1890ff' : '#e0e0e0',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer'
                    }}
                >
                    Group by Project
                </button>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#555', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                        type="checkbox"
                        checked={showProgressLine}
                        onChange={toggleProgressLine}
                        style={{ cursor: 'pointer' }}
                    />
                    Progress Line
                </label>
            </div>

            {/* Right: Navigation & Zoom */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>

                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                        onClick={handlePrevMonth}
                        title="Previous Month"
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: '#fff',
                            cursor: 'pointer'
                        }}>
                        &lt;
                    </button>
                    <button
                        onClick={handleNextMonth}
                        title="Next Month"
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #e0e0e0',
                            backgroundColor: '#fff',
                            cursor: 'pointer'
                        }}>
                        &gt;
                    </button>
                </div>

                <button
                    onClick={handleTodayClick}
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
            </div>
        </div>
    );
};
