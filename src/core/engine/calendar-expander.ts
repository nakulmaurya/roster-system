import { isISODate } from './integrity';

/**
 * Calendar Expander
 * 
 * Expands recurring calendar configurations and date overrides into discrete date lists.
 */

export type CalendarBaseRule = 
  | 'EVERY_DAY'                    // 7 days a week, 365 days
  | 'DAILY_EXCEPT_HOLIDAYS'         // Mon-Sun, closed on configured public holidays
  | 'MON_SAT_EXCLUDE_HOLIDAYS'      // Mon-Sat, closed on Sundays and public holidays
  | 'WEEKDAYS_ONLY';               // Mon-Fri, closed on Saturdays, Sundays, and public holidays

export interface CalendarDateOverride {
  date: string; // YYYY-MM-DD
  action: 'ADD' | 'REMOVE';
}

export interface CalendarDefinition {
  id: string;
  name: string;
  baseRule: CalendarBaseRule;
  excludePublicHolidays: boolean;
}

/**
 * Generates an array of all dates (YYYY-MM-DD) between startDate and endDate inclusive.
 */
export function generateDateSequence(startDate: string, endDate: string): string[] {
  if (!isISODate(startDate) || !isISODate(endDate) || startDate > endDate) {
    throw new Error('Calendar horizon must contain valid ISO dates in ascending order.');
  }
  if ((Date.parse(endDate) - Date.parse(startDate)) / 86400000 > 3660) {
    throw new Error('Calendar horizon exceeds 3661 days.');
  }
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Expands a calendar definition into a list of active operational dates for a given horizon.
 */
export function expandOperatingCalendar(
  calendar: CalendarDefinition,
  horizon: { startDate: string; endDate: string },
  publicHolidays: string[] = [],
  overrides: CalendarDateOverride[] = []
): string[] {
  const allDates = generateDateSequence(horizon.startDate, horizon.endDate);
  const holidaySet = new Set(publicHolidays);
  const overrideAddSet = new Set<string>();
  const overrideRemoveSet = new Set<string>();

  for (const ov of overrides) {
    if (ov.action === 'ADD') overrideAddSet.add(ov.date);
    if (ov.action === 'REMOVE') overrideRemoveSet.add(ov.date);
  }

  const activeDates: string[] = [];

  for (const dateStr of allDates) {
    // 1. Explicit REMOVE override always wins
    if (overrideRemoveSet.has(dateStr)) {
      continue;
    }

    // 2. Explicit ADD override always wins
    if (overrideAddSet.has(dateStr)) {
      activeDates.push(dateStr);
      continue;
    }

    const d = new Date(`${dateStr}T00:00:00Z`);
    const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const isHoliday = holidaySet.has(dateStr);

    let isActive = false;

    switch (calendar.baseRule) {
      case 'EVERY_DAY':
        isActive = true;
        break;

      case 'DAILY_EXCEPT_HOLIDAYS':
        isActive = !isHoliday;
        break;

      case 'MON_SAT_EXCLUDE_HOLIDAYS':
        isActive = dayOfWeek !== 0 && !isHoliday;
        break;

      case 'WEEKDAYS_ONLY':
        isActive = dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday;
        break;
    }

    if (isActive && !(calendar.excludePublicHolidays && isHoliday)) {
      activeDates.push(dateStr);
    }
  }

  return activeDates.sort();
}
