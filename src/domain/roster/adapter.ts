/**
 * D2C Roster Domain Adapter
 * 
 * Bridges D2C database/seed models and the pure domain-agnostic scheduling engine.
 */

import {
  Allocation,
  DemandSlot,
  Resource,
  SchedulingProblem,
  Service,
  Unavailability,
} from '@/core/engine/types';
import { expandDemandSlots } from '@/core/engine/demand-expander';
import { SeedDataset } from './seed-data';
import { datasetSchema, periodSchema } from './validation';

export interface MonthPeriod {
  year: number;
  month: number; // 1 - 12
}

/**
 * Returns startDate and endDate strings for a given year and month (1-indexed).
 */
export function getMonthHorizon(year: number, month: number): { startDate: string; endDate: string } {
  periodSchema.parse({ year, month });
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0)); // last day of month

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/**
 * Translates D2C Roster models into a pure SchedulingProblem for the engine.
 */
export function toSchedulingProblem(
  data: SeedDataset,
  period: MonthPeriod,
  lockedAllocations: Allocation[] = []
): SchedulingProblem {
  datasetSchema.parse(data);
  const horizon = {
    ...getMonthHorizon(period.year, period.month),
    timezone: 'Asia/Kolkata',
  };

  // 1. Build Service map from brandProcesses
  const brandMap = new Map(data.brands.map((b) => [b.id, b]));
  const calendarMap = new Map(data.calendars.map((c) => [c.id, c]));

  const services: Service[] = data.brandProcesses.map((bp) => {
    const brand = brandMap.get(bp.brandId);
    return {
      id: bp.id,
      name: `${brand?.name ?? bp.brandId}`,
      requiredCapabilityId: `cap:${bp.id}`,
      staffingModel: brand?.staffingModel === 'MULTI' ? 'MULTI_RESOURCE' : 'SINGLE_RESOURCE',
      tags: {
        brandId: bp.brandId,
        podId: brand?.podId ?? '',
        processId: bp.processId,
      },
    };
  });

  // 2. Build Resources with capabilities & role tags derived from assignments
  const employeeCapabilities = new Map<string, Set<string>>();
  const employeeTags = new Map<string, Record<string, string>>();

  for (const emp of data.employees) {
    employeeCapabilities.set(emp.id, new Set());
    employeeTags.set(emp.id, {
      podId: emp.podId,
    });
  }

  for (const asgn of data.assignments) {
    const capSet = employeeCapabilities.get(asgn.employeeId);
    if (capSet) {
      capSet.add(`cap:${asgn.brandProcessId}`);
    }
    const tags = employeeTags.get(asgn.employeeId);
    if (tags) {
      tags[`role:${asgn.brandProcessId}`] = asgn.role;
    }
  }

  const resources: Resource[] = data.employees.map((emp) => ({
    id: emp.id,
    name: emp.name,
    capabilityIds: Array.from(employeeCapabilities.get(emp.id) ?? []),
    maxDailyCapacity: emp.maxDailyCapacity,
    groupId: emp.podId,
    preferredOffDay: emp.preferredOffDay,
    tags: employeeTags.get(emp.id),
  }));

  // 3. Expand DemandSlots from calendars
  const holidayDates = data.publicHolidays.map((h) => h.holidayDate);
  const requirementConfigs = data.brandProcesses.map((bp) => {
    const cal = calendarMap.get(bp.calendarId)!;
    const brand = brandMap.get(bp.brandId);
    return {
      serviceId: bp.id,
      calendar: cal,
      minStaffing: bp.minStaffing,
      capacityWeight: bp.capacityWeight,
      shift: bp.shift ?? { startMinute: 0, endMinute: 1440, timezone: horizon.timezone },
      calendarOverrides: bp.calendarOverrides,
      staffingOverrides: bp.staffingOverrides,
      basePriority: brand?.staffingModel === 'SINGLE' ? 12 : 10,
    };
  });

  const demandSlots: DemandSlot[] = expandDemandSlots(
    requirementConfigs,
    horizon,
    holidayDates
  );

  // 4. Map Leaves to Unavailabilities
  const unavailabilities: Unavailability[] = data.leaves.map((l) => ({
    resourceId: l.employeeId,
    date: l.leaveDate,
    reason: l.leaveType === 'SICK' ? 'SICK_LEAVE' : l.leaveType === 'COMP_OFF' ? 'COMP_OFF' : 'LEAVE',
  }));

  return {
    id: `roster-${period.year}-${String(period.month).padStart(2, '0')}`,
    horizon,
    resources,
    services,
    demandSlots,
    unavailabilities,
    lockedAllocations,
  };
}
