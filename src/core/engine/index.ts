/**
 * Core Scheduling Engine - Entry Point
 * 
 * Factory function creating a Scheduler instance using composition.
 */

import {
  Allocation,
  DemandSlot,
  IHardConstraint,
  ISoftConstraint,
  ReplacementCandidate,
  ScheduleSolution,
  SchedulingProblem,
  Violation,
} from './types';
import { solveSchedule, SolverOptions } from './solver';
import { suggestReplacements, evaluateScheduleChange } from './repair-advisor';

export interface Scheduler {
  generate(problem: SchedulingProblem, options?: SolverOptions): ScheduleSolution;
  validate(problem: SchedulingProblem, allocations: Allocation[]): Violation[];
  suggestReplacements(problem: SchedulingProblem, slot: DemandSlot, allocations: Allocation[]): ReplacementCandidate[];
}

export function createScheduler(config: {
  hardConstraints: IHardConstraint[];
  softConstraints: ISoftConstraint[];
}): Scheduler {
  const { hardConstraints, softConstraints } = config;

  return {
    generate(problem: SchedulingProblem, options?: SolverOptions): ScheduleSolution {
      return solveSchedule(problem, hardConstraints, softConstraints, options);
    },

    validate(problem: SchedulingProblem, allocations: Allocation[]): Violation[] {
      return evaluateScheduleChange(problem, allocations, hardConstraints, softConstraints);
    },

    suggestReplacements(
      problem: SchedulingProblem,
      slot: DemandSlot,
      allocations: Allocation[]
    ): ReplacementCandidate[] {
      return suggestReplacements(problem, slot, allocations, hardConstraints);
    },
  };
}

export * from './types';
export * from './calendar-expander';
export * from './demand-expander';
export * from './constraints';
export * from './solver';
export * from './repair-advisor';

export * from './integrity';

export * from './shift-time';
