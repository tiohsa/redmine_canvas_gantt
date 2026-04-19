import type { TrackerIconKind } from './trackerIconUtils';
import { designTokens } from '../../styles/designTokens';
import { SvgIcon } from '../../icons/SvgIcon';

export const TrackerIcon = ({ kind }: { kind: TrackerIconKind }) => {
    const iconName: string = `rcg-icon-${kind}`;
    let color: string = designTokens.trackerTicketStroke;
    const testId: string = `tracker-icon-${kind}`;

    if (kind === 'defect') {
        color = designTokens.trackerDefectStroke;
    } else if (kind === 'todo') {
        color = designTokens.trackerTodoStroke;
    } else if (kind === 'document') {
        color = designTokens.trackerDocumentStroke;
    } else if (kind === 'milestone') {
        color = designTokens.trackerMilestoneStroke;
    } else if (kind === 'ticket') {
        color = designTokens.trackerTicketStroke;
    } else if (kind === 'link') {
        color = designTokens.notificationLink; // Using notification color for link
    }

    return (
        <SvgIcon
            name={iconName}
            size={14}
            style={{ color, flexShrink: 0 }}
            className={`rcg-tracker-icon tracker-icon-${kind}`}
            data-testid={testId}
        />
    );
};
