export type BusinessDayType = 'working' | 'non_working';
export type BusinessDaySource = 'override' | 'weekly';

export interface BusinessCalendarDay {
    name: string;
    type: BusinessDayType;
}

export interface BusinessCalendarDefinition {
    id: string;
    name: string;
    nonWorkingWeekDays: number[];
    days: Record<string, BusinessCalendarDay>;
}

export interface BusinessCalendarPayload {
    status: 'ok' | 'error';
    validationStatus?: 'valid' | 'invalid' | 'stale';
    validationMessage?: string | null;
    diagnostic?: BusinessCalendarDiagnostic | null;
    revision: string;
    defaultCalendarId: string | null;
    projectCalendarIds: Record<string, string>;
    calendars: Record<string, BusinessCalendarDefinition>;
    warnings: string[];
}

export interface BusinessCalendarDiagnostic {
    code: string;
    file?: string;
    line?: number;
    message: string;
    cause?: string;
    value?: string;
}

export interface BusinessDayInfo {
    name: string | null;
    type: BusinessDayType;
    source: BusinessDaySource;
}
