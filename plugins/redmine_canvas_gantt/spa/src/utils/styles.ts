// Shared style definitions

export const getStatusColor = (statusId: number) => {
    // 1: New, 2: In Progress, 3: Resolved, 4: Feedback, 5: Closed, 6: Rejected
    switch (statusId) {
        case 2:
            return { bg: '#e6efff', text: '#2f5fd6', bar: '#3d7ff5', label: 'In Progress', progress: '#6ba4ff', shadow: 'rgba(61, 127, 245, 0.28)' };
        case 3: // Resolved (Treat as Done-ish)
        case 5:
            return { bg: '#e8f6ee', text: '#0f7d48', bar: '#40c57c', label: 'Completed', progress: '#63d695', shadow: 'rgba(16, 125, 72, 0.24)' };
        case 6: // Rejected (Blocked)
        case 4: // Feedback (Warning)
            return { bg: '#fff2e6', text: '#c45b12', bar: '#f2a03f', label: 'Blacklisted', progress: '#ffb36b', shadow: 'rgba(244, 160, 63, 0.25)' };
        default:
            return { bg: '#eef2f7', text: '#4c566a', bar: '#aebad0', label: 'Planned', progress: '#c7d1e3', shadow: 'rgba(174, 186, 208, 0.22)' };
    }
};
