import type { TrackerIconKind } from './trackerIconUtils';
import { designTokens } from '../../styles/designTokens';

const iconProps = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { flexShrink: 0 }
};

export const TrackerIcon = ({ kind }: { kind: TrackerIconKind }) => {
    if (kind === 'bug') {
        return (
            <svg {...iconProps} data-testid="tracker-icon-bug" stroke={designTokens.trackerBugStroke}>
                <circle cx="12" cy="12" r="8" fill={designTokens.trackerBugFill} />
                <path d="M12 4v2m0 12v2M4 12h2m12 0h2M6.34 6.34l1.42 1.42M16.24 16.24l1.42 1.42M6.34 17.66l1.42-1.42M16.24 7.76l1.42-1.42" />
            </svg>
        );
    }

    if (kind === 'feature') {
        return (
            <svg {...iconProps} data-testid="tracker-icon-feature" stroke={designTokens.trackerFeatureStroke}>
                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill={designTokens.trackerFeatureFill} />
            </svg>
        );
    }

    if (kind === 'support') {
        return (
            <svg {...iconProps} data-testid="tracker-icon-support" stroke={designTokens.trackerSupportStroke}>
                <circle cx="12" cy="12" r="10" fill={designTokens.trackerSupportFill} />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
            </svg>
        );
    }

    return (
        <svg {...iconProps} data-testid="tracker-icon-task" stroke={designTokens.trackerTaskStroke}>
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
        </svg>
    );
};
