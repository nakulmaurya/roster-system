/** Independent v0.4 assessment QA. No production or existing-test changes. */
import { describe, expect, it } from 'vitest';
import {
  createScheduler, DailyCapacityLimitConstraint, DistinctResourcesConstraint,
  EligibilityConstraint, MinimumCoverageConstraint, UnavailableResourceConstraint,
  MaxConsecutiveWorkDaysConstraint, slotInterval, intervalWorkDates,
  type Allocation, type DemandSlot, type SchedulingProblem,
} from '../index';

function slot(id: string, date: string, startMinute: number, endMinute: number, timezone = 'UTC'): DemandSlot {
  return { id, date, serviceId: 'service', minResourceCount: 1, capacityWeightPerResource: 0.5,
    priority: 1, shift: { startMinute, endMinute, timezone } };
}
function problem(slots: DemandSlot[]): SchedulingProblem {
  return { id: 'independent-assessment-qa', horizon: { startDate: '2026-11-01', endDate: '2026-11-07', timezone: 'UTC' },
    resources: [{ id: 'person', name: 'Person', capabilityIds: ['qualified'], maxDailyCapacity: 1 }],
    services: [{ id: 'service', name: 'Service', requiredCapabilityId: 'qualified', staffingModel: 'MULTI_RESOURCE' }],
    demandSlots: slots, unavailabilities: [], lockedAllocations: [] };
}
function allocation(s: DemandSlot): Allocation {
  return { id: `pin:${s.id}`, slotId: s.id, serviceId: s.serviceId, resourceId: 'person', date: s.date,
    capacityConsumed: s.capacityWeightPerResource, isLocked: true, source: 'MANUAL_EDIT' };
}
function scheduler() {
  return createScheduler({ hardConstraints: [new UnavailableResourceConstraint(), new DailyCapacityLimitConstraint(),
    new EligibilityConstraint(), new MinimumCoverageConstraint(), new DistinctResourcesConstraint(),
    new MaxConsecutiveWorkDaysConstraint(6)], softConstraints: [] });
}

describe('independent assessment QA: incompatible responsibilities', () => {
  it('allows touching endpoints at zero rest, not one minute of overlap', () => {
    const p = problem([slot('morning', '2026-11-02', 480, 720), slot('afternoon', '2026-11-02', 720, 960)]);
    expect(scheduler().generate(p).status).toBe('FEASIBLE');
    p.demandSlots[1].shift!.startMinute = 719;
    const generated = scheduler().generate(p);
    expect(generated.allocations).toHaveLength(1);
    expect(generated.status).toBe('PARTIAL');
  });
  it.each([59, 60, 61])('enforces minimum rest at the exact %i-minute boundary', gap => {
    const p = problem([slot('first', '2026-11-02', 480, 720), slot('second', '2026-11-02', 720 + gap, 960)]);
    p.minimumRestMinutes = 60;
    expect(scheduler().generate(p).allocations).toHaveLength(gap < 60 ? 1 : 2);
    const violations = scheduler().validate(p, p.demandSlots.map(allocation));
    expect(violations.some(v => v.ruleCode === 'H8_MINIMUM_REST')).toBe(gap < 60);
  });
  it('detects overnight overlap across different allocation dates', () => {
    const p = problem([slot('night', '2026-11-02', 1320, 360), slot('early', '2026-11-03', 300, 540)]);
    expect(scheduler().generate(p).allocations).toHaveLength(1);
    const pins = p.demandSlots.map(allocation);
    p.lockedAllocations = pins;
    const result = scheduler().generate(p);
    expect(result.allocations).toEqual(pins);
    expect(result.status).toBe('INVALID_SCHEDULE');
    expect(result.violations.some(v => v.ruleCode === 'H7_SHIFT_OVERLAP')).toBe(true);
    expect(result.metrics.coverageRate).toBe(0);
  });
  it('compares real instants across different timezones, not local clock labels', () => {
    const p = problem([slot('india', '2026-11-02', 540, 600, 'Asia/Kolkata'), slot('utc', '2026-11-02', 240, 300)]);
    // 09:00–10:00 Kolkata is 03:30–04:30 UTC, overlapping 04:00–05:00 UTC.
    expect(scheduler().generate(p).allocations).toHaveLength(1);
    expect(scheduler().validate(p, p.demandSlots.map(allocation)).some(v => v.ruleCode === 'H7_SHIFT_OVERLAP')).toBe(true);
  });
  it('repair candidates exclude a person whose other duty overlaps', () => {
    const p = problem([slot('one', '2026-11-02', 480, 720), slot('two', '2026-11-02', 660, 900)]);
    expect(scheduler().suggestReplacements(p, p.demandSlots[1], [allocation(p.demandSlots[0])])).toEqual([]);
    p.demandSlots[1].shift!.startMinute = 720;
    expect(scheduler().suggestReplacements(p, p.demandSlots[1], [allocation(p.demandSlots[0])]).map(r => r.resourceId)).toEqual(['person']);
  });
  it('independent validation enforces overlap even without optional constraint plugins', () => {
    const p = problem([slot('one', '2026-11-02', 480, 720), slot('two', '2026-11-02', 660, 900)]);
    const bare = createScheduler({ hardConstraints: [], softConstraints: [] });
    expect(bare.validate(p, p.demandSlots.map(allocation)).some(v => v.ruleCode === 'H7_SHIFT_OVERLAP' && v.severity === 'BLOCKER')).toBe(true);
  });
  it('separately enforces daily capacity for nonoverlapping duties', () => {
    const p = problem([slot('one', '2026-11-02', 0, 480), slot('two', '2026-11-02', 480, 960), slot('three', '2026-11-02', 960, 1440)]);
    expect(scheduler().generate(p).allocations).toHaveLength(2);
    expect(scheduler().validate(p, p.demandSlots.map(allocation)).some(v => v.ruleCode === 'H2_CAPACITY_LIMIT')).toBe(true);
  });
});

describe('independent assessment QA: leave, history and calendar boundaries', () => {
  it.each(['LEAVE', 'SICK_LEAVE', 'COMP_OFF', 'BLOCKED'] as const)('overnight work respects next-day %s', reason => {
    const p = problem([slot('night', '2026-11-02', 1320, 360)]);
    p.unavailabilities = [{ resourceId: 'person', date: '2026-11-03', reason }];
    expect(scheduler().generate(p).allocations).toEqual([]);
    expect(scheduler().validate(p, p.demandSlots.map(allocation)).some(v => v.ruleCode === 'H1_UNAVAILABLE_RESOURCE')).toBe(true);
  });
  it('a shift ending at midnight does not consume the following leave day', () => {
    const p = problem([slot('late', '2026-11-02', 1200, 1440)]);
    p.unavailabilities = [{ resourceId: 'person', date: '2026-11-03', reason: 'LEAVE' }];
    expect(intervalWorkDates(p, slotInterval(p, p.demandSlots[0]))).toEqual(['2026-11-02']);
    expect(scheduler().generate(p).status).toBe('FEASIBLE');
  });
  it('prior-month overnight work blocks an overlapping first-day duty', () => {
    const p = problem([slot('first', '2026-11-01', 300, 600)]);
    p.trailingContext = { resourceTrailingWorkDays: { person: ['2026-10-31'] }, resourceWorkIntervals: {
      person: [{ date: '2026-10-31', startMs: Date.parse('2026-10-31T22:00Z'), endMs: Date.parse('2026-11-01T06:00Z') }],
    } };
    expect(scheduler().generate(p).allocations).toEqual([]);
    expect(scheduler().validate(p, p.demandSlots.map(allocation)).some(v => v.ruleCode === 'H7_SHIFT_OVERLAP')).toBe(true);
  });
  it('JSON-serializable prior-month history retains sixth/seventh-day fatigue enforcement', () => {
    const p = problem([slot('first', '2026-11-01', 480, 960)]);
    p.trailingContext = JSON.parse(JSON.stringify({ resourceTrailingWorkDays: { person: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'] } }));
    expect(scheduler().generate(p).allocations).toEqual([]);
    expect(scheduler().validate(p, p.demandSlots.map(allocation)).some(v => v.ruleCode === 'H6_MAX_CONSECUTIVE_DAYS')).toBe(true);
  });
  it.each([
    ['2026-03-08', 150, 240], // nonexistent 02:30 in spring-forward gap
    ['2026-11-01', 90, 180], // ambiguous 01:30 in fall-back fold
  ])('fails closed for DST boundary %s', (date, start, end) => {
    const p = problem([slot('dst', date, start, end, 'America/New_York')]);
    p.horizon = { startDate: date, endDate: date, timezone: 'America/New_York' };
    expect(scheduler().generate(p).status).toBe('INVALID_CONFIG');
  });
  it('uses a 25-hour real full day across fall-back rather than assuming 24 hours', () => {
    const p = problem([slot('fall', '2026-11-01', 0, 1440, 'America/New_York')]);
    const interval = slotInterval(p, p.demandSlots[0]);
    expect(interval.endMs - interval.startMs).toBe(25 * 3600000);
  });
  it('interval helper callers cannot poison a later authoritative interval audit', () => {
    const p = problem([slot('cache-ownership', '2026-11-06', 491, 731)]);
    const expected = structuredClone(slotInterval(p, p.demandSlots[0]));
    try { slotInterval(p, p.demandSlots[0]).endMs = 0; } catch { /* frozen output is also safe */ }
    expect(slotInterval(p, p.demandSlots[0])).toEqual(expected);
  });
  it('generation and audit do not mutate caller-owned slots, intervals or pins', () => {
    const p = problem([slot('one', '2026-11-02', 480, 720)]);
    p.lockedAllocations = p.demandSlots.map(allocation);
    const before = structuredClone(p);
    scheduler().generate(p); scheduler().validate(p, p.lockedAllocations);
    expect(p).toEqual(before);
  });
});
