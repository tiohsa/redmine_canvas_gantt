export type TimerRecordingOutcome = 'success' | 'validation_error' | 'unknown';

export interface TimerRecordingPageState {
    isSaving: boolean;
    wasTimeEntryForm: boolean;
    isTimeEntryFormPage: boolean;
    hasSuccessNotice: boolean;
    hasValidationError: boolean;
    issueMatches: boolean;
}

export const isTimeEntryFormPath = (pathname: string): boolean => (
    pathname.includes('/time_entries/new') ||
    (pathname.includes('/time_entries') && (pathname.includes('/new') || pathname.includes('/edit')))
);

export const detectTimerRecordingOutcome = ({
    isSaving,
    wasTimeEntryForm,
    isTimeEntryFormPage,
    hasSuccessNotice,
    hasValidationError,
    issueMatches
}: TimerRecordingPageState): TimerRecordingOutcome | null => {
    if (!isSaving || !wasTimeEntryForm) return null;
    if (hasValidationError && isTimeEntryFormPage) return 'validation_error';
    if (!isTimeEntryFormPage && hasSuccessNotice && issueMatches) return 'success';
    return 'unknown';
};
