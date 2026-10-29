/**
 * Demand Expander
 * 
 * Expands service operating calendars and staffing rules into discrete DemandSlot objects.
 */

import { CalendarDefinition, CalendarDateOverride, expandOperatingCalendar } from './calendar-expander';
import { DemandSlot, ShiftInterval } from './types';

export interface ServiceRequirementConfig {
  serviceId: string;
  shift?: ShiftInterval;
  calendar: CalendarDefinition;
  minStaffing: number;
  capacityWeight: number;
  basePriority?: number;
  calendarOverrides?: CalendarDateOverride[];
  staffingOverrides?: Array<{ date: string; minStaffing: number }>;
}

export function expandDemandSlots(
  configs: ServiceRequirementConfig[],
  horizon: { startDate: string; endDate: string },
  publicHolidays: string[] = []
): DemandSlot[] {
  const demandSlots: DemandSlot[] = [];

  for (const cfg of configs) {
    const activeDates = expandOperatingCalendar(
      cfg.calendar,
      horizon,
      publicHolidays,
      cfg.calendarOverrides ?? []
    );

    const staffingOverrideMap = new Map<string, number>();
    for (const ov of cfg.staffingOverrides ?? []) {
      staffingOverrideMap.set(ov.date, ov.minStaffing);
    }

    for (const date of activeDates) {
      const minStaffing = staffingOverrideMap.has(date)
        ? staffingOverrideMap.get(date)!
        : cfg.minStaffing;

      if (minStaffing <= 0) continue;

      demandSlots.push({
        id: `${cfg.serviceId}:${date}`,
        serviceId: cfg.serviceId,
        shift: cfg.shift ? { ...cfg.shift } : undefined,
        date,
        minResourceCount: minStaffing,
        capacityWeightPerResource: cfg.capacityWeight,
        priority: (cfg.basePriority ?? 10) + (minStaffing > 1 ? 5 : 0),
        metadata: {
          calendarId: cfg.calendar.id,
          calendarType: cfg.calendar.baseRule,
        },
      });
    }
  }

  // Sort deterministically: date ascending, then priority descending, then serviceId
  return demandSlots.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.serviceId.localeCompare(b.serviceId);
  });
}
