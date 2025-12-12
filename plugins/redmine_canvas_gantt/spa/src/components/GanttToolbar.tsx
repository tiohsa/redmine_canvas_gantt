import React from 'react';

interface GanttToolbarProps {
    viewMode: 'Day' | 'Week' | 'Month' | 'Quarter';
    onViewModeChange: (mode: 'Day' | 'Week' | 'Month' | 'Quarter') => void;
}

export const GanttToolbar: React.FC<GanttToolbarProps> = ({ viewMode, onViewModeChange }) => {
    const baseButton: React.CSSProperties = {
        border: '1px solid #e5e9f3',
        backgroundColor: '#fff',
        color: '#3b4256',
        padding: '10px 14px',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
        boxShadow: '0 4px 10px rgba(16, 38, 87, 0.04)'
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            backgroundColor: '#ffffff',
            height: '72px',
            boxSizing: 'border-box'
        }}>
            {/* Left: Filter */}
            <div style={{ display: 'flex', gap: '10px' }}>
                <button
                    style={{ ...baseButton, padding: '10px 16px' }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                    display: 'flex',
                    backgroundColor: '#f3f6fb',
                    borderRadius: '12px',
                    padding: '4px',
                    gap: '4px',
                    border: '1px solid #e5e9f3'
                }}>
                    {(['Day', 'Week', 'Month', 'Quarter'] as const).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => onViewModeChange(mode)}
                            style={{
                                border: 'none',
                                background: viewMode === mode ? '#e5f0ff' : 'transparent',
                                color: viewMode === mode ? '#2f5fd6' : '#5a6272',
                                padding: '8px 14px',
                                borderRadius: '10px',
                                fontSize: '13px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: viewMode === mode ? '0 6px 14px rgba(47, 95, 214, 0.12)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            {mode}
                        </button>
                    ))}
                </div>

                <button
                    style={{
                        ...baseButton,
                        borderColor: '#ffe6e6',
                        backgroundColor: '#fff7f7',
                        color: '#de5148'
                    }}
                >
                    <span style={{ width: 12, height: 12, borderRadius: 12, background: '#de5148', display: 'inline-block' }} />
                    Today
                </button>

                <button
                    style={{
                        ...baseButton,
                        background: 'linear-gradient(90deg, #0062e0 0%, #3a8ef6 100%)',
                        color: '#ffffff',
                        border: 'none',
                        padding: '12px 18px',
                        boxShadow: '0 10px 18px rgba(0, 107, 235, 0.25)'
                    }}
                >
                    Add Task
                </button>
            </div>
        </div>
    );
};
