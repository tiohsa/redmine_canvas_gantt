import { LayoutEngine } from '../engines/LayoutEngine';
import type { Viewport } from '../types';
import { parseDateOnly, toTimelineDate, type Instant, type TimelineDate } from './dateOnly';

const viewport = {} as Viewport;
const calendarDate = parseDateOnly('2024-01-02')!;
const instant = Date.now() as Instant;
const timelineDate: TimelineDate = toTimelineDate(calendarDate);

LayoutEngine.dateToX(timelineDate, viewport);
LayoutEngine.calendarDateToX(calendarDate, viewport);

// @ts-expect-error Instant/raw timestamp must be converted first.
LayoutEngine.calendarDateToX(instant, viewport);

// @ts-expect-error Raw timestamps must be converted before date-only use.
LayoutEngine.calendarDateToX(Date.now(), viewport);

// @ts-expect-error CalendarDate must be projected to TimelineDate first.
LayoutEngine.dateToX(calendarDate, viewport);
