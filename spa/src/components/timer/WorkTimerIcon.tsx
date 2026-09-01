type WorkTimerIconState = 'start' | 'running' | 'pending';

type WorkTimerIconProps = {
    state: WorkTimerIconState;
    size?: number;
};

const iconColors: Record<WorkTimerIconState, { background: string; border: string; foreground: string }> = {
    start: { background: '#ffffff', border: '#c7ccd4', foreground: '#252b33' },
    running: { background: '#f3f7ff', border: '#8ab1ff', foreground: '#1456f0' },
    pending: { background: '#fff9e8', border: '#f5c553', foreground: '#bd8500' }
};

/** Circular Work Timer status icon, shared by the task list and timer surfaces. */
export const WorkTimerIcon = ({ state, size = 24 }: WorkTimerIconProps) => {
    const colors = iconColors[state];

    return (
        <svg
            aria-hidden="true"
            fill="none"
            height={size}
            style={{ display: 'block', flexShrink: 0 }}
            viewBox="0 0 48 48"
            width={size}
        >
            <circle cx="24" cy="24" r="22.5" fill={colors.background} stroke={colors.border} />
            {state === 'start' && <path d="M19 15.5v17l14-8.5-14-8.5Z" fill={colors.foreground} />}
            {state === 'running' && (
                <>
                    <path d="M19 8h10M24 8v5M31 13l3-3" stroke={colors.foreground} strokeLinecap="round" strokeWidth="3.5" />
                    <circle cx="24" cy="26" r="12" stroke={colors.foreground} strokeWidth="3.5" />
                    <path d="M24 18v8" stroke={colors.foreground} strokeLinecap="round" strokeWidth="3.5" />
                </>
            )}
            {state === 'pending' && (
                <g transform="translate(1 1)">
                    <path d="M14 21h-5v-7M9.5 14.5A15 15 0 1 1 11 33" stroke={colors.foreground} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" />
                    <path d="M24 16v9l6 4" stroke={colors.foreground} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" />
                </g>
            )}
        </svg>
    );
};
