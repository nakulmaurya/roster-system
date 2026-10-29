import { describe, it, expect } from 'vitest';
import { generateSeedData } from '../seed-data';
import { toSchedulingProblem } from '../adapter';
import {
  createScheduler,
  UnavailableResourceConstraint,
  DailyCapacityLimitConstraint,
  EligibilityConstraint,
  MinimumCoverageConstraint,
  DistinctResourcesConstraint,
  MaxConsecutiveWorkDaysConstraint,
  PrimaryContinuityPreference,
  PreferredOffDayPreference,
  WorkloadEquityPreference,
  GroupAffinityPreference,
  Allocation,
} from '@/core/engine';

describe('DATASTRAW 30-Employee, 20-Brand Full November 2026 Roster Lifecycle', () => {
  const scheduler = createScheduler({
    hardConstraints: [
      new UnavailableResourceConstraint(),
      new DailyCapacityLimitConstraint(),
      new EligibilityConstraint(),
      new MinimumCoverageConstraint(),
      new DistinctResourcesConstraint(),
      new MaxConsecutiveWorkDaysConstraint(6),
    ],
    softConstraints: [
      new PrimaryContinuityPreference(),
      new PreferredOffDayPreference(),
      new WorkloadEquityPreference(),
      new GroupAffinityPreference(),
    ],
  });

  it('1. Generates pristine baseline roster with 100% coverage and zero blockers', () => {
    const rawData = generateSeedData();
    // Start with a clean baseline where all 30 employees are available initially
    rawData.leaves = [];
    const problem = toSchedulingProblem(rawData, { year: 2026, month: 11 });

    const startTime = performance.now();
    const solution = scheduler.generate(problem);
    const elapsed = performance.now() - startTime;

    expect(elapsed).toBeLessThan(5000); // Meets our strict 5-second solver budget
    expect(solution.status).toBe('FEASIBLE');
    expect(solution.metrics.coverageRate).toBe(1.0);
    expect(solution.violations.filter((v) => v.severity === 'BLOCKER')).toHaveLength(0);
  });

  it('2. Demonstrates Post-Generation Change: Sole Primary takes emergency leave -> gap flagged -> repair suggested -> gap resolved', () => {
    // Step A: Generate pristine baseline roster
    const rawData = generateSeedData();
    rawData.leaves = []; // No initial leaves
    const baseProblem = toSchedulingProblem(rawData, { year: 2026, month: 11 });
    const baselineSolution = scheduler.generate(baseProblem);

    expect(baselineSolution.status).toBe('FEASIBLE');

    // Pick a date where emp-03 (Comet Footwear sole primary) is actively scheduled to work
    const emp03Allocations = baselineSolution.allocations.filter((a) => a.resourceId === 'emp-03');
    expect(emp03Allocations.length).toBeGreaterThan(0);

    const targetAlloc = emp03Allocations[0];
    const targetDate = targetAlloc.date;
    const targetServiceId = targetAlloc.serviceId;
    const targetSlotId = targetAlloc.slotId;

    // Step B: Post-generation change: Employee 3 calls in sick on targetDate
    const problemWithLeave = {
      ...baseProblem,
      unavailabilities: [
        {
          resourceId: 'emp-03',
          date: targetDate,
          reason: 'SICK_LEAVE' as const,
        },
      ],
    };

    // Step C: Live Revalidation flags the conflict
    const preRepairViolations = scheduler.validate(problemWithLeave, baselineSolution.allocations);
    const leaveViolation = preRepairViolations.find((v) => v.ruleCode === 'H1_UNAVAILABLE_RESOURCE');

    expect(leaveViolation).toBeDefined();
    expect(leaveViolation?.severity).toBe('BLOCKER');
    expect(leaveViolation?.affectedResourceIds).toContain('emp-03');
    expect(leaveViolation?.date).toBe(targetDate);

    // Step D: Manager removes the invalid allocation for emp-03 on targetDate
    const allocationsWithoutEmp03 = baselineSolution.allocations.filter(
      (a) => !(a.resourceId === 'emp-03' && a.date === targetDate)
    );

    // Now revalidation flags H4_MINIMUM_COVERAGE deficit
    const gapViolations = scheduler.validate(problemWithLeave, allocationsWithoutEmp03);
    const coverageGap = gapViolations.find(
      (v) => v.ruleCode === 'H4_MINIMUM_COVERAGE' && v.date === targetDate && v.affectedServiceIds.includes(targetServiceId)
    );
    expect(coverageGap).toBeDefined();

    // Step E: Manager asks engine for candidate replacements for this gap
    const targetSlot = baseProblem.demandSlots.find((s) => s.id === targetSlotId)!;
    const candidates = scheduler.suggestReplacements(problemWithLeave, targetSlot, allocationsWithoutEmp03);

    expect(candidates.length).toBeGreaterThan(0);
    const bestCandidate = candidates[0];
    expect(bestCandidate.rank).toBe(1);
    expect(bestCandidate.reasons.length).toBeGreaterThan(0);

    // Step F: Manager applies the recommended candidate
    const repairAllocation: Allocation = {
      id: `alloc-repair-${bestCandidate.resourceId}-${targetDate}`,
      slotId: targetSlotId,
      serviceId: targetServiceId,
      resourceId: bestCandidate.resourceId,
      date: targetDate,
      capacityConsumed: targetSlot.capacityWeightPerResource,
      isLocked: true, // Pinned manual repair
      source: 'REPAIR_SUGGESTION',
    };

    const finalAllocations = [...allocationsWithoutEmp03, repairAllocation];
    const finalViolations = scheduler.validate(problemWithLeave, finalAllocations);

    // Verify all BLOCKER violations are completely resolved!
    const remainingBlockers = finalViolations.filter((v) => v.severity === 'BLOCKER');
    expect(remainingBlockers).toHaveLength(0);
  });
});
