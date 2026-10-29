import { describe, it, expect } from 'vitest';
import {
  expandOperatingCalendar,
  CalendarDefinition,
} from '../calendar-expander';

describe('Calendar Expander', () => {
  const horizon = { startDate: '2026-11-01', endDate: '2026-11-07' };
  // Nov 1 2026 is Sunday, Nov 2 = Mon, Nov 3 = Tue, Nov 4 = Wed, Nov 5 = Thu, Nov 6 = Fri, Nov 7 = Sat

  it('expands EVERY_DAY to all dates in horizon', () => {
    const calendar: CalendarDefinition = {
      id: 'cal-365',
      name: '365 Continuous',
      baseRule: 'EVERY_DAY',
      excludePublicHolidays: false,
    };

    const dates = expandOperatingCalendar(calendar, horizon);
    expect(dates).toHaveLength(7);
    expect(dates).toContain('2026-11-01'); // Sunday included
    expect(dates).toContain('2026-11-07'); // Saturday included
  });

  it('excludes public holidays for DAILY_EXCEPT_HOLIDAYS', () => {
    const calendar: CalendarDefinition = {
      id: 'cal-daily-no-holidays',
      name: 'Daily No Holidays',
      baseRule: 'DAILY_EXCEPT_HOLIDAYS',
      excludePublicHolidays: true,
    };

    const holidays = ['2026-11-04']; // Wednesday holiday (Diwali)
    const dates = expandOperatingCalendar(calendar, horizon, holidays);

    expect(dates).toHaveLength(6);
    expect(dates).not.toContain('2026-11-04');
    expect(dates).toContain('2026-11-01'); // Sunday still operating
  });

  it('excludes Sundays and public holidays for MON_SAT_EXCLUDE_HOLIDAYS', () => {
    const calendar: CalendarDefinition = {
      id: 'cal-mon-sat',
      name: 'Mon-Sat Business',
      baseRule: 'MON_SAT_EXCLUDE_HOLIDAYS',
      excludePublicHolidays: true,
    };

    const holidays = ['2026-11-04'];
    const dates = expandOperatingCalendar(calendar, horizon, holidays);

    // 7 total days - 1 Sunday (Nov 1) - 1 Holiday (Nov 4) = 5 days
    expect(dates).toHaveLength(5);
    expect(dates).not.toContain('2026-11-01'); // Sunday excluded
    expect(dates).not.toContain('2026-11-04'); // Holiday excluded
    expect(dates).toContain('2026-11-02');
  });

  it('respects explicit date overrides (ADD and REMOVE)', () => {
    const calendar: CalendarDefinition = {
      id: 'cal-mon-sat',
      name: 'Mon-Sat',
      baseRule: 'MON_SAT_EXCLUDE_HOLIDAYS',
      excludePublicHolidays: true,
    };

    const overrides = [
      { date: '2026-11-01', action: 'ADD' as const }, // Force Sunday open
      { date: '2026-11-03', action: 'REMOVE' as const }, // Force Tuesday closed
    ];

    const dates = expandOperatingCalendar(calendar, horizon, [], overrides);

    expect(dates).toContain('2026-11-01'); // Sunday included via override
    expect(dates).not.toContain('2026-11-03'); // Tuesday excluded via override
  });
});
