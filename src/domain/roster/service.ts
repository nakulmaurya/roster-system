/**
 * Enhanced Roster State & Operations Service
 * 
 * Provides complete operational management:
 * - Dynamic Assignments & Pod Lead management without code changes
 * - Calendar overrides & Process staffing management
 * - Full 5 Views Data Transformers (Company, Pod, Brand, Process, Employee)
 * - 1-Click "Auto-Repair All Conflicts"
 * - CSV Export for Excel/Sheets
 * - Before/After Diff Inspector
 * - Real-time validation & publication safeguards
 */

import {
  Allocation,
  OffDay,
  ReplacementCandidate,
  SchedulingProblem,
  Violation,
  TrailingContext,
} from '@/core/engine/types';
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
} from '@/core/engine';
import { generateSeedData, SeedDataset } from './seed-data';
import { toSchedulingProblem, MonthPeriod } from './adapter';
import { coverageMetrics, coverageForSlot, generateDateSequence, isISODate, slotInterval, allocationWorkDates, intervalWorkDates, trailingContextToJSON } from '@/core/engine';
import { datasetSchema, employeeSchema, librarySchema, periodSchema, solverConfigSchema } from './validation';

export interface RosterDiffItem {
  date: string;
  brandName: string;
  processCode: string;
  previousEmployeeName?: string;
  newEmployeeName: string;
  changeType: 'ADDED' | 'MODIFIED' | 'REMOVED' | 'REPAIRED';
  reason: string;
}

export interface SolverCustomConfig {
  maxConsecutiveDays: number; // default 6
  minimumRestMinutes?: number; // default 0; operational policy only
  enforcePodAffinity: boolean; // default true
  honorPreferredOffDay: boolean; // default true
  preferPrimaryContinuity: boolean; // default true
}

export interface PublishedSnapshot {
  trailingContext?: { resourceTrailingWorkDays: Record<string, string[]>; resourceWorkIntervals?: TrailingContext['resourceWorkIntervals'] };
  version: number;
  publishedAt: string;
  period: MonthPeriod;
  dataset: SeedDataset;
  solverConfig: SolverCustomConfig;
  allocations: Allocation[];
}

export interface RosterWorkspaceState {
  publications: PublishedSnapshot[];
  period: MonthPeriod;
  status: 'DRAFT' | 'PUBLISHED';
  version: number;
  publishedAt?: string;
  dataset: SeedDataset;
  problem: SchedulingProblem;
  solverConfig: SolverCustomConfig;
  baselineAllocations: Allocation[]; // For diff comparison
  allocations: Allocation[];
  offDays: OffDay[];
  violations: Violation[];
  coverageRate: number;
  totalSlots: number;
  fulfilledSlots: number;
  lastGeneratedAt?: string;
}

let workspaceStore = new Map<string, RosterWorkspaceState>();
let transactionBaseline: Map<string, RosterWorkspaceState> | undefined;


/** Archives use `<workspace>:YYYY-MM`; the active month wins over its stale archived copy. */
function workspaceRoot(id: string): string { return id.replace(/:\d{4}-\d{2}$/, ''); }
function historyFor(workspaceId: string, dataset: SeedDataset, period: MonthPeriod): ReturnType<typeof trailingContextToJSON> {
  const previous = new Date(Date.UTC(period.year, period.month - 2, 1));
  const year = previous.getUTCFullYear(), month = previous.getUTCMonth() + 1;
  const root = workspaceRoot(workspaceId);
  const active = workspaceStore.get(root);
  const prior = active?.period.year === year && active.period.month === month ? active : workspaceStore.get(`${root}:${year}-${String(month).padStart(2, '0')}`);
  const days: Record<string, string[]> = {};
  const intervals: NonNullable<TrailingContext['resourceWorkIntervals']> = {};
  if (prior) {
    const known = new Set(dataset.employees.map(e => e.id));
    const problem = toSchedulingProblem(prior.dataset, prior.period);
    const startDate = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
    for (const allocation of prior.allocations) {
      if (!known.has(allocation.resourceId)) continue;
      if (allocation.date < problem.horizon.startDate || allocation.date > problem.horizon.endDate) continue;
      const matched = problem.demandSlots.find(s => s.id === allocation.slotId);
      // Removed requirements must not erase recorded work: fall back conservatively to a full day.
      const slot = matched ? { ...matched, date: allocation.date } : {
        id: allocation.slotId, serviceId: allocation.serviceId, date: allocation.date,
        minResourceCount: 1, capacityWeightPerResource: 1, priority: 0,
      };
      // Recorded assignments count conservatively, including invalid/unqualified work.
      const interval = slotInterval(problem, slot);
      (intervals[allocation.resourceId] ??= []).push(interval);
      (days[allocation.resourceId] ??= []).push(...intervalWorkDates(problem, interval).filter(d => d < startDate));
    }
  }
  for (const id of Object.keys(days).sort()) days[id] = [...new Set(days[id])].sort();
  for (const id of Object.keys(intervals)) intervals[id].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  // Stable serialization prevents false dependency changes from assignment ordering.
  return { resourceTrailingWorkDays: Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b))),
    resourceWorkIntervals: Object.fromEntries(Object.entries(intervals).sort(([a], [b]) => a.localeCompare(b))) };
}
function buildProblem(workspaceId: string, dataset: SeedDataset, period: MonthPeriod, locked: Allocation[] = [], config?: SolverCustomConfig): SchedulingProblem {
  const problem = toSchedulingProblem(dataset, period, locked);
  problem.trailingContext = historyFor(workspaceId, dataset, period);
  problem.minimumRestMinutes = config?.minimumRestMinutes ?? 0;
  return problem;
}

/** Every successful command re-audits every stored month; dependent publications return to draft. */
function reconcileHistoryDependencies() {
  for (const [id, state] of workspaceStore) {
    const previous = JSON.stringify(trailingContextToJSON(state.problem.trailingContext));
    state.problem = buildProblem(id, state.dataset, state.period, state.allocations.filter(a => a.isLocked), state.solverConfig);
    const changed = previous !== JSON.stringify(trailingContextToJSON(state.problem.trailingContext));
    refreshValidation(state);
    if (state.status === 'PUBLISHED' && (changed || state.violations.some(v => v.severity === 'BLOCKER'))) {
      state.status = 'DRAFT';
      state.version = Math.max(state.version, ...state.publications.map(p => p.version)) + 1;
    }
  }
}

function authoritativeContent(state: RosterWorkspaceState) {
  return JSON.stringify({ period: state.period, dataset: state.dataset, solverConfig: state.solverConfig, allocations: state.allocations });
}

/** Clone-on-write store boundary: errors cannot partially commit configuration. */
function transaction<T>(action: () => T): T {
  const original = workspaceStore;
  workspaceStore = new Map([...original].map(([id, state]) => [id, structuredClone(state)]));
  transactionBaseline = original;
  try {
    const result = action();
    reconcileHistoryDependencies();
    // Every state we can create must remain shape-valid and export/import compatible.
    const serialized = exportWorkspaceLibrary();
    if (serialized.length > 20_000_000 || workspaceStore.size > 120) throw new Error('Workspace library exceeds the supported backup size. Export/archive a smaller workspace before continuing.');
    librarySchema.parse(JSON.parse(serialized));
    return structuredClone(result);
  } catch (error) {
    workspaceStore = original;
    throw error;
  } finally { transactionBaseline = undefined; }
}

// One explicit commit path: an edit always returns a published roster to draft.
function commitWorkspace(id: string, state: RosterWorkspaceState) {
  const baseline = transactionBaseline?.get(id);
  if (state.status === 'PUBLISHED' && (!baseline || authoritativeContent(baseline) !== authoritativeContent(state))) {
    state.status = 'DRAFT';
    state.version = Math.max(state.version, ...state.publications.map(snapshot => snapshot.version)) + 1;
  }
  workspaceStore.set(id, state);
}

function refreshValidation(state: RosterWorkspaceState) {
  const scheduler = getSchedulerInstance(state.solverConfig);
  state.violations = scheduler.validate(state.problem, state.allocations);
  Object.assign(state, coverageMetrics(state.problem, state.allocations));
  const dates = generateDateSequence(state.problem.horizon.startDate, state.problem.horizon.endDate);
  state.offDays = state.problem.resources.flatMap(r => dates
    .filter(date => !state.allocations.some(a => a.resourceId === r.id && allocationWorkDates(state.problem, a).includes(date)) && !(state.problem.trailingContext?.resourceWorkIntervals?.[r.id] ?? []).some(i => intervalWorkDates(state.problem, i).includes(date)))
    .map(date => {
      const unavailable = state.problem.unavailabilities.find(u => u.resourceId === r.id && u.date === date);
      return { resourceId: r.id, date,
        reason: (unavailable ? unavailable.reason === 'COMP_OFF' ? 'COMP_OFF' : 'LEAVE' : 'WEEKLY_OFF') as OffDay['reason'],
        isPreferredDay: new Date(`${date}T00:00:00Z`).getUTCDay() === r.preferredOffDay };
    }));
}

function requireEmployee(state: RosterWorkspaceState, employeeId: string) {
  if (!state.dataset.employees.some(e => e.id === employeeId)) throw new Error('Unknown employee.');
}


export function getSchedulerInstance(config: SolverCustomConfig = {
  maxConsecutiveDays: 6,
  enforcePodAffinity: true,
  honorPreferredOffDay: true,
  preferPrimaryContinuity: true,
}) {
  const softConstraints = [];
  if (config.preferPrimaryContinuity) softConstraints.push(new PrimaryContinuityPreference());
  if (config.honorPreferredOffDay) softConstraints.push(new PreferredOffDayPreference());
  softConstraints.push(new WorkloadEquityPreference());
  if (config.enforcePodAffinity) softConstraints.push(new GroupAffinityPreference());

  const scheduler = createScheduler({
    hardConstraints: [
      new UnavailableResourceConstraint(),
      new DailyCapacityLimitConstraint(),
      new EligibilityConstraint(),
      new MinimumCoverageConstraint(),
      new DistinctResourcesConstraint(),
      new MaxConsecutiveWorkDaysConstraint(config.maxConsecutiveDays),
    ],
    softConstraints,
  });
  const withPolicy = (problem: SchedulingProblem): SchedulingProblem => ({ ...problem,
    minimumRestMinutes: config.minimumRestMinutes ?? problem.minimumRestMinutes ?? 0 });
  return {
    generate: (problem: SchedulingProblem, options?: Parameters<typeof scheduler.generate>[1]) => scheduler.generate(withPolicy(problem), options),
    validate: (problem: SchedulingProblem, allocations: Allocation[]) => scheduler.validate(withPolicy(problem), allocations),
    suggestReplacements: (problem: SchedulingProblem, slot: Parameters<typeof scheduler.suggestReplacements>[1], allocations: Allocation[]) => scheduler.suggestReplacements(withPolicy(problem), slot, allocations),
  };
}

function getMutableWorkspace(
  workspaceId = 'default',
  period: MonthPeriod = { year: 2026, month: 11 }
): RosterWorkspaceState {
  period = periodSchema.parse(period);
  if (typeof workspaceId !== 'string' || !workspaceId.trim() || workspaceId.length > 200) throw new Error('A workspace ID between 1 and 200 characters is required.');
  if (workspaceStore.has(workspaceId)) {
    return workspaceStore.get(workspaceId)!;
  }

  const solverConfig: SolverCustomConfig = {
    maxConsecutiveDays: 6,
    enforcePodAffinity: true,
    honorPreferredOffDay: true,
    preferPrimaryContinuity: true,
  };

  const dataset = generateSeedData();
  const problem = buildProblem(workspaceId, dataset, period, [], solverConfig);
  const scheduler = getSchedulerInstance(solverConfig);
  const solution = scheduler.generate(problem);

  const state: RosterWorkspaceState = {
    publications: [],
    period,
    status: 'DRAFT',
    version: 1,
    dataset,
    problem,
    solverConfig,
    baselineAllocations: structuredClone(solution.allocations),
    allocations: solution.allocations,
    offDays: solution.offDays,
    violations: solution.violations,
    coverageRate: solution.metrics.coverageRate,
    totalSlots: solution.metrics.totalDemandSlots,
    fulfilledSlots: solution.metrics.fulfilledSlots,
    lastGeneratedAt: new Date().toISOString(),
  };

  commitWorkspace(workspaceId, state);
  return state;
}

function updateSolverCustomConfigInternal(
  workspaceId: string,
  newConfig: Partial<SolverCustomConfig>
): RosterWorkspaceState {
  const state = getMutableWorkspace(workspaceId);
  state.solverConfig = solverConfigSchema.parse({ ...state.solverConfig, ...newConfig });
  
  // Re-generate schedule with updated rules
  const scheduler = getSchedulerInstance(state.solverConfig);
  const lockedAllocs = state.allocations.filter((a) => a.isLocked);
  const problem = buildProblem(workspaceId, state.dataset, state.period, lockedAllocs, state.solverConfig);
  const solution = scheduler.generate(problem);

  state.problem = problem;
  state.allocations = solution.allocations;
  state.offDays = solution.offDays;
  state.violations = solution.violations;
  state.coverageRate = solution.metrics.coverageRate;
  state.totalSlots = solution.metrics.totalDemandSlots;
  state.fulfilledSlots = solution.metrics.fulfilledSlots;

  commitWorkspace(workspaceId, state);
  return state;
}

function addCustomEmployeeInternal(
  workspaceId: string,
  employee: {
    name: string;
    email: string;
    podId: string;
    preferredOffDay: number;
    maxDailyCapacity?: number;
  }
): RosterWorkspaceState {
  const state = getMutableWorkspace(workspaceId);
  const newId = `emp-custom-${crypto.randomUUID()}`;
  const parsed = employeeSchema.parse({ ...employee, id: newId, maxDailyCapacity: employee.maxDailyCapacity ?? 1 });
  if (!state.dataset.pods.some(p => p.id === parsed.podId)) throw new Error('Unknown pod.');

  state.dataset.employees.push(parsed);

  // New resources start with no eligibility. Managers explicitly authorize services.

  // Refresh problem definition and regenerate
  return generateWorkspaceRosterInternal(workspaceId);
}

function addCustomBrandInternal(
  workspaceId: string,
  brand: {
    name: string;
    podId: string;
    staffingModel: 'SINGLE' | 'MULTI';
    calendarId: string;
    minStaffing?: number;
  }
): RosterWorkspaceState {
  const state = getMutableWorkspace(workspaceId);
  if (!brand.name.trim() || !state.dataset.pods.some(p => p.id === brand.podId) ||
      !state.dataset.calendars.some(c => c.id === brand.calendarId)) throw new Error('Valid brand name, pod and calendar are required.');
  if (brand.minStaffing !== undefined && (!Number.isInteger(brand.minStaffing) || brand.minStaffing < 1)) throw new Error('Staffing must be a positive integer.');
  const newBrandId = `brand-cust-${crypto.randomUUID()}`;
  const newBpId = `bp-${newBrandId}-bundle`;

  state.dataset.brands.push({
    id: newBrandId,
    name: brand.name,
    podId: brand.podId,
    staffingModel: brand.staffingModel,
  });

  state.dataset.brandProcesses.push({
    id: newBpId,
    brandId: newBrandId,
    processId: 'proc-cs',
    calendarId: brand.calendarId,
    minStaffing: brand.minStaffing ?? 1,
    capacityWeight: 1.0,
  });

  // No implicit authorization: configure assignments explicitly.

  return generateWorkspaceRosterInternal(workspaceId);
}

function generateWorkspaceRosterInternal(workspaceId = 'default'): RosterWorkspaceState {
  const state = getMutableWorkspace(workspaceId);
  const scheduler = getSchedulerInstance(state.solverConfig);

  const lockedAllocs = state.allocations.filter((a) => a.isLocked);
  const problem = buildProblem(workspaceId, state.dataset, state.period, lockedAllocs, state.solverConfig);
  const solution = scheduler.generate(problem);

  state.problem = problem;
  state.allocations = solution.allocations;
  state.offDays = solution.offDays;
  state.violations = solution.violations;
  state.coverageRate = solution.metrics.coverageRate;
  state.totalSlots = solution.metrics.totalDemandSlots;
  state.fulfilledSlots = solution.metrics.fulfilledSlots;
  state.lastGeneratedAt = new Date().toISOString();

  commitWorkspace(workspaceId, state);
  return state;
}

function updateCellAllocationInternal(
  workspaceId: string,
  slotId: string,
  employeeId: string,
  lock = true
): RosterWorkspaceState {
  const state = getMutableWorkspace(workspaceId);
  const scheduler = getSchedulerInstance(state.solverConfig);

  const slot = state.problem.demandSlots.find((s) => s.id === slotId);
  if (!slot) throw new Error('Unknown demand slot.');
  requireEmployee(state, employeeId);

  const isMulti = slot.minResourceCount > 1;
  let nextAllocs = state.allocations;

  if (!isMulti) {
    nextAllocs = nextAllocs.filter((a) => a.slotId !== slotId);
  } else {
    nextAllocs = nextAllocs.filter((a) => !(a.slotId === slotId && a.resourceId === employeeId));
  }

  const newAlloc: Allocation = {
    id: `manual:${slotId}:${employeeId}:${crypto.randomUUID()}`,
    slotId,
    serviceId: slot.serviceId,
    resourceId: employeeId,
    date: slot.date,
    capacityConsumed: slot.capacityWeightPerResource,
    isLocked: lock,
    source: 'MANUAL_EDIT',
  };

  nextAllocs = [...nextAllocs, newAlloc];
  state.allocations = nextAllocs;

  const violations = scheduler.validate(state.problem, nextAllocs);
  state.violations = violations;

  refreshValidation(state);

  commitWorkspace(workspaceId, state);
  return state;
}

function removeAllocationInternal(workspaceId: string, allocationId: string): RosterWorkspaceState {
  const state = getMutableWorkspace(workspaceId);
  const scheduler = getSchedulerInstance(state.solverConfig);

  state.allocations = state.allocations.filter((a) => a.id !== allocationId);

  const violations = scheduler.validate(state.problem, state.allocations);
  state.violations = violations;

  refreshValidation(state);

  commitWorkspace(workspaceId, state);
  return state;
}

function toggleCellLockInternal(workspaceId: string, allocationId: string): RosterWorkspaceState {
  const state = getMutableWorkspace(workspaceId);
  const alloc = state.allocations.find((a) => a.id === allocationId);
  if (alloc) {
    alloc.isLocked = !alloc.isLocked;
  }
  commitWorkspace(workspaceId, state);
  return state;
}

function addEmployeeLeaveInternal(
  workspaceId: string,
  employeeId: string,
  date: string,
  leaveType: 'PLANNED' | 'SICK' | 'COMP_OFF' = 'SICK'
): RosterWorkspaceState {
  const state = getMutableWorkspace(workspaceId);

  requireEmployee(state, employeeId);
  if (!isISODate(date) || date < state.problem.horizon.startDate || date > state.problem.horizon.endDate) throw new Error('Leave date must be in the selected month.');
  if (!['PLANNED', 'SICK', 'COMP_OFF'].includes(leaveType)) throw new Error('Invalid leave type.');
  state.dataset.leaves = state.dataset.leaves.filter(l => !(l.employeeId === employeeId && l.leaveDate === date));
  state.dataset.leaves.push({
    id: `leave-${crypto.randomUUID()}`,
    employeeId,
    leaveDate: date,
    leaveType,
    status: 'APPROVED',
  });

  // Remove unavailable unlocked work, but preserve pins as visible conflicts.
  state.allocations = state.allocations.filter(a => !(a.resourceId === employeeId && a.date === date && !a.isLocked));
  state.problem = buildProblem(workspaceId, state.dataset, state.period, state.allocations.filter((a) => a.isLocked), state.solverConfig);
  refreshValidation(state);

  commitWorkspace(workspaceId, state);
  return state;
}

export function getReplacementSuggestions(
  workspaceId: string,
  slotId: string
): ReplacementCandidate[] {
  const state = getMutableWorkspace(workspaceId);
  const scheduler = getSchedulerInstance(state.solverConfig);

  const slot = state.problem.demandSlots.find((s) => s.id === slotId);
  if (!slot) return [];

  return scheduler.suggestReplacements(state.problem, slot, state.allocations);
}

/**
 * 1-Click Autonomous Repair: Iterates through all coverage deficit violations (H4)
 * and assigns the top lexicographically ranked candidate with an immutable lock pin.
 */
function autoRepairAllGapsInternal(workspaceId = 'default'): { repairedCount: number; state: RosterWorkspaceState } {
  const state = getMutableWorkspace(workspaceId);
  const scheduler = getSchedulerInstance(state.solverConfig);

  let repairedCount = 0;
  const currentAllocs = [...state.allocations];
  for (const slot of state.problem.demandSlots) {
    // Do not silently delete invalid or locked work to force a repair.
    while (coverageForSlot(state.problem, slot, currentAllocs) < slot.minResourceCount) {
      const chosen = scheduler.suggestReplacements(state.problem, slot, currentAllocs)[0];
      if (!chosen) break;
      currentAllocs.push({
        id: `repair:${slot.id}:${chosen.resourceId}:${crypto.randomUUID()}`,
        slotId: slot.id, serviceId: slot.serviceId, resourceId: chosen.resourceId,
        date: slot.date, capacityConsumed: slot.capacityWeightPerResource,
        isLocked: true, source: 'REPAIR_SUGGESTION',
      });
      repairedCount++;
    }
  }
  state.allocations = currentAllocs;
  refreshValidation(state);

  commitWorkspace(workspaceId, state);
  return { repairedCount, state };
}

/**
 * Adds or edits an employee assignment dynamically without code changes.
 */
function upsertAssignmentInternal(
  workspaceId: string,
  employeeId: string,
  brandProcessId: string,
  role: 'PRIMARY' | 'BACKUP' | 'RELIEF'
): RosterWorkspaceState {
  const state = getMutableWorkspace(workspaceId);

  requireEmployee(state, employeeId);
  if (!state.dataset.brandProcesses.some(bp => bp.id === brandProcessId)) throw new Error('Unknown service.');
  if (!['PRIMARY', 'BACKUP', 'RELIEF'].includes(role)) throw new Error('Invalid assignment role.');
  const existingIdx = state.dataset.assignments.findIndex(
    (a) => a.employeeId === employeeId && a.brandProcessId === brandProcessId
  );

  if (existingIdx >= 0) {
    state.dataset.assignments[existingIdx].role = role;
    state.dataset.assignments[existingIdx].priorityTier = role === 'PRIMARY' ? 1 : role === 'BACKUP' ? 2 : 3;
  } else {
    state.dataset.assignments.push({
      id: `asgn-dyn-${crypto.randomUUID()}`,
      employeeId,
      brandProcessId,
      role,
      priorityTier: role === 'PRIMARY' ? 1 : role === 'BACKUP' ? 2 : 3,
    });
  }

  // Refresh problem definition and revalidate
  state.problem = buildProblem(workspaceId, state.dataset, state.period, state.allocations.filter((a) => a.isLocked), state.solverConfig);
  refreshValidation(state);

  commitWorkspace(workspaceId, state);
  return state;
}

/**
 * Computes before/after diff items between baseline and current draft.
 */
export function getDiffSummary(workspaceId = 'default'): RosterDiffItem[] {
  const state = getMutableWorkspace(workspaceId);
  const employeeMap = new Map(state.dataset.employees.map((e) => [e.id, e]));
  const bpMap = new Map(state.dataset.brandProcesses.map((bp) => [bp.id, bp]));
  const brandMap = new Map(state.dataset.brands.map((b) => [b.id, b]));
  const procMap = new Map(state.dataset.processes.map((p) => [p.id, p]));

  const diffs: RosterDiffItem[] = [];

  const baseMap = new Map<string, Allocation>();
  for (const a of state.baselineAllocations) {
    baseMap.set(`${a.slotId}:${a.resourceId}`, a);
  }

  const currentMap = new Map<string, Allocation>();
  for (const a of state.allocations) {
    currentMap.set(`${a.slotId}:${a.resourceId}`, a);
  }

  // Added / Repaired
  for (const [key, curr] of currentMap.entries()) {
    if (!baseMap.has(key)) {
      const bp = bpMap.get(curr.serviceId);
      const brand = bp ? brandMap.get(bp.brandId) : undefined;
      const proc = bp ? procMap.get(bp.processId) : undefined;
      const emp = employeeMap.get(curr.resourceId);

      diffs.push({
        date: curr.date,
        brandName: brand?.name ?? curr.serviceId,
        processCode: proc?.code ?? 'CS',
        newEmployeeName: emp?.name ?? curr.resourceId,
        changeType: curr.source === 'REPAIR_SUGGESTION' ? 'REPAIRED' : 'ADDED',
        reason: curr.source === 'REPAIR_SUGGESTION' ? 'Autonomous repair recommendation applied' : 'Manual manager override',
      });
    }
  }

  for (const [key, previous] of baseMap) {
    const current = currentMap.get(key);
    const bp = bpMap.get(previous.serviceId);
    const brand = bp ? brandMap.get(bp.brandId) : undefined;
    const proc = bp ? procMap.get(bp.processId) : undefined;
    const employeeName = employeeMap.get(previous.resourceId)?.name ?? previous.resourceId;
    if (!current || current.isLocked !== previous.isLocked) diffs.push({
      date: previous.date, brandName: brand?.name ?? previous.serviceId,
      processCode: proc?.code ?? '', previousEmployeeName: employeeName,
      newEmployeeName: current ? employeeName : 'Unassigned',
      changeType: current ? 'MODIFIED' : 'REMOVED',
      reason: current ? current.isLocked ? 'Allocation pinned' : 'Allocation unpinned' : 'Allocation removed',
    });
  }
  return diffs;
}

/**
 * Generates formatted CSV string of the monthly roster for export to Excel / Sheets.
 */
/** RFC-style quoting and formula neutralization for untrusted spreadsheet text. */
function csvCell(value: string): string {
  const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportRosterToCsv(workspaceId = 'default'): string {
  const state = getMutableWorkspace(workspaceId);
  const dates = generateDateSequence(state.problem.horizon.startDate, state.problem.horizon.endDate);
  const rows: string[][] = [['Brand Name', 'Pod', 'Staffing Model', 'Process', ...dates]];
  for (const bp of state.dataset.brandProcesses) {
    const brand = state.dataset.brands.find(b => b.id === bp.brandId)!;
    const pod = state.dataset.pods.find(p => p.id === brand.podId)!;
    const process = state.dataset.processes.find(p => p.id === bp.processId)!;
    rows.push([brand.name, pod.name, brand.staffingModel, (bp.coveredProcessIds ?? [process.id]).map(id => state.dataset.processes.find(p => p.id === id)?.code ?? id).join(' + '), ...dates.map(date => {
      const slotId = `${bp.id}:${date}`;
      const slot = state.problem.demandSlots.find(s => s.id === slotId);
      if (!slot) return 'OFF';
      const names = state.allocations.filter(a => a.slotId === slotId).map(a =>
        state.dataset.employees.find(e => e.id === a.resourceId)?.name ?? a.resourceId).join(' + ');
      const count = coverageForSlot(state.problem, slot, state.allocations);
      return `${count < slot.minResourceCount ? `[GAP ${count}/${slot.minResourceCount}] ` : ''}${names}`;
    })]);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

function publishRosterInternal(workspaceId: string): { success: boolean; message: string; state: RosterWorkspaceState } {
  const state = getMutableWorkspace(workspaceId);
  state.solverConfig = solverConfigSchema.parse(state.solverConfig);
  state.problem = buildProblem(workspaceId, state.dataset, state.period, state.allocations.filter(allocation => allocation.isLocked), state.solverConfig);
  refreshValidation(state); // Rebuild from authoritative data, never stale UI/cached configuration.
  const blockers = state.violations.filter((v) => v.severity === 'BLOCKER');

  if (blockers.length > 0) {
    return {
      success: false,
      message: `Publication blocked: ${blockers.length} unresolved blocker violation(s) present. Resolve all coverage gaps and rule breaches first.`,
      state,
    };
  }

  if (state.status === 'PUBLISHED') return { success: true, message: `Version ${state.version} is already published.`, state };
  if (state.publications.length >= 10000) throw new Error('Publication history limit reached. Export this workspace before starting a new library.');
  state.version = Math.max(state.version, ...state.publications.map(snapshot => snapshot.version + 1));
  state.status = 'PUBLISHED';
  state.publishedAt = new Date().toISOString();
  state.publications.push(structuredClone({ version: state.version, publishedAt: state.publishedAt,
    period: state.period, dataset: state.dataset, solverConfig: state.solverConfig, allocations: state.allocations,
    trailingContext: trailingContextToJSON(state.problem.trailingContext) }));
  state.baselineAllocations = structuredClone(state.allocations);
  workspaceStore.set(workspaceId, state);
  return {
    success: true,
    message: `Roster version ${state.version} published as a local demo snapshot.`,
    state,
  };
}

function resetWorkspaceToDemoInternal(workspaceId = 'default'): RosterWorkspaceState {
  const period = workspaceStore.get(workspaceId)?.period;
  workspaceStore.delete(workspaceId);
  return getMutableWorkspace(workspaceId, period);
}


/** Changing months preserves the prior draft in an isolated month workspace. */
function changeWorkspacePeriodInternal(workspaceId: string, period: MonthPeriod): RosterWorkspaceState {
  period = periodSchema.parse(period);
  const current = getMutableWorkspace(workspaceId);
  if (current.period.year === period.year && current.period.month === period.month) return current;
  const periodKey = (p: MonthPeriod) => `${workspaceId}:${p.year}-${String(p.month).padStart(2, '0')}`;
  workspaceStore.set(periodKey(current.period), structuredClone(current));
  const archived = workspaceStore.get(periodKey(period));
  if (archived) {
    workspaceStore.set(workspaceId, structuredClone(archived));
    return workspaceStore.get(workspaceId)!;
  }
  // Start the new period directly from this workspace's catalog, not an expensive unrelated demo solve.
  const next: RosterWorkspaceState = {
    ...structuredClone(current), period, status: 'DRAFT', version: 1, publications: [], publishedAt: undefined,
    allocations: [], baselineAllocations: [], offDays: [], violations: [], coverageRate: 0, totalSlots: 0, fulfilledSlots: 0,
    problem: buildProblem(workspaceId, current.dataset, period, [], current.solverConfig),
  };
  workspaceStore.set(workspaceId, next);
  const generated = generateWorkspaceRosterInternal(workspaceId);
  generated.baselineAllocations = structuredClone(generated.allocations);
  return generated;
}

function removeAssignmentInternal(workspaceId: string, employeeId: string, serviceId: string) {
  const state = getMutableWorkspace(workspaceId);
  state.dataset.assignments = state.dataset.assignments.filter(a => !(a.employeeId === employeeId && a.brandProcessId === serviceId));
  state.problem = buildProblem(workspaceId, state.dataset, state.period, state.allocations.filter(a => a.isLocked), state.solverConfig);
  refreshValidation(state);
  commitWorkspace(workspaceId, state);
  return state;
}

function removeEmployeeLeaveInternal(workspaceId: string, leaveId: string) {
  const state = getMutableWorkspace(workspaceId);
  state.dataset.leaves = state.dataset.leaves.filter(l => l.id !== leaveId);
  state.problem = buildProblem(workspaceId, state.dataset, state.period, state.allocations.filter(a => a.isLocked), state.solverConfig);
  refreshValidation(state);
  commitWorkspace(workspaceId, state);
  return state;
}

function updateServiceRequirementInternal(workspaceId: string, serviceId: string, update: Partial<SeedDataset['brandProcesses'][number]>) {
  const state = getMutableWorkspace(workspaceId);
  if (!state.dataset.brandProcesses.some(bp => bp.id === serviceId)) throw new Error('Unknown service.');
  const dataset = structuredClone(state.dataset);
  dataset.brandProcesses = dataset.brandProcesses.map(bp => bp.id === serviceId ? { ...bp, ...update, id: bp.id, brandId: bp.brandId, processId: bp.processId } : bp);
  state.dataset = datasetSchema.parse(dataset);
  state.problem = buildProblem(workspaceId, state.dataset, state.period, state.allocations.filter(a => a.isLocked), state.solverConfig);
  refreshValidation(state); // Keep allocations; expose invalid pins and changed requirements.
  commitWorkspace(workspaceId, state);
  return state;
}

export function exportWorkspaceLibrary(): string {
  return JSON.stringify({ format: 'datastraw-workspaces', schemaVersion: 1,
    workspaces: Object.fromEntries([...workspaceStore].map(([id, state]) => [id, {
      period: state.period, status: state.status, version: state.version,
      dataset: state.dataset, solverConfig: state.solverConfig, allocations: state.allocations,
      baselineAllocations: state.baselineAllocations, publications: state.publications,
      publishedAt: state.publishedAt, lastGeneratedAt: state.lastGeneratedAt,
    }])) });
}

/** Atomic restore: validate all records and rebuild derived data before replacing anything. */
function importWorkspaceLibraryInternal(json: string): RosterWorkspaceState {
  if (json.length > 20_000_000) throw new Error('Backup exceeds the 20 MB import limit.');
  const library = librarySchema.parse(JSON.parse(json));
  if (!library.workspaces.default) throw new Error('Backup is missing its active workspace.');
  if (Object.keys(library.workspaces).length > 120) throw new Error('Backup contains too many workspaces.');
  const restored = new Map<string, RosterWorkspaceState>();
  for (const [id, document] of Object.entries(library.workspaces)) {
    restored.set(id, { ...document,
      problem: toSchedulingProblem(document.dataset, document.period, document.allocations.filter(a => a.isLocked)),
      violations: [], offDays: [], totalSlots: 0, fulfilledSlots: 0, coverageRate: 0 });
  }
  workspaceStore = restored;
  for (const [id, state] of restored) {
    state.problem = buildProblem(id, state.dataset, state.period, state.allocations.filter(a => a.isLocked), state.solverConfig);
    refreshValidation(state);
    for (const publication of state.publications) {
      const historicalProblem = buildProblem(id, publication.dataset, publication.period, publication.allocations.filter(a => a.isLocked), publication.solverConfig);
      // A snapshot pins the history used when it was published. Legacy snapshots are audited against available archived history.
      if (publication.trailingContext) historicalProblem.trailingContext = publication.trailingContext;
      const audit = getSchedulerInstance(publication.solverConfig).validate(historicalProblem, publication.allocations);
      if (audit.some(v => v.severity === 'BLOCKER')) throw new Error(`Publication version ${publication.version} contains invalid historical allocations.`);
    }
    const snapshot = state.publications.find(p => p.version === state.version);
    if (state.status === 'PUBLISHED' && (!snapshot || state.publishedAt !== snapshot.publishedAt || state.violations.some(v => v.severity === 'BLOCKER') ||
      JSON.stringify(snapshot.allocations) !== JSON.stringify(state.allocations) ||
      JSON.stringify(snapshot.dataset) !== JSON.stringify(state.dataset) ||
      JSON.stringify(snapshot.period) !== JSON.stringify(state.period) ||
      JSON.stringify(snapshot.solverConfig) !== JSON.stringify(state.solverConfig) ||
      (snapshot.trailingContext && JSON.stringify(snapshot.trailingContext) !== JSON.stringify(trailingContextToJSON(state.problem.trailingContext))))) state.status = 'DRAFT';
    const latestVersion = Math.max(0, ...state.publications.map(p => p.version));
    if (state.status === 'DRAFT' && state.version <= latestVersion) state.version = latestVersion + 1;
  }
  return workspaceStore.get('default')!;
}

function updateHolidayInternal(workspaceId: string, date: string, name?: string) {
  if (!isISODate(date) || (name !== undefined && !name.trim())) throw new Error('A valid date and holiday name are required.');
  const state = getMutableWorkspace(workspaceId);
  state.dataset.publicHolidays = state.dataset.publicHolidays.filter(h => h.holidayDate !== date);
  if (name !== undefined) state.dataset.publicHolidays.push({ id: `holiday-${crypto.randomUUID()}`, holidayDate: date, name: name.trim() });
  state.problem = buildProblem(workspaceId, state.dataset, state.period, state.allocations.filter(a => a.isLocked), state.solverConfig);
  refreshValidation(state);
  commitWorkspace(workspaceId, state);
  return state;
}

function addProcessToBrandInternal(workspaceId: string, input: {
  brandId: string; processId: string; calendarId: string; minStaffing: number; capacityWeight: number; shift?: SeedDataset['brandProcesses'][number]['shift'];
}) {
  const state = getMutableWorkspace(workspaceId);
  if (state.dataset.brandProcesses.some(bp => bp.brandId === input.brandId && (bp.coveredProcessIds ?? [bp.processId]).includes(input.processId))) throw new Error('This brand already covers that process. Remove it from its existing work bundle before adding a separate requirement.');
  const dataset = structuredClone(state.dataset);
  dataset.brandProcesses.push({ ...input, id: `service-${crypto.randomUUID()}` });
  state.dataset = datasetSchema.parse(dataset);
  state.problem = buildProblem(workspaceId, state.dataset, state.period, state.allocations.filter(a => a.isLocked), state.solverConfig);
  refreshValidation(state);
  commitWorkspace(workspaceId, state);
  return state;
}


/** Public service reads and command results are detached snapshots, never store-owned references. */
export function getOrCreateWorkspace(workspaceId = 'default', period?: MonthPeriod): RosterWorkspaceState {
  if (!workspaceStore.has(workspaceId)) return transaction(() => getMutableWorkspace(workspaceId, period));
  return structuredClone(getMutableWorkspace(workspaceId, period));
}
export function updateSolverCustomConfig(...args: Parameters<typeof updateSolverCustomConfigInternal>): ReturnType<typeof updateSolverCustomConfigInternal> {
  return transaction(() => updateSolverCustomConfigInternal(...args));
}
export function addCustomEmployee(...args: Parameters<typeof addCustomEmployeeInternal>): ReturnType<typeof addCustomEmployeeInternal> {
  return transaction(() => addCustomEmployeeInternal(...args));
}
export function addCustomBrand(...args: Parameters<typeof addCustomBrandInternal>): ReturnType<typeof addCustomBrandInternal> {
  return transaction(() => addCustomBrandInternal(...args));
}
export function generateWorkspaceRoster(...args: Parameters<typeof generateWorkspaceRosterInternal>): ReturnType<typeof generateWorkspaceRosterInternal> {
  return transaction(() => generateWorkspaceRosterInternal(...args));
}
export function updateCellAllocation(...args: Parameters<typeof updateCellAllocationInternal>): ReturnType<typeof updateCellAllocationInternal> {
  return transaction(() => updateCellAllocationInternal(...args));
}
export function removeAllocation(...args: Parameters<typeof removeAllocationInternal>): ReturnType<typeof removeAllocationInternal> {
  return transaction(() => removeAllocationInternal(...args));
}
export function toggleCellLock(...args: Parameters<typeof toggleCellLockInternal>): ReturnType<typeof toggleCellLockInternal> {
  return transaction(() => toggleCellLockInternal(...args));
}
export function addEmployeeLeave(...args: Parameters<typeof addEmployeeLeaveInternal>): ReturnType<typeof addEmployeeLeaveInternal> {
  return transaction(() => addEmployeeLeaveInternal(...args));
}
export function autoRepairAllGaps(...args: Parameters<typeof autoRepairAllGapsInternal>): ReturnType<typeof autoRepairAllGapsInternal> {
  return transaction(() => autoRepairAllGapsInternal(...args));
}
export function upsertAssignment(...args: Parameters<typeof upsertAssignmentInternal>): ReturnType<typeof upsertAssignmentInternal> {
  return transaction(() => upsertAssignmentInternal(...args));
}
export function publishRoster(...args: Parameters<typeof publishRosterInternal>): ReturnType<typeof publishRosterInternal> {
  return transaction(() => publishRosterInternal(...args));
}
export function resetWorkspaceToDemo(...args: Parameters<typeof resetWorkspaceToDemoInternal>): ReturnType<typeof resetWorkspaceToDemoInternal> {
  return transaction(() => resetWorkspaceToDemoInternal(...args));
}
export function changeWorkspacePeriod(...args: Parameters<typeof changeWorkspacePeriodInternal>): ReturnType<typeof changeWorkspacePeriodInternal> {
  return transaction(() => changeWorkspacePeriodInternal(...args));
}
export function removeAssignment(...args: Parameters<typeof removeAssignmentInternal>): ReturnType<typeof removeAssignmentInternal> {
  return transaction(() => removeAssignmentInternal(...args));
}
export function removeEmployeeLeave(...args: Parameters<typeof removeEmployeeLeaveInternal>): ReturnType<typeof removeEmployeeLeaveInternal> {
  return transaction(() => removeEmployeeLeaveInternal(...args));
}
export function updateServiceRequirement(...args: Parameters<typeof updateServiceRequirementInternal>): ReturnType<typeof updateServiceRequirementInternal> {
  return transaction(() => updateServiceRequirementInternal(...args));
}
export function importWorkspaceLibrary(...args: Parameters<typeof importWorkspaceLibraryInternal>): ReturnType<typeof importWorkspaceLibraryInternal> {
  return transaction(() => importWorkspaceLibraryInternal(...args));
}
export function updateHoliday(...args: Parameters<typeof updateHolidayInternal>): ReturnType<typeof updateHolidayInternal> {
  return transaction(() => updateHolidayInternal(...args));
}
export function addProcessToBrand(...args: Parameters<typeof addProcessToBrandInternal>): ReturnType<typeof addProcessToBrandInternal> {
  return transaction(() => addProcessToBrandInternal(...args));
}
