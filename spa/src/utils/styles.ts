// Shared style definitions
import { designTokens } from '../styles/designTokens';

export const getStatusColor = (statusId: number) => {
    // 1: New, 2: In Progress, 3: Resolved, 4: Feedback, 5: Closed, 6: Rejected
    switch (statusId) {
        case 2: return { bg: designTokens.statusProgressBg, text: designTokens.statusProgressText, bar: designTokens.statusProgressBar, label: 'In Progress' };
        case 3: // Resolved (Treat as Done-ish)
        case 5: return { bg: designTokens.statusDoneBg, text: designTokens.statusDoneText, bar: designTokens.statusDoneBar, label: 'Done' };
        case 6: // Rejected (Blocked)
        case 4: // Feedback (Warning)
            return { bg: designTokens.statusBlockedBg, text: designTokens.statusBlockedText, bar: designTokens.statusBlockedBar, label: 'Blocked' };
        default: return { bg: designTokens.statusNewBg, text: designTokens.statusNewText, bar: designTokens.statusNewBar, label: 'New' };
    }
};

export const getPriorityColor = (priorityId: number, priorityPosition?: number) => {
    const rank = typeof priorityPosition === 'number' && Number.isFinite(priorityPosition)
        ? priorityPosition
        : priorityId;

    // Highest priorities
    if (rank >= 4) {
        return { bg: designTokens.priorityHighBg, text: designTokens.priorityHighText };
    }
    // Upper-mid priorities
    if (rank === 3) {
        return { bg: designTokens.priorityMidBg, text: designTokens.priorityMidText };
    }
    // Normal and below
    return { bg: designTokens.priorityDefaultBg, text: designTokens.priorityDefaultText };
};
