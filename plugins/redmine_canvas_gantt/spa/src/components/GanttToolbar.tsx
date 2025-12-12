import React from 'react';

import type { ViewMode } from '../types';
import { useTaskStore } from '../stores/TaskStore';

interface GanttToolbarProps {
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
}

export const GanttToolbar: React.FC<GanttToolbarProps> = ({ viewMode, onViewModeChange }) => {
    const { viewport, updateViewport } = useTaskStore();

    const handleTodayClick = () => {
        const now = Date.now();
        const todayX = (now - viewport.startDate) * viewport.scale;
        // Center the view (assuming width is available in viewport, otherwise guess)
        const centeredX = Math.max(0, todayX - (viewport.width / 2));
        updateViewport({ scrollX: centeredX });
    };

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
            {/* Left: Filter */}
            <div style={{ display: 'flex', gap: '10px' }}>
                <button
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
                        <line x1="4" y1="6" x2="20" y2="6" />
                        <line x1="6" y1="12" x2="18" y2="12" />
                        <line x1="8" y1="18" x2="16" y2="18" />
                    </svg>
                    Filter
                </button>
            </div>

            {/* Right: View Mode & Add Task */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button
                    onClick={handleTodayClick}
                    style={{
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
                    {(['Day', 'Week', 'Month'] as const).map((mode) => {
                        const isActive = viewMode === mode;
                        return (
                            <button
                                key={mode}
                                onClick={() => onViewModeChange(mode)}
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
                                {mode}
                            </button>
                        );
                    })}
                </div>


            </div>
        </div>
    );
};
