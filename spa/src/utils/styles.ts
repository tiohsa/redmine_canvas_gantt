// Shared style definitions

export const getStatusColor = (statusId: number) => {
    // 1: New, 2: In Progress, 3: Resolved, 4: Feedback, 5: Closed, 6: Rejected
    switch (statusId) {
        case 2: return { bg: '#e3f2fd', text: '#1976d2', bar: '#42a5f5', label: 'In Progress' };
        case 3: // Resolved (Treat as Done-ish)
        case 5: return { bg: '#e8f5e9', text: '#2e7d32', bar: '#66bb6a', label: 'Done' };
        case 6: // Rejected (Blocked)
        case 4: // Feedback (Warning)
            return { bg: '#fff3e0', text: '#ef6c00', bar: '#ffa726', label: 'Blocked' };
        default: return { bg: '#f5f5f5', text: '#616161', bar: '#bdbdbd', label: 'New' };
    }
};

export const getPriorityColor = (priorityId: number, priorityName?: string) => {
    const name = priorityName?.toLowerCase() || '';

    // Immediate / Urgent
    if (name.includes('immediate') || name.includes('urgent') || priorityId >= 6) {
        return { bg: '#ffebee', text: '#c62828' };
    }
    // High
    if (name.includes('high') || priorityId === 5) {
        return { bg: '#fff3e0', text: '#ef6c00' };
    }
    // Low or Normal (Normal and below)
    return { bg: '#f5f5f5', text: '#616161' };
};
