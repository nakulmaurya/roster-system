/**
 * Engine Repair & Suggestion Advisor
 * 
 * Computes lexicographically ranked candidate replacements for coverage gaps
 * and evaluates change impact without fake-weighted scoring.
 */

import {
  Allocation,
  ConstraintContext,
  DemandSlot,
  IHardConstraint,
  ISoftConstraint,
  ReplacementCandidate,
  SchedulingProblem,
  Violation,
} from './types';
import { candidateShiftAllowed, auditShiftIntervals, trailingDays, shiftUnavailable } from './shift-time';
import { validateAllocationIntegrity, validateConfiguration } from './integrity';

export function suggestReplacements(
  problem: SchedulingProblem,
  slot: DemandSlot,
  currentAllocations: Allocation[],
  hardConstraints: IHardConstraint[]
): ReplacementCandidate[] {
  if (validateConfiguration(problem).length) return [];
  // Build lookup maps
  const allocMap = new Map<string, Allocation[]>();
  const dateMap = new Map<string, Allocation[]>();
  const slotMap = new Map<string, Allocation[]>();
  const unavailMap = new Map<string, Set<string>>();

  for (const r of problem.resources) {
    allocMap.set(r.id, []);
    unavailMap.set(r.id, new Set());
  }

  for (const u of problem.unavailabilities) {
    if (!unavailMap.has(u.resourceId)) unavailMap.set(u.resourceId, new Set());
    unavailMap.get(u.resourceId)!.add(u.date);
  }

  for (const a of currentAllocations) {
    if (!allocMap.has(a.resourceId)) allocMap.set(a.resourceId, []);
    allocMap.get(a.resourceId)!.push(a);

    if (!dateMap.has(a.date)) dateMap.set(a.date, []);
    dateMap.get(a.date)!.push(a);

    if (!slotMap.has(a.slotId)) slotMap.set(a.slotId, []);
    slotMap.get(a.slotId)!.push(a);
  }

  const context: ConstraintContext = {
    problem,
    currentAllocations: allocMap,
    dateAllocations: dateMap,
    slotAllocations: slotMap,
    unavailabilityMap: unavailMap,
  };

  const service = problem.services.find((s) => s.id === slot.serviceId);
  if (!service) return [];

  const candidates: ReplacementCandidate[] = [];
  const demandIndex = new Map(problem.demandSlots.map(s => [s.id, s]));

  for (const res of problem.resources) {
    // 1. Fast eligibility check
    if (!res.capabilityIds.includes(service.requiredCapabilityId)) {
      continue;
    }

    if (!candidateShiftAllowed(problem, slot, res.id, currentAllocations, demandIndex) || shiftUnavailable(problem, slot, res.id)) continue;

    // 2. Hard constraints check
    let passesHardConstraints = true;
    for (const hc of hardConstraints) {
      const check = hc.canAssign(res, slot, context);
      if (!check.allowed) {
        passesHardConstraints = false;
        break;
      }
    }

    if (!passesHardConstraints) {
      continue;
    }

    // 3. Compute ranking metrics
    const roleTag = res.tags?.[`role:${slot.serviceId}`] ?? 'RELIEF';
    const roleTier: ReplacementCandidate['roleTier'] =
      roleTag === 'PRIMARY' ? 'PRIMARY' : roleTag === 'BACKUP' ? 'BACKUP' : 'RELIEF';

    const servicePodId = (slot.metadata?.podId as string) ?? service.tags?.podId;
    const isSameGroup = Boolean(servicePodId && res.groupId === servicePodId);

    const existingAllocs = allocMap.get(res.id) ?? [];
    const monthWorkDays = new Set(existingAllocs.map((a) => a.date)).size;

    let dayAllocCapacity = 0;
    for (const a of existingAllocs) {
      if (a.date === slot.date) dayAllocCapacity += a.capacityConsumed;
    }
    const remainingCapacityOnDate = Math.max(0, res.maxDailyCapacity - dayAllocCapacity);

    // Calculate consecutive work days around this date
    const workDates = new Set([...(trailingDays(problem.trailingContext, res.id)), ...existingAllocs.map((a) => a.date)]);
    let consecutiveWorkDaysOnDate = 1;
    const curr = new Date(`${slot.date}T00:00:00Z`);

    // backward
    while (true) {
      curr.setUTCDate(curr.getUTCDate() - 1);
      const prev = curr.toISOString().slice(0, 10);
      if (workDates.has(prev)) consecutiveWorkDaysOnDate++;
      else break;
    }

    curr.setTime(Date.parse(`${slot.date}T00:00:00Z`));
    while (true) {
      curr.setUTCDate(curr.getUTCDate() + 1);
      if (workDates.has(curr.toISOString().slice(0, 10))) consecutiveWorkDaysOnDate++;
      else break;
    }

    const reasons: string[] = [];
    if (roleTier === 'PRIMARY') reasons.push('Designated primary employee');
    else if (roleTier === 'BACKUP') reasons.push('Designated backup employee');
    else reasons.push('Qualified relief / cross-trained employee');

    if (isSameGroup) reasons.push('Member of the same operational pod');
    reasons.push(`${monthWorkDays} working days scheduled this month`);
    reasons.push(`${remainingCapacityOnDate.toFixed(1)} capacity available on ${slot.date}`);

    candidates.push({
      resourceId: res.id,
      rank: 0,
      roleTier,
      isSameGroup,
      consecutiveWorkDaysOnDate,
      monthWorkDays,
      remainingCapacityOnDate,
      reasons,
    });
  }

  // 4. Lexicographic Sort:
  // - Role Tier: PRIMARY (1) > BACKUP (2) > RELIEF (3)
  // - Same Group: true > false
  // - Fewer Month Work Days: ascending
  // - Consecutive days on date: fewer is better
  // - Stable ID
  const roleOrder: Record<ReplacementCandidate['roleTier'], number> = {
    PRIMARY: 1,
    BACKUP: 2,
    RELIEF: 3,
  };

  candidates.sort((a, b) => {
    if (roleOrder[a.roleTier] !== roleOrder[b.roleTier]) {
      return roleOrder[a.roleTier] - roleOrder[b.roleTier];
    }
    if (a.isSameGroup !== b.isSameGroup) {
      return a.isSameGroup ? -1 : 1;
    }
    if (a.monthWorkDays !== b.monthWorkDays) {
      return a.monthWorkDays - b.monthWorkDays;
    }
    if (a.consecutiveWorkDaysOnDate !== b.consecutiveWorkDaysOnDate) {
      return a.consecutiveWorkDaysOnDate - b.consecutiveWorkDaysOnDate;
    }
    return a.resourceId.localeCompare(b.resourceId);
  });

  // Assign 1-indexed ranks
  candidates.forEach((c, idx) => {
    c.rank = idx + 1;
  });

  return candidates;
}

export interface ChangeImpactResult {
  previousViolations: Violation[];
  newViolations: Violation[];
  netBlockerDelta: number; // Negative is improvement (fewer blockers)
  isNetPositive: boolean;
}

export function evaluateScheduleChange(
  problem: SchedulingProblem,
  allocations: Allocation[],
  hardConstraints: IHardConstraint[],
  softConstraints: ISoftConstraint[] = []
): Violation[] {
  const allocMap = new Map<string, Allocation[]>();
  const dateMap = new Map<string, Allocation[]>();
  const slotMap = new Map<string, Allocation[]>();
  const unavailMap = new Map<string, Set<string>>();

  for (const r of problem.resources) {
    allocMap.set(r.id, []);
    unavailMap.set(r.id, new Set());
  }

  for (const u of problem.unavailabilities) {
    if (!unavailMap.has(u.resourceId)) unavailMap.set(u.resourceId, new Set());
    unavailMap.get(u.resourceId)!.add(u.date);
  }

  for (const a of allocations) {
    if (!allocMap.has(a.resourceId)) allocMap.set(a.resourceId, []);
    allocMap.get(a.resourceId)!.push(a);

    if (!dateMap.has(a.date)) dateMap.set(a.date, []);
    dateMap.get(a.date)!.push(a);

    if (!slotMap.has(a.slotId)) slotMap.set(a.slotId, []);
    slotMap.get(a.slotId)!.push(a);
  }

  const context: ConstraintContext = {
    problem,
    currentAllocations: allocMap,
    dateAllocations: dateMap,
    slotAllocations: slotMap,
    unavailabilityMap: unavailMap,
  };

  const configErrors = validateConfiguration(problem);
  if (configErrors.length) return configErrors;
  const violations: Violation[] = validateAllocationIntegrity(problem, allocations);
  violations.push(...auditShiftIntervals(problem, allocations));
  for (const hc of hardConstraints) {
    violations.push(...hc.validate(allocations, [], context));
  }
  for (const constraint of softConstraints) violations.push(...constraint.evaluate(allocations, [], context));

  return violations;
}
