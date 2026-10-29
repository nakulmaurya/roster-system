/**
 * Scheduling Engine - Deterministic Solver
 * 
 * Uses static MRV ordering and greedy soft scoring with a time budget.
 * Does not backtrack or prove optimality/infeasibility.
 */

import {
  Allocation,
  ConstraintContext,
  DemandSlot,
  IHardConstraint,
  ISoftConstraint,
  OffDay,
  Resource,
  ScheduleSolution,
  SchedulingProblem,
  SolverMetrics,
  SolverStatus,
  Violation,
} from './types';
import { candidateShiftAllowed, auditShiftIntervals, shiftUnavailable, allocationWorkDates, intervalWorkDates } from './shift-time';
import { generateDateSequence } from './calendar-expander';
import { validateConfiguration, validateAllocationIntegrity, coverageMetrics } from './integrity';

export interface SolverOptions {
  timeoutMs?: number; // Default 5000ms
}

export function solveSchedule(
  problem: SchedulingProblem,
  hardConstraints: IHardConstraint[],
  softConstraints: ISoftConstraint[],
  options: SolverOptions = {}
): ScheduleSolution {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs ?? 5000;

  const configurationErrors = validateConfiguration(problem);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new Error('timeoutMs must be a finite nonnegative number.');
  if (configurationErrors.length) return {
    status: 'INVALID_CONFIG', allocations: [], offDays: [], violations: configurationErrors,
    metrics: { totalDemandSlots: problem.demandSlots.length, fulfilledSlots: 0, coverageRate: 0,
      executionTimeMs: Date.now() - startTime, backtracks: 0, timedOut: false },
  };

  // 1. Setup indices and lookup structures
  const currentAllocations = new Map<string, Allocation[]>();
  const dateAllocations = new Map<string, Allocation[]>();
  const slotAllocations = new Map<string, Allocation[]>();
  const unavailabilityMap = new Map<string, Set<string>>();

  for (const r of problem.resources) {
    currentAllocations.set(r.id, []);
    unavailabilityMap.set(r.id, new Set());
  }

  for (const u of problem.unavailabilities) {
    if (!unavailabilityMap.has(u.resourceId)) {
      unavailabilityMap.set(u.resourceId, new Set());
    }
    unavailabilityMap.get(u.resourceId)!.add(u.date);
  }

  // 2. Seed locked allocations
  for (const locked of problem.lockedAllocations) {
    if (!currentAllocations.has(locked.resourceId)) {
      currentAllocations.set(locked.resourceId, []);
    }
    currentAllocations.get(locked.resourceId)!.push(locked);

    if (!dateAllocations.has(locked.date)) {
      dateAllocations.set(locked.date, []);
    }
    dateAllocations.get(locked.date)!.push(locked);

    if (!slotAllocations.has(locked.slotId)) {
      slotAllocations.set(locked.slotId, []);
    }
    slotAllocations.get(locked.slotId)!.push(locked);
  }

  const context: ConstraintContext = {
    problem,
    currentAllocations,
    dateAllocations,
    slotAllocations,
    unavailabilityMap,
  };

  const backtracks = 0; // Greedy strategy performs no backtracking.
  let timedOut = false;

  // 3. Helper to test if a candidate satisfies all hard constraints
  const demandIndex = new Map(problem.demandSlots.map(s => [s.id, s]));
  const isCandidateValid = (res: Resource, slot: DemandSlot): boolean => {
    for (const hc of hardConstraints) {
      const resCheck = hc.canAssign(res, slot, context);
      if (!resCheck.allowed) {
        return false;
      }
    }
    return candidateShiftAllowed(problem, slot, res.id, currentAllocations.get(res.id) ?? [], demandIndex) && !shiftUnavailable(problem, slot, res.id);
  };

  // Helper to score a candidate with soft constraints
  const scoreCandidate = (res: Resource, slot: DemandSlot): number => {
    let total = 0;
    for (const sc of softConstraints) {
      total += sc.score(res, slot, context);
    }
    return total;
  };

  // Helper to assign a resource to a slot
  const applyAllocation = (
    res: Resource,
    slot: DemandSlot,
    source: Allocation['source'] = 'SYSTEM_SOLVER'
  ): Allocation => {
    const alloc: Allocation = {
      id: `alloc:${slot.id}:${res.id}`,
      slotId: slot.id,
      serviceId: slot.serviceId,
      resourceId: res.id,
      date: slot.date,
      capacityConsumed: slot.capacityWeightPerResource,
      isLocked: false,
      source,
    };

    currentAllocations.get(res.id)!.push(alloc);

    if (!dateAllocations.has(slot.date)) dateAllocations.set(slot.date, []);
    dateAllocations.get(slot.date)!.push(alloc);

    if (!slotAllocations.has(slot.id)) slotAllocations.set(slot.id, []);
    slotAllocations.get(slot.id)!.push(alloc);

    return alloc;
  };

  // 4. Identify remaining unfilled demand slots
  // For multi-resource slots, we expand them into discrete seat requirements
  interface SeatRequirement {
    slot: DemandSlot;
    seatIndex: number;
    candidateCount: number;
  }

  const seatsToFill: SeatRequirement[] = [];

  for (const slot of problem.demandSlots) {
    const existingCount = slotAllocations.get(slot.id)?.length ?? 0;
    const needed = slot.minResourceCount - existingCount;

    if (needed > 0) {
      // Calculate MRV: count how many candidates could theoretically fill this
      let validCount = 0;
      for (const res of problem.resources) {
        if (isCandidateValid(res, slot)) {
          validCount++;
        }
      }

      for (let i = 0; i < needed; i++) {
        seatsToFill.push({
          slot,
          seatIndex: existingCount + i,
          candidateCount: validCount,
        });
      }
    }
  }

  // 5. Sort seats by MRV (Most Constrained First)
  // Fewest candidates first, then higher priority, then date
  seatsToFill.sort((a, b) => {
    if (a.candidateCount !== b.candidateCount) {
      return a.candidateCount - b.candidateCount;
    }
    if (b.slot.priority !== a.slot.priority) {
      return b.slot.priority - a.slot.priority;
    }
    return a.slot.date.localeCompare(b.slot.date) || a.slot.id.localeCompare(b.slot.id) || a.seatIndex - b.seatIndex;
  });

  // 6. Greedy solver with soft ranking for each seat
  const createdAllocations: Allocation[] = [];

  for (const seat of seatsToFill) {
    if (Date.now() - startTime >= timeoutMs) {
      timedOut = true;
      break;
    }

    const validCandidates: Array<{ resource: Resource; score: number }> = [];

    for (const res of problem.resources) {
      if (isCandidateValid(res, seat.slot)) {
        validCandidates.push({
          resource: res,
          score: scoreCandidate(res, seat.slot),
        });
      }
    }

    if (validCandidates.length > 0) {
      // Sort candidates: highest score first, then stable ID sort
      validCandidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.resource.id.localeCompare(b.resource.id);
      });

      const chosen = validCandidates[0].resource;
      const alloc = applyAllocation(chosen, seat.slot, 'SYSTEM_SOLVER');
      createdAllocations.push(alloc);
    } else {
      // No candidate could satisfy all hard constraints
      // Leave this requirement unresolved; do not invent a resource.
    }
  }

  const allAllocations: Allocation[] = [
    ...problem.lockedAllocations,
    ...createdAllocations,
  ];

  // 7. Generate explicit OffDay records for every resource
  const allHorizonDates = generateDateSequence(problem.horizon.startDate, problem.horizon.endDate);
  const offDays: OffDay[] = [];

  for (const res of problem.resources) {
    const resAllocs = currentAllocations.get(res.id) ?? [];
    const workDates = new Set([...resAllocs.flatMap(a => allocationWorkDates(problem, a)), ...(problem.trailingContext?.resourceWorkIntervals?.[res.id] ?? []).flatMap(i => intervalWorkDates(problem, i))]);
    const unavailDates = unavailabilityMap.get(res.id) ?? new Set();

    for (const dStr of allHorizonDates) {
      if (!workDates.has(dStr)) {
        const d = new Date(`${dStr}T00:00:00Z`);
        const isPreferred = res.preferredOffDay !== undefined && d.getUTCDay() === res.preferredOffDay;

        let reason: OffDay['reason'] = 'WEEKLY_OFF';
        if (unavailDates.has(dStr)) {
          const unavail = problem.unavailabilities.find((u) => u.resourceId === res.id && u.date === dStr);
          reason = unavail?.reason === 'COMP_OFF' ? 'COMP_OFF' : 'LEAVE';
        }

        offDays.push({
          resourceId: res.id,
          date: dStr,
          reason,
          isPreferredDay: isPreferred,
        });
      }
    }
  }

  // 8. Independent Validation
  const violations: Violation[] = validateAllocationIntegrity(problem, allAllocations);
  violations.push(...auditShiftIntervals(problem, allAllocations));
  for (const hc of hardConstraints) {
    violations.push(...hc.validate(allAllocations, offDays, context));
  }
  for (const sc of softConstraints) {
    violations.push(...sc.evaluate(allAllocations, offDays, context));
  }

  const executionTimeMs = Date.now() - startTime;
  const { fulfilledSlots, totalSlots: totalDemandSlots, coverageRate } = coverageMetrics(problem, allAllocations);
  const hasNonCoverageBlockers = violations.some(v => v.severity === 'BLOCKER' && v.ruleCode !== 'H4_MINIMUM_COVERAGE');
  let status: SolverStatus = 'FEASIBLE';
  if (hasNonCoverageBlockers) status = 'INVALID_SCHEDULE';
  else if (timedOut) status = 'TIMEOUT_PARTIAL';
  else if (violations.some(v => v.severity === 'BLOCKER') || coverageRate < 1) status = 'PARTIAL';

  const metrics: SolverMetrics = {
    totalDemandSlots,
    fulfilledSlots,
    coverageRate,
    executionTimeMs,
    backtracks,
    timedOut,
  };

  return {
    status,
    allocations: allAllocations,
    offDays,
    violations,
    metrics,
  };
}
