export type TimerRecordingOutcome = 'success' | 'validation_error' | 'unknown';

export interface TimerRecordingPageState {
    isSaving: boolean;
    wasTimeEntryForm: boolean;
    hasTimeEntryForm: boolean;
    hasSuccessNotice: boolean;
    hasValidationError: boolean;
    issueMatches: boolean;
}

export const detectTimerRecordingOutcome = ({
    isSaving,
    wasTimeEntryForm,
    hasTimeEntryForm,
    hasSuccessNotice,
    hasValidationError,
    issueMatches
}: TimerRecordingPageState): TimerRecordingOutcome | null => {
    if (!isSaving || !wasTimeEntryForm) return null;
    if (hasValidationError && hasTimeEntryForm) return 'validation_error';
    if (!hasTimeEntryForm && hasSuccessNotice && issueMatches) return 'success';
    return 'unknown';
};
