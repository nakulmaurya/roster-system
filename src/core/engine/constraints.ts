/**
 * Engine Constraint Implementations
 * 
 * Modular Hard and Soft constraints adhering to IHardConstraint and ISoftConstraint interfaces.
 */

import {
  Allocation,
  ConstraintContext,
  DemandSlot,
  IHardConstraint,
  ISoftConstraint,
  OffDay,
  Resource,
  Violation,
} from './types';
import { trailingDays, trailingEntries, allocationWorkDates, intervalWorkDates, slotInterval, shiftUnavailable } from './shift-time';
import { coverageCounts } from './integrity';

// ==========================================
// HARD CONSTRAINT 1: Resource Availability
// ==========================================
export class UnavailableResourceConstraint implements IHardConstraint {
  readonly id = 'H1_UNAVAILABLE_RESOURCE';
  readonly name = 'Unavailable Resource';
  readonly description = 'Resources cannot be scheduled on dates with approved leave, comp-off, or blocked status.';

  canAssign(
    resource: Resource,
    slot: DemandSlot,
    context: ConstraintContext
  ): { allowed: boolean; reason?: string } {
    if (shiftUnavailable(context.problem, slot, resource.id)) {
      return { allowed: false, reason: `Resource ${resource.name} is on leave or unavailable on ${slot.date}` };
    }
    return { allowed: true };
  }

  validate(
    allocations: Allocation[],
    _offDays: OffDay[],
    context: ConstraintContext
  ): Violation[] {
    const violations: Violation[] = [];

    for (const alloc of allocations) {
      const unavailDates = context.unavailabilityMap.get(alloc.resourceId);
      const slot = context.problem.demandSlots.find(s => s.id === alloc.slotId);
      if (slot ? shiftUnavailable(context.problem, slot, alloc.resourceId) : unavailDates?.has(alloc.date)) {
        violations.push({
          id: `H1:${alloc.id}`,
          ruleCode: this.id,
          severity: 'BLOCKER',
          date: alloc.date,
          affectedResourceIds: [alloc.resourceId],
          affectedServiceIds: [alloc.serviceId],
          message: `Resource is scheduled on ${alloc.date} while marked unavailable (leave/comp-off).`,
          suggestedActions: [
            {
              type: 'REMOVE_ALLOCATION',
              description: `Remove invalid allocation for resource on ${alloc.date}.`,
            },
            {
              type: 'ASSIGN_RESOURCE',
              description: 'Assign an available backup resource.',
              date: alloc.date,
              serviceId: alloc.serviceId,
            },
          ],
        });
      }
    }

    return violations;
  }
}

// ==========================================
// HARD CONSTRAINT 2: Daily Capacity Limit
// ==========================================
export class DailyCapacityLimitConstraint implements IHardConstraint {
  readonly id = 'H2_CAPACITY_LIMIT';
  readonly name = 'Daily Capacity Limit';
  readonly description = 'Total daily workload weight must not exceed the resource maxDailyCapacity (default 1.0).';

  canAssign(
    resource: Resource,
    slot: DemandSlot,
    context: ConstraintContext
  ): { allowed: boolean; reason?: string } {
    const existing = context.currentAllocations.get(resource.id) ?? [];
    let currentCapacity = 0;
    for (const a of existing) {
      if (a.date === slot.date) {
        currentCapacity += a.capacityConsumed;
      }
    }

    const projected = currentCapacity + slot.capacityWeightPerResource;
    // Allow slight float tolerance
    if (projected > resource.maxDailyCapacity + 0.001) {
      return {
        allowed: false,
        reason: `Capacity exceeded on ${slot.date}: current ${currentCapacity} + required ${slot.capacityWeightPerResource} > max ${resource.maxDailyCapacity}`,
      };
    }

    return { allowed: true };
  }

  validate(
    allocations: Allocation[],
    _offDays: OffDay[],
    context: ConstraintContext
  ): Violation[] {
    const violations: Violation[] = [];
    // Group allocations by resourceId:date
    const usage = new Map<string, { total: number; resource: Resource; resourceId: string; date: string; serviceIds: Set<string> }>();

    const resourceMap = new Map<string, Resource>();
    for (const r of context.problem.resources) {
      resourceMap.set(r.id, r);
    }

    for (const a of allocations) {
      const key = `${a.resourceId}:${a.date}`;
      const res = resourceMap.get(a.resourceId);
      if (!res) continue;

      if (!usage.has(key)) {
        usage.set(key, { total: 0, resource: res, resourceId: a.resourceId, date: a.date, serviceIds: new Set() });
      }
      const entry = usage.get(key)!;
      entry.total += a.capacityConsumed;
      entry.serviceIds.add(a.serviceId);
    }

    for (const entry of usage.values()) {
      if (entry.total > entry.resource.maxDailyCapacity + 0.001) {
        const { resourceId, date } = entry;
        violations.push({
          id: `H2:${resourceId}:${date}`,
          ruleCode: this.id,
          severity: 'BLOCKER',
          date,
          affectedResourceIds: [resourceId],
          affectedServiceIds: Array.from(entry.serviceIds),
          requiredCount: entry.resource.maxDailyCapacity,
          actualCount: entry.total,
          message: `Resource ${entry.resource.name} is allocated ${entry.total} capacity on ${date}, exceeding limit of ${entry.resource.maxDailyCapacity}.`,
          suggestedActions: [
            {
              type: 'REMOVE_ALLOCATION',
              description: `Reduce workload for ${entry.resource.name} on ${date}.`,
            },
          ],
        });
      }
    }

    return violations;
  }
}

// ==========================================
// HARD CONSTRAINT 3: Eligibility & Capability
// ==========================================
export class EligibilityConstraint implements IHardConstraint {
  readonly id = 'H3_ELIGIBILITY';
  readonly name = 'Capability & Assignment Authorization';
  readonly description = 'Resources can only be scheduled for services for which they hold capability authorization.';

  canAssign(
    resource: Resource,
    slot: DemandSlot,
    context: ConstraintContext
  ): { allowed: boolean; reason?: string } {
    const service = context.problem.services.find((s) => s.id === slot.serviceId);
    if (!service) {
      return { allowed: false, reason: `Service ${slot.serviceId} not found` };
    }

    const hasCapability = resource.capabilityIds.includes(service.requiredCapabilityId);
    if (!hasCapability) {
      return {
        allowed: false,
        reason: `Resource ${resource.name} lacks required capability ${service.requiredCapabilityId} for service ${service.name}`,
      };
    }

    return { allowed: true };
  }

  validate(
    allocations: Allocation[],
    _offDays: OffDay[],
    context: ConstraintContext
  ): Violation[] {
    const violations: Violation[] = [];
    const serviceMap = new Map(context.problem.services.map((s) => [s.id, s]));
    const resourceMap = new Map(context.problem.resources.map((r) => [r.id, r]));

    for (const a of allocations) {
      const s = serviceMap.get(a.serviceId);
      const r = resourceMap.get(a.resourceId);
      if (!s || !r) continue;

      if (!r.capabilityIds.includes(s.requiredCapabilityId)) {
        violations.push({
          id: `H3:${a.id}`,
          ruleCode: this.id,
          severity: 'BLOCKER',
          date: a.date,
          affectedResourceIds: [a.resourceId],
          affectedServiceIds: [a.serviceId],
          message: `Resource ${r.name} lacks capability ${s.requiredCapabilityId} for service ${s.name}.`,
          suggestedActions: [
            {
              type: 'ADD_ELIGIBILITY',
              description: `Grant capability ${s.requiredCapabilityId} to ${r.name}.`,
              resourceId: r.id,
              serviceId: s.id,
            },
            {
              type: 'REMOVE_ALLOCATION',
              description: `Unassign ${r.name} from ${s.name} on ${a.date}.`,
            },
          ],
        });
      }
    }

    return violations;
  }
}

// ==========================================
// HARD CONSTRAINT 4: Minimum Coverage
// ==========================================
export class MinimumCoverageConstraint implements IHardConstraint {
  readonly id = 'H4_MINIMUM_COVERAGE';
  readonly name = 'Minimum Staffing Coverage';
  readonly description = 'All operational demand slots must meet their configured minimum staffing requirement.';

  canAssign(): { allowed: boolean; reason?: string } {
    return { allowed: true };
  }

  validate(
    allocations: Allocation[],
    _offDays: OffDay[],
    context: ConstraintContext
  ): Violation[] {
    const violations: Violation[] = [];
    const counts = coverageCounts(context.problem, allocations);
    for (const slot of context.problem.demandSlots) {
      const scheduled = counts.get(slot.id) ?? 0;
      if (scheduled < slot.minResourceCount) {
        violations.push({
          id: `H4:${slot.id}`,
          ruleCode: this.id,
          severity: 'BLOCKER',
          date: slot.date,
          affectedResourceIds: [],
          affectedServiceIds: [slot.serviceId],
          requiredCount: slot.minResourceCount,
          actualCount: scheduled,
          message: `Coverage deficit on ${slot.date} for service ${slot.serviceId}: required ${slot.minResourceCount}, scheduled ${scheduled}.`,
          suggestedActions: [
            {
              type: 'ASSIGN_RESOURCE',
              description: `Assign an eligible resource to ${slot.serviceId} on ${slot.date}.`,
              date: slot.date,
              serviceId: slot.serviceId,
            },
            {
              type: 'OVERRIDE_REQUIREMENT',
              description: `Temporarily reduce staffing requirement for ${slot.serviceId} on ${slot.date}.`,
              date: slot.date,
              serviceId: slot.serviceId,
            },
          ],
        });
      }
    }

    return violations;
  }
}

// ==========================================
// HARD CONSTRAINT 5: Distinct Resources
// ==========================================
export class DistinctResourcesConstraint implements IHardConstraint {
  readonly id = 'H5_DISTINCT_RESOURCES';
  readonly name = 'Distinct Multi-Resource Staffing';
  readonly description = 'Slots requiring multiple resources must be fulfilled by distinct individuals.';

  canAssign(
    resource: Resource,
    slot: DemandSlot,
    context: ConstraintContext
  ): { allowed: boolean; reason?: string } {
    const existing = context.slotAllocations.get(slot.id) ?? [];
    if (existing.some((a) => a.resourceId === resource.id)) {
      return {
        allowed: false,
        reason: `Resource ${resource.name} is already allocated to slot ${slot.id}`,
      };
    }
    return { allowed: true };
  }

  validate(
    allocations: Allocation[],
    _offDays: OffDay[],
    _context: ConstraintContext
  ): Violation[] {
    const violations: Violation[] = [];
    const seenBySlot = new Map<string, Set<string>>();

    for (const a of allocations) {
      if (!seenBySlot.has(a.slotId)) {
        seenBySlot.set(a.slotId, new Set());
      }
      const set = seenBySlot.get(a.slotId)!;
      if (set.has(a.resourceId)) {
        violations.push({
          id: `H5:${a.slotId}:${a.resourceId}`,
          ruleCode: this.id,
          severity: 'BLOCKER',
          date: a.date,
          affectedResourceIds: [a.resourceId],
          affectedServiceIds: [a.serviceId],
          message: `Resource is duplicated on the same slot ${a.slotId} on ${a.date}.`,
          suggestedActions: [
            {
              type: 'REMOVE_ALLOCATION',
              description: 'Remove duplicate allocation.',
            },
          ],
        });
      } else {
        set.add(a.resourceId);
      }
    }

    return violations;
  }
}

// ==========================================
// HARD CONSTRAINT 6: Max Consecutive Work Days
// ==========================================
export class MaxConsecutiveWorkDaysConstraint implements IHardConstraint {
  readonly id = 'H6_MAX_CONSECUTIVE_DAYS';
  readonly name = 'Fatigue Limit (Max Consecutive Days)';
  readonly description: string;
  private readonly maxDays: number;

  constructor(maxDays = 6) {
    if (!Number.isInteger(maxDays) || maxDays < 1) throw new RangeError('Maximum consecutive work days must be a positive finite integer.');
    this.maxDays = maxDays;
    this.description = `Employees must not work more than ${maxDays} consecutive days without a rest day.`;
  }

  private getWorkDatesForResource(
    resourceId: string,
    context: ConstraintContext
  ): Set<string> {
    const dates = new Set<string>();
    // Include trailing days from previous period
    if (context.problem.trailingContext?.resourceTrailingWorkDays) {
      const trailing = trailingDays(context.problem.trailingContext, resourceId);
      if (trailing) {
        for (const d of trailing) dates.add(d);
      }
    }
    for (const interval of context.problem.trailingContext?.resourceWorkIntervals?.[resourceId] ?? []) {
      for (const date of intervalWorkDates(context.problem, interval)) dates.add(date);
    }
    const current = context.currentAllocations.get(resourceId) ?? [];
    for (const a of current) {
      for (const date of allocationWorkDates(context.problem, a)) dates.add(date);
    }
    return dates;
  }

  canAssign(
    resource: Resource,
    slot: DemandSlot,
    context: ConstraintContext
  ): { allowed: boolean; reason?: string } {
    const workDates = this.getWorkDatesForResource(resource.id, context);
    const touchedDates = intervalWorkDates(context.problem, slotInterval(context.problem, slot));
    if (touchedDates.every(date => workDates.has(date))) {
      // Already working on this date for another process; doesn't add a new day
      return { allowed: true };
    }

    // Check consecutive window if we add slot.date
    const candidateDates = new Set(workDates);
    for (const date of touchedDates) candidateDates.add(date);
    // Check each touched date, including an overnight end date.
    for (const candidateDate of touchedDates) {

    // Check backward streak from slot.date
    let streak = 1;
    let curr = new Date(`${candidateDate}T00:00:00Z`);

    // Backward check
    while (true) {
      curr.setUTCDate(curr.getUTCDate() - 1);
      const prevDate = curr.toISOString().slice(0, 10);
      if (candidateDates.has(prevDate)) {
        streak++;
      } else {
        break;
      }
    }

    // Forward check
    curr = new Date(`${candidateDate}T00:00:00Z`);
    while (true) {
      curr.setUTCDate(curr.getUTCDate() + 1);
      const nextDate = curr.toISOString().slice(0, 10);
      if (candidateDates.has(nextDate)) {
        streak++;
      } else {
        break;
      }
    }

    if (streak > this.maxDays) {
      return {
        allowed: false,
        reason: `Working on ${slot.date} would create ${streak} consecutive work days (max allowed: ${this.maxDays}).`,
      };
    }

    }
    return { allowed: true };
  }

  validate(
    allocations: Allocation[],
    _offDays: OffDay[],
    context: ConstraintContext
  ): Violation[] {
    const violations: Violation[] = [];
    const resourceDates = new Map<string, Set<string>>();

    for (const a of allocations) {
      if (!resourceDates.has(a.resourceId)) {
        resourceDates.set(a.resourceId, new Set());
      }
      for (const date of allocationWorkDates(context.problem, a)) resourceDates.get(a.resourceId)!.add(date);
    }

    // Include trailing dates
    if (context.problem.trailingContext?.resourceTrailingWorkDays) {
      for (const [rId, trailing] of trailingEntries(context.problem.trailingContext)) {
        if (!resourceDates.has(rId)) {
          resourceDates.set(rId, new Set());
        }
        for (const d of trailing) resourceDates.get(rId)!.add(d);
      }
    }

    for (const [resourceId, intervals] of Object.entries(context.problem.trailingContext?.resourceWorkIntervals ?? {})) {
      const dates = resourceDates.get(resourceId) ?? new Set<string>();
      for (const interval of intervals) for (const date of intervalWorkDates(context.problem, interval)) dates.add(date);
      resourceDates.set(resourceId, dates);
    }
    const currentDates = new Map<string, Set<string>>();
    for (const a of allocations) {
      const dates = currentDates.get(a.resourceId) ?? new Set<string>();
      for (const date of allocationWorkDates(context.problem, a)) dates.add(date);
      currentDates.set(a.resourceId, dates);
    }
    for (const [resourceId, datesSet] of resourceDates.entries()) {
      const sortedDates = Array.from(datesSet).sort();
      let streak = 0;
      let prevDate: Date | null = null;
      let streakStart = '';

      for (const dStr of sortedDates) {
        const d = new Date(`${dStr}T00:00:00Z`);
        if (prevDate) {
          const diffDays = Math.round((d.getTime() - prevDate.getTime()) / (1000 * 3600 * 24));
          if (diffDays === 1) {
            streak++;
          } else {
            streak = 1;
            streakStart = dStr;
          }
        } else {
          streak = 1;
          streakStart = dStr;
        }
        prevDate = d;

        if (streak > this.maxDays && (currentDates.get(resourceId)?.has(dStr) || (dStr >= context.problem.horizon.startDate && dStr <= context.problem.horizon.endDate))) {
          violations.push({
            id: `H6:${resourceId}:${dStr}`,
            ruleCode: this.id,
            severity: 'BLOCKER',
            date: dStr,
            affectedResourceIds: [resourceId],
            affectedServiceIds: [],
            requiredCount: this.maxDays,
            actualCount: streak,
            message: `Resource has worked ${streak} consecutive days starting ${streakStart} through ${dStr}.`,
            suggestedActions: [
              {
                type: 'ASSIGN_RESOURCE',
                description: `Schedule a rest day for resource on or before ${dStr}.`,
                date: dStr,
              },
            ],
          });
        }
      }
    }

    return violations;
  }
}

// ==========================================
// SOFT PREFERENCE 1: Primary Continuity
// ==========================================
export class PrimaryContinuityPreference implements ISoftConstraint {
  readonly id = 'S1_PRIMARY_CONTINUITY';
  readonly name = 'Primary Resource Continuity';
  readonly description = 'Prefers designated primary resources over backup or relief staff.';

  score(
    resource: Resource,
    slot: DemandSlot,
    _context: ConstraintContext
  ): number {
    const role = resource.tags?.[`role:${slot.serviceId}`];
    if (role === 'PRIMARY') return 100;
    if (role === 'BACKUP') return 50;
    if (role === 'RELIEF') return 20;
    return 10;
  }

  evaluate(
    _allocations: Allocation[],
    _offDays: OffDay[],
    _context: ConstraintContext
  ): Violation[] {
    // Soft preferences do not emit blockers
    return [];
  }
}

// ==========================================
// SOFT PREFERENCE 2: Preferred Off Day
// ==========================================
export class PreferredOffDayPreference implements ISoftConstraint {
  readonly id = 'S2_PREFERRED_OFF_DAY';
  readonly name = 'Preferred Off Day';
  readonly description = 'Prefers leaving employees off on their requested weekly off day (e.g., Sunday).';

  score(
    resource: Resource,
    slot: DemandSlot,
    _context: ConstraintContext
  ): number {
    if (resource.preferredOffDay === undefined) return 0;
    const d = new Date(`${slot.date}T00:00:00Z`);
    const dayOfWeek = d.getUTCDay();

    // If this date IS their preferred off-day, strongly penalize working on it
    // so relief/backup staff with different off-days are selected to cover 365-day operations!
    if (dayOfWeek === resource.preferredOffDay) {
      return -120;
    }
    return 10;
  }

  evaluate(
    allocations: Allocation[],
    _offDays: OffDay[],
    context: ConstraintContext
  ): Violation[] {
    const violations: Violation[] = [];
    const resourceMap = new Map(context.problem.resources.map((r) => [r.id, r]));

    for (const a of allocations) {
      const res = resourceMap.get(a.resourceId);
      if (!res || res.preferredOffDay === undefined) continue;

      const d = new Date(`${a.date}T00:00:00Z`);
      if (d.getUTCDay() === res.preferredOffDay) {
        violations.push({
          id: `S2:${a.id}`,
          ruleCode: this.id,
          severity: 'WARNING',
          date: a.date,
          affectedResourceIds: [a.resourceId],
          affectedServiceIds: [a.serviceId],
          message: `Resource is scheduled to work on their preferred off-day.`,
          suggestedActions: [],
        });
      }
    }

    return violations;
  }
}

// ==========================================
// SOFT PREFERENCE 3: Workload Equity
// ==========================================
export class WorkloadEquityPreference implements ISoftConstraint {
  readonly id = 'S3_WORKLOAD_EQUITY';
  readonly name = 'Workload Equity';
  readonly description = 'Favors resources that currently have fewer cumulative work shifts.';

  score(
    resource: Resource,
    _slot: DemandSlot,
    context: ConstraintContext
  ): number {
    const existing = context.currentAllocations.get(resource.id) ?? [];
    // More assignments = lower score (encourages even distribution)
    return Math.max(0, 50 - existing.length * 2);
  }

  evaluate(): Violation[] {
    return [];
  }
}

// ==========================================
// SOFT PREFERENCE 4: Pod / Group Affinity
// ==========================================
export class GroupAffinityPreference implements ISoftConstraint {
  readonly id = 'S4_POD_AFFINITY';
  readonly name = 'Pod / Group Affinity';
  readonly description = 'Prefers resources in the same operational pod before borrowing cross-pod.';

  score(
    resource: Resource,
    slot: DemandSlot,
    context: ConstraintContext
  ): number {
    const service = context.problem.services.find((s) => s.id === slot.serviceId);
    if (!service || !resource.groupId) return 0;

    const servicePodId = (slot.metadata?.podId as string) ?? service.tags?.podId;
    if (servicePodId && resource.groupId === servicePodId) {
      return 30; // Intra-pod bonus
    }
    return 0;
  }

  evaluate(): Violation[] {
    return [];
  }
}
