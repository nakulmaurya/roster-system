/** Exact interval checks. Ambiguous/nonexistent DST wall times fail closed, never guessed. */
import { Allocation, DemandSlot, SchedulingProblem, TrailingContext, Violation, WorkInterval } from './types';

export function trailingEntries(context?: TrailingContext): [string, string[]][] {
  const days = context?.resourceTrailingWorkDays;
  return days instanceof Map ? [...days] : Object.entries(days ?? {});
}
export function trailingDays(context: TrailingContext | undefined, resourceId: string): string[] {
  return context?.resourceTrailingWorkDays instanceof Map
    ? context.resourceTrailingWorkDays.get(resourceId) ?? []
    : context?.resourceTrailingWorkDays[resourceId] ?? [];
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function localStamp(ms: number, timezone: string): number {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    formatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(ms).map(p => [p.type, p.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
}
const cache = new Map<string, WorkInterval>();
function wallToInstant(wall: number, timezone: string): number {
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = wall + hours * 3600000;
    offsets.add(localStamp(sample, timezone) - sample);
  }
  const candidates = [...offsets].map(offset => wall - offset).filter(ms => localStamp(ms, timezone) === wall);
  if (candidates.length !== 1) throw new Error('Shift boundary is ambiguous or nonexistent in its timezone (DST); choose an unambiguous local time.');
  return candidates[0];
}
export function slotInterval(problem: SchedulingProblem, slot: DemandSlot): WorkInterval {
  const shift = slot.shift ?? { startMinute: 0, endMinute: 1440, timezone: problem.horizon.timezone };
  const key = JSON.stringify([slot.date, shift]);
  const existing = cache.get(key);
  if (existing) return { ...existing };
  const midnight = Date.parse(`${slot.date}T00:00:00Z`);
  const startMs = wallToInstant(midnight + shift.startMinute * 60000, shift.timezone);
  const endMinute = shift.endMinute <= shift.startMinute ? shift.endMinute + 1440 : shift.endMinute;
  const endMs = wallToInstant(midnight + endMinute * 60000, shift.timezone);
  if (endMs <= startMs) throw new Error('Shift must have a positive real duration.');
  const interval = { date: slot.date, startMs, endMs };
  if (cache.size > 20000) cache.clear();
  cache.set(key, interval);
  return { ...interval };
}
export function intervalsConflict(a: WorkInterval, b: WorkInterval, restMinutes = 0): boolean {
  return a.startMs < b.endMs + restMinutes * 60000 && b.startMs < a.endMs + restMinutes * 60000;
}
export function candidateShiftAllowed(problem: SchedulingProblem, slot: DemandSlot, resourceId: string, allocations: Allocation[], slotIndex?: ReadonlyMap<string, DemandSlot>): boolean {
  const interval = slotInterval(problem, slot);
  const slots = slotIndex ?? new Map(problem.demandSlots.map(s => [s.id, s]));
  const others = allocations.filter(a => a.resourceId === resourceId).flatMap(a => {
    const other = slots.get(a.slotId);
    return other ? [slotInterval(problem, other)] : [];
  });
  others.push(...(problem.trailingContext?.resourceWorkIntervals?.[resourceId] ?? []));
  return !others.some(other => intervalsConflict(interval, other, problem.minimumRestMinutes));
}

/** Mandatory even when callers omit optional constraint plugins. Audits supplied allocations afresh. */
export function auditShiftIntervals(problem: SchedulingProblem, allocations: Allocation[]): Violation[] {
  const violations: Violation[] = [];
  const slots = new Map(problem.demandSlots.map(s => [s.id, s]));
  const byResource = new Map<string, Array<{ interval: WorkInterval; allocation?: Allocation }>>();
  for (const [resourceId, intervals] of Object.entries(problem.trailingContext?.resourceWorkIntervals ?? {})) {
    byResource.set(resourceId, intervals.map(interval => ({ interval })));
  }
  for (const allocation of allocations) {
    const slot = slots.get(allocation.slotId);
    if (!slot) continue;
    const entries = byResource.get(allocation.resourceId) ?? [];
    entries.push({ allocation, interval: slotInterval(problem, slot) });
    byResource.set(allocation.resourceId, entries);
  }
  for (const [resourceId, entries] of byResource) {
    for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      if (!a.allocation && !b.allocation) continue; // History is context, not this month's repair target.
      if (!intervalsConflict(a.interval, b.interval, problem.minimumRestMinutes)) continue;
      const allocation = b.allocation ?? a.allocation!;
      const overlap = intervalsConflict(a.interval, b.interval);
      violations.push({ id: `H7:${resourceId}:${i}:${j}`, ruleCode: overlap ? 'H7_SHIFT_OVERLAP' : 'H8_MINIMUM_REST', severity: 'BLOCKER',
        date: allocation.date, affectedResourceIds: [resourceId], affectedServiceIds: [a.allocation?.serviceId, b.allocation?.serviceId].filter((s): s is string => !!s),
        message: overlap ? 'Resource has overlapping incompatible shift duties; compatible processes must be one shared demand bundle.' : `Resource has less than the configured ${problem.minimumRestMinutes} minutes between duties (operational policy, not labor-law certification).`,
        suggestedActions: [{ type: 'REMOVE_ALLOCATION', description: 'Remove or reschedule the conflicting duty.' }] });
    }
  }
  return violations;
}

/** Calendar dates actually touched in the planning timezone; an exact midnight end is excluded. */
const workDateCache = new Map<string, string[]>();
export function intervalWorkDates(problem: SchedulingProblem, interval: WorkInterval): string[] {
  const key = `${problem.horizon.timezone}:${interval.startMs}:${interval.endMs}`;
  const cached = workDateCache.get(key);
  if (cached) return [...cached];
  const first = new Date(localStamp(interval.startMs, problem.horizon.timezone)).toISOString().slice(0, 10);
  const last = new Date(localStamp(interval.endMs - 1, problem.horizon.timezone)).toISOString().slice(0, 10);
  const dates: string[] = [];
  for (let ms = Date.parse(first); ms <= Date.parse(last); ms += 86400000) dates.push(new Date(ms).toISOString().slice(0, 10));
  if (workDateCache.size > 20000) workDateCache.clear();
  workDateCache.set(key, dates);
  return [...dates];
}
export function allocationWorkDates(problem: SchedulingProblem, allocation: Allocation): string[] {
  const slot = problem.demandSlots.find(s => s.id === allocation.slotId);
  return slot ? intervalWorkDates(problem, slotInterval(problem, slot)) : [allocation.date];
}
export function shiftUnavailable(problem: SchedulingProblem, slot: DemandSlot, resourceId: string): boolean {
  if (!problem.unavailabilities.some(u => u.resourceId === resourceId)) return false;
  const dates = intervalWorkDates(problem, slotInterval(problem, slot));
  return problem.unavailabilities.some(u => u.resourceId === resourceId && dates.includes(u.date));
}

/** Service/HTTP transport never relies on Map's lossy JSON serialization. */
export function trailingContextToJSON(context?: TrailingContext): { resourceTrailingWorkDays: Record<string, string[]>; resourceWorkIntervals: Record<string, WorkInterval[]> } {
  return structuredClone({ resourceTrailingWorkDays: Object.fromEntries(trailingEntries(context)), resourceWorkIntervals: context?.resourceWorkIntervals ?? {} });
}
