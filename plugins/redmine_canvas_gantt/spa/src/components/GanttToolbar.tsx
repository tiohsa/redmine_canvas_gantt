import React from 'react';

interface GanttToolbarProps {
    viewMode: 'Day' | 'Week' | 'Month' | 'Quarter';
    onViewModeChange: (mode: 'Day' | 'Week' | 'Month' | 'Quarter') => void;
}

export const GanttToolbar: React.FC<GanttToolbarProps> = ({ viewMode, onViewModeChange }) => {
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
                <div style={{
                    display: 'flex',
                    backgroundColor: '#f1f3f5',
                    borderRadius: '8px',
                    padding: '4px',
                    gap: '4px'
                }}>
                    {(['Day', 'Week', 'Month', 'Quarter'] as const).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => onViewModeChange(mode)}
                            style={{
                                border: 'none',
                                background: viewMode === mode ? '#fff' : 'transparent',
                                color: viewMode === mode ? '#333' : '#666',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            {mode}
                        </button>
                    ))}
                </div>

                <button
                    style={{
                        backgroundColor: '#0066cc',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 16px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    Add Task
                </button>
            </div>
        </div>
    );
};
