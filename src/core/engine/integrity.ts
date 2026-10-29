/** Structural checks are always enforced, independently of optional rule plugins. */
import {
  trailingEntries,
  slotInterval,
  candidateShiftAllowed,
  shiftUnavailable,
} from "./shift-time";
import { Allocation, DemandSlot, SchedulingProblem, Violation } from "./types";

export function isISODate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

function blocker(
  id: string,
  message: string,
  date: string,
  allocation?: Allocation,
): Violation {
  return {
    id,
    ruleCode: "H0_INTEGRITY",
    severity: "BLOCKER",
    date,
    affectedResourceIds: allocation ? [allocation.resourceId] : [],
    affectedServiceIds: allocation ? [allocation.serviceId] : [],
    message,
    suggestedActions: [],
  };
}

export function validateConfiguration(problem: SchedulingProblem): Violation[] {
  const errors: Violation[] = [];
  const date = problem.horizon.startDate;
  const fail = (message: string) =>
    errors.push(blocker(`config:${errors.length}`, message, date));
  if (
    !isISODate(date) ||
    !isISODate(problem.horizon.endDate) ||
    date > problem.horizon.endDate
  ) {
    fail(
      "The planning horizon must contain valid ISO dates in ascending order.",
    );
  } else if (
    (Date.parse(problem.horizon.endDate) - Date.parse(date)) / 86400000 >
    3660
  ) {
    fail("The planning horizon cannot exceed 3661 days.");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: problem.horizon.timezone });
  } catch {
    fail("The planning timezone is not recognized.");
  }
  for (const [label, entries] of [
    ["resource", problem.resources],
    ["service", problem.services],
    ["slot", problem.demandSlots],
  ] as const) {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (!entry.id || ids.has(entry.id))
        fail(`Missing or duplicate ${label} ID: ${entry.id}`);
      ids.add(entry.id);
    }
  }
  const resources = new Set(problem.resources.map((r) => r.id));
  const services = new Set(problem.services.map((s) => s.id));
  for (const r of problem.resources) {
    if (!Number.isFinite(r.maxDailyCapacity) || r.maxDailyCapacity <= 0)
      fail(`Resource ${r.id} must have positive finite capacity.`);
    if (
      r.preferredOffDay !== undefined &&
      (!Number.isInteger(r.preferredOffDay) ||
        r.preferredOffDay < 0 ||
        r.preferredOffDay > 6)
    )
      fail(`Resource ${r.id} has an invalid preferred off-day.`);
  }
  for (const s of problem.services) {
    if (!s.requiredCapabilityId)
      fail(`Service ${s.id} requires a capability ID.`);
  }
  if (
    problem.minimumRestMinutes !== undefined &&
    (!Number.isInteger(problem.minimumRestMinutes) ||
      problem.minimumRestMinutes < 0 ||
      problem.minimumRestMinutes > 10080)
  )
    fail("Minimum rest must be an integer between 0 and 10080 minutes.");
  for (const slot of problem.demandSlots) {
    const shift = slot.shift;
    if (
      shift &&
      (!Number.isInteger(shift.startMinute) ||
        shift.startMinute < 0 ||
        shift.startMinute > 1439 ||
        !Number.isInteger(shift.endMinute) ||
        shift.endMinute < 0 ||
        shift.endMinute > 1440 ||
        !shift.timezone)
    )
      fail(`Slot ${slot.id} has an invalid shift.`);
    else {
      try {
        slotInterval(problem, slot);
      } catch (error) {
        fail(`Slot ${slot.id}: ${String(error)}`);
      }
    }
    if (!services.has(slot.serviceId))
      fail(`Slot ${slot.id} references an unknown service.`);
    if (
      !isISODate(slot.date) ||
      slot.date < date ||
      slot.date > problem.horizon.endDate
    )
      fail(
        `Slot ${slot.id} is outside the planning horizon or has an invalid date.`,
      );
    if (!Number.isInteger(slot.minResourceCount) || slot.minResourceCount < 1)
      fail(
        `Slot ${slot.id} must require a positive integer number of resources.`,
      );
    if (
      !Number.isFinite(slot.capacityWeightPerResource) ||
      slot.capacityWeightPerResource <= 0
    )
      fail(`Slot ${slot.id} must have positive finite workload.`);
    if (!Number.isFinite(slot.priority))
      fail(`Slot ${slot.id} requires a finite priority.`);
  }
  for (const u of problem.unavailabilities) {
    if (!resources.has(u.resourceId) || !isISODate(u.date))
      fail("Unavailability references an unknown resource or an invalid date.");
  }
  for (const [resourceId, dates] of trailingEntries(problem.trailingContext)) {
    if (
      !resources.has(resourceId) ||
      dates.some((d) => !isISODate(d) || d >= date)
    )
      fail(
        "Trailing work context must reference known resources and valid dates before the horizon.",
      );
  }
  for (const [resourceId, intervals] of Object.entries(
    problem.trailingContext?.resourceWorkIntervals ?? {},
  )) {
    if (
      !resources.has(resourceId) ||
      intervals.some(
        (i) =>
          !isISODate(i.date) ||
          i.date >= date ||
          !Number.isFinite(i.startMs) ||
          !Number.isFinite(i.endMs) ||
          i.endMs <= i.startMs ||
          i.endMs - i.startMs > 26 * 3600000,
      )
    )
      fail(
        "Historical intervals require known resources, valid prior dates and positive real durations of at most 26 hours.",
      );
  }
  return errors;
}

export function validateAllocationIntegrity(
  problem: SchedulingProblem,
  allocations: Allocation[],
): Violation[] {
  const resources = new Set(problem.resources.map((r) => r.id));
  const slots = new Map(problem.demandSlots.map((s) => [s.id, s]));
  const ids = new Set<string>();
  const violations: Violation[] = [];
  for (const a of allocations) {
    const slot = slots.get(a.slotId);
    const reasons: string[] = [];
    if (!a.id || ids.has(a.id))
      reasons.push("missing or duplicate allocation ID");
    ids.add(a.id);
    if (!resources.has(a.resourceId)) reasons.push("unknown resource");
    if (!slot) reasons.push("unknown demand slot");
    else {
      if (a.date !== slot.date || a.serviceId !== slot.serviceId)
        reasons.push("date/service does not match the demand slot");
      if (
        !Number.isFinite(a.capacityConsumed) ||
        Math.abs(a.capacityConsumed - slot.capacityWeightPerResource) > 0.000001
      )
        reasons.push("workload does not match the demand slot");
    }
    if (reasons.length)
      violations.push(
        blocker(
          `allocation:${a.id}:${violations.length}`,
          `Invalid allocation ${a.id}: ${reasons.join("; ")}.`,
          a.date,
          a,
        ),
      );
  }
  return violations;
}

/** Per-audit indexes only: no cached mutable schedules, so edits can never reuse stale coverage. */
export function coverageCounts(
  problem: SchedulingProblem,
  allocations: Allocation[],
  targetSlotId?: string,
): Map<string, number> {
  const slots = new Map(problem.demandSlots.map((s) => [s.id, s]));
  const services = new Map(problem.services.map((s) => [s.id, s]));
  const resources = new Map(problem.resources.map((r) => [r.id, r]));
  const byResource = new Map<string, Allocation[]>();
  const capacity = new Map<string, Map<string, number>>();
  for (const a of allocations) {
    const existing = byResource.get(a.resourceId) ?? [];
    existing.push(a);
    byResource.set(a.resourceId, existing);
    const dates = capacity.get(a.resourceId) ?? new Map<string, number>();
    dates.set(a.date, (dates.get(a.date) ?? 0) + a.capacityConsumed);
    capacity.set(a.resourceId, dates);
  }
  const covered = new Map<string, Set<string>>();
  for (const a of allocations) {
    if (targetSlotId !== undefined && a.slotId !== targetSlotId) continue;
    const slot = slots.get(a.slotId);
    if (
      !slot ||
      a.date !== slot.date ||
      a.serviceId !== slot.serviceId ||
      !Number.isFinite(a.capacityConsumed) ||
      Math.abs(a.capacityConsumed - slot.capacityWeightPerResource) > 0.000001
    )
      continue;
    const service = services.get(slot.serviceId),
      resource = resources.get(a.resourceId);
    if (
      !service ||
      !resource?.capabilityIds.includes(service.requiredCapabilityId)
    )
      continue;
    const usage = capacity.get(a.resourceId)?.get(slot.date) ?? 0;
    if (!Number.isFinite(usage) || usage > resource.maxDailyCapacity + 0.001)
      continue;
    if (shiftUnavailable(problem, slot, a.resourceId)) continue;
    // Duplicate rows for the same duty still represent one distinct person, not incompatible different duties.
    // The independent duplicate/allocation audit remains a publication blocker.
    if (
      !candidateShiftAllowed(
        problem,
        slot,
        a.resourceId,
        (byResource.get(a.resourceId) ?? []).filter(
          (other) => other.slotId !== a.slotId,
        ),
        slots,
      )
    )
      continue;
    const set = covered.get(slot.id) ?? new Set<string>();
    set.add(a.resourceId);
    covered.set(slot.id, set);
  }
  return new Map([...covered].map(([slotId, ids]) => [slotId, ids.size]));
}

/** Count only distinct, available, eligible resources with valid capacity and compatible shifts. */
export function coverageForSlot(
  problem: SchedulingProblem,
  slot: DemandSlot,
  allocations: Allocation[],
): number {
  return coverageCounts(problem, allocations, slot.id).get(slot.id) ?? 0;
}

export function coverageMetrics(
  problem: SchedulingProblem,
  allocations: Allocation[],
) {
  const counts = coverageCounts(problem, allocations);
  const totalSlots = problem.demandSlots.length;
  const fulfilledSlots = problem.demandSlots.filter(
    (s) => (counts.get(s.id) ?? 0) >= s.minResourceCount,
  ).length;
  return {
    totalSlots,
    fulfilledSlots,
    coverageRate: totalSlots ? fulfilledSlots / totalSlots : 1,
  };
}
