const spriteStyle = {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
    pointerEvents: 'none'
} as const;

export const SvgSpriteDefs = () => (
    <svg aria-hidden="true" focusable="false" style={spriteStyle}>
        <defs>
            <symbol id="rcg-icon-notification-unscheduled" viewBox="0 0 24 24">
                <circle cx="12" cy="12" fill="none" r="8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                <path d="M12 8v4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                <circle cx="12" cy="16" fill="currentColor" r="1.5" />
            </symbol>
            <symbol id="rcg-icon-notification-warning" viewBox="0 0 24 24">
                <path d="M12 4 20 19H4Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                <path d="M12 9v4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                <circle cx="12" cy="16" fill="currentColor" r="1.4" />
            </symbol>
            <symbol id="rcg-icon-notification-critical" viewBox="0 0 24 24">
                <path d="M10 13a4 4 0 0 0 5.66 0l2.12-2.12a4 4 0 0 0-5.66-5.66L10.5 6.84" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                <path d="M14 11a4 4 0 0 0-5.66 0l-2.12 2.12a4 4 0 0 0 5.66 5.66l1.62-1.62" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                <path d="M12 8.5 10.8 12h2.05L11.7 15.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </symbol>
        </defs>
    </svg>
);
