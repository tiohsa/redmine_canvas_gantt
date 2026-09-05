import { describe, expect, it } from 'vitest';
import { detectTimerRecordingOutcome } from './timerRecordingOutcome';

describe('timer recording outcome', () => {
    const base = {
        isSaving: true,
        wasTimeEntryForm: true,
        hasTimeEntryForm: false,
        hasSuccessNotice: false,
        hasValidationError: false,
        issueMatches: true
    };

    it('accepts only an explicit success notice after leaving the form', () => {
        expect(detectTimerRecordingOutcome({ ...base, hasSuccessNotice: true })).toBe('success');
        expect(detectTimerRecordingOutcome({ ...base, hasSuccessNotice: true, issueMatches: false })).toBe('unknown');
        expect(detectTimerRecordingOutcome({ ...base, hasTimeEntryForm: true, hasSuccessNotice: true })).toBe('unknown');
        expect(detectTimerRecordingOutcome({ ...base })).toBe('unknown');
    });

    it('classifies a validation page without closing the session', () => {
        expect(detectTimerRecordingOutcome({
            ...base,
            hasTimeEntryForm: true,
            hasValidationError: true
        })).toBe('validation_error');
    });

    it('uses the form in the loaded document instead of the URL for validation errors', () => {
        expect(detectTimerRecordingOutcome({
            ...base,
            wasTimeEntryForm: true,
            hasTimeEntryForm: true,
            hasValidationError: true
        })).toBe('validation_error');
        expect(detectTimerRecordingOutcome({
            ...base,
            wasTimeEntryForm: true,
            hasTimeEntryForm: false,
            hasValidationError: true
        })).toBe('unknown');
    });
});
