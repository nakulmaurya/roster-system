/**
 * Core Scheduling Engine - Types & Interfaces
 * 
 * 100% domain-agnostic: Resources, Capabilities, DemandSlots, Allocations, Constraints.
 * Zero dependencies on Next.js, React, or Database clients.
 */

export interface TimeHorizon {
  startDate: string; // ISO format: YYYY-MM-DD
  endDate: string;   // ISO format: YYYY-MM-DD
  timezone: string;
}

export interface Resource {
  id: string;
  name: string;
  capabilityIds: string[];
  maxDailyCapacity: number; // e.g., 1.0 (100% full-time)
  groupId?: string;         // e.g., podId, departmentId
  preferredOffDay?: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  tags?: Record<string, string>;
}

export interface Service {
  id: string;
  name: string;
  requiredCapabilityId: string;
  staffingModel: 'SINGLE_RESOURCE' | 'MULTI_RESOURCE';
  tags?: Record<string, string>;
}

/** Local wall-clock interval; end <= start crosses midnight (equal = 24 hours). */
export interface ShiftInterval {
  startMinute: number; // 0..1439
  endMinute: number; // 0..1440
  timezone: string; // explicit IANA timezone
}

export interface WorkInterval {
  date: string; // local shift start date
  startMs: number; // UTC epoch milliseconds, JSON safe
  endMs: number;
}

export interface DemandSlot {
  shift?: ShiftInterval; // omitted = full local day in horizon timezone
  id: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
  minResourceCount: number; // e.g., 1 or 2
  capacityWeightPerResource: number; // e.g., 1.0 (dedicated full-time) or 0.5 (split)
  priority: number; // Higher value = higher priority (MRV priority boost)
  metadata?: Record<string, unknown>;
}

export interface Unavailability {
  resourceId: string;
  date: string; // YYYY-MM-DD
  reason: 'LEAVE' | 'SICK_LEAVE' | 'COMP_OFF' | 'BLOCKED';
}

export interface Allocation {
  id: string;
  slotId: string;
  serviceId: string;
  resourceId: string;
  date: string; // YYYY-MM-DD
  capacityConsumed: number;
  isLocked: boolean; // Immutable user pin - solver must not move or unassign
  source: 'SYSTEM_SOLVER' | 'MANUAL_EDIT' | 'REPAIR_SUGGESTION';
}

export interface OffDay {
  resourceId: string;
  date: string; // YYYY-MM-DD
  reason: 'WEEKLY_OFF' | 'PUBLIC_HOLIDAY' | 'LEAVE' | 'COMP_OFF';
  isPreferredDay: boolean;
}

export interface TrailingContext {
  /**
   * Last consecutive work days per resource immediately prior to startDate.
   * Key: resourceId, Value: list of recent work dates in chronological order.
   */
  resourceTrailingWorkDays: Map<string, string[]> | Record<string, string[]>;
  resourceWorkIntervals?: Record<string, WorkInterval[]>;
}

export interface SchedulingProblem {
  id: string;
  horizon: TimeHorizon;
  resources: Resource[];
  services: Service[];
  demandSlots: DemandSlot[];
  unavailabilities: Unavailability[];
  lockedAllocations: Allocation[];
  trailingContext?: TrailingContext;
  minimumRestMinutes?: number; // optional operational policy, not labor-law certification
}

export type ViolationSeverity = 'BLOCKER' | 'WARNING';

export interface SuggestedAction {
  type: 'ASSIGN_RESOURCE' | 'REMOVE_ALLOCATION' | 'OVERRIDE_REQUIREMENT' | 'ADD_ELIGIBILITY';
  description: string;
  candidateResourceIds?: string[];
  resourceId?: string;
  serviceId?: string;
  date?: string;
}

export interface Violation {
  id: string;
  ruleCode: string;
  severity: ViolationSeverity;
  date: string;
  affectedResourceIds: string[];
  affectedServiceIds: string[];
  requiredCount?: number;
  actualCount?: number;
  message: string;
  suggestedActions: SuggestedAction[];
}

export interface SolverMetrics {
  totalDemandSlots: number;
  fulfilledSlots: number;
  coverageRate: number; // 0.0 - 1.0
  executionTimeMs: number;
  backtracks: number;
  timedOut: boolean;
}

export type SolverStatus =
  | 'FEASIBLE'           // All mandatory checks passed; no optimality claim
  | 'PARTIAL'            // Requirements remain unresolved; not a proof of infeasibility
  | 'TIMEOUT_PARTIAL'    // Search budget exhausted
  | 'INVALID_CONFIG'     // Malformed input; generation not attempted
  | 'INVALID_SCHEDULE'; // Mandatory violations, including invalid locked allocations

export interface ScheduleSolution {
  status: SolverStatus;
  allocations: Allocation[];
  offDays: OffDay[];
  violations: Violation[];
  metrics: SolverMetrics;
}

export interface ConstraintContext {
  problem: SchedulingProblem;
  currentAllocations: ReadonlyMap<string, Allocation[]>; // Key: resourceId -> allocations
  dateAllocations: ReadonlyMap<string, Allocation[]>;     // Key: date -> allocations
  slotAllocations: ReadonlyMap<string, Allocation[]>;     // Key: slotId -> allocations
  unavailabilityMap: ReadonlyMap<string, Set<string>>;   // Key: resourceId -> Set of unavailable dates
}

export interface IHardConstraint {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  /**
   * Fast check during search: can this resource be assigned to this slot?
   */
  canAssign(
    resource: Resource,
    slot: DemandSlot,
    context: ConstraintContext
  ): { allowed: boolean; reason?: string };

  /**
   * Complete schedule audit: emits all violations.
   */
  validate(
    allocations: Allocation[],
    offDays: OffDay[],
    context: ConstraintContext
  ): Violation[];
}

export interface ISoftConstraint {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  /**
   * Soft preference score: higher score is preferred.
   */
  score(
    resource: Resource,
    slot: DemandSlot,
    context: ConstraintContext
  ): number;

  /**
   * Post-audit warning emissions for broken preferences.
   */
  evaluate(
    allocations: Allocation[],
    offDays: OffDay[],
    context: ConstraintContext
  ): Violation[];
}

export interface ReplacementCandidate {
  resourceId: string;
  rank: number;
  roleTier: 'PRIMARY' | 'BACKUP' | 'RELIEF';
  isSameGroup: boolean;
  consecutiveWorkDaysOnDate: number;
  monthWorkDays: number;
  remainingCapacityOnDate: number;
  reasons: string[];
}
