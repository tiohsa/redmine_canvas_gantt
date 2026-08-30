import { describe, expect, it } from 'vitest';
import { detectTimerRecordingOutcome, isTimeEntryFormPath } from './timerRecordingOutcome';

describe('timer recording outcome', () => {
    const base = {
        isSaving: true,
        wasTimeEntryForm: true,
        isTimeEntryFormPage: false,
        hasSuccessNotice: false,
        hasValidationError: false,
        issueMatches: true
    };

    it('accepts only an explicit success notice after leaving the form', () => {
        expect(detectTimerRecordingOutcome({ ...base, hasSuccessNotice: true })).toBe('success');
        expect(detectTimerRecordingOutcome({ ...base, hasSuccessNotice: true, issueMatches: false })).toBe('unknown');
        expect(detectTimerRecordingOutcome({ ...base, isTimeEntryFormPage: true, hasSuccessNotice: true })).toBe('unknown');
        expect(detectTimerRecordingOutcome({ ...base })).toBe('unknown');
    });

    it('classifies a validation page without closing the session', () => {
        expect(detectTimerRecordingOutcome({
            ...base,
            isTimeEntryFormPage: true,
            hasValidationError: true
        })).toBe('validation_error');
    });

    it('recognizes editable and new time-entry paths', () => {
        expect(isTimeEntryFormPath('/issues/1/time_entries/new')).toBe(true);
        expect(isTimeEntryFormPath('/time_entries/1/edit')).toBe(true);
        expect(isTimeEntryFormPath('/issues/1')).toBe(false);
    });
});
