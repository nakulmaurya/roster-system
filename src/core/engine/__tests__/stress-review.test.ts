import { describe, it, expect, vi } from 'vitest';
import {
  createScheduler, DailyCapacityLimitConstraint, DistinctResourcesConstraint,
  EligibilityConstraint, MinimumCoverageConstraint, UnavailableResourceConstraint,
  MaxConsecutiveWorkDaysConstraint, generateDateSequence,
  type Allocation, type SchedulingProblem,
} from '../index';

const rules = (maxDays = 6) => [new UnavailableResourceConstraint(), new DailyCapacityLimitConstraint(),
  new EligibilityConstraint(), new MinimumCoverageConstraint(), new DistinctResourcesConstraint(),
  new MaxConsecutiveWorkDaysConstraint(maxDays)];
const scheduler = (maxDays = 6) => createScheduler({ hardConstraints: rules(maxDays), softConstraints: [] });
function fixture(): SchedulingProblem {
  return { id: 'stress', horizon: { startDate: '2026-11-01', endDate: '2026-11-07', timezone: 'UTC' },
    resources: [{ id: 'r', name: 'R', capabilityIds: ['c'], maxDailyCapacity: 1 }],
    services: [{ id: 's', name: 'S', requiredCapabilityId: 'c', staffingModel: 'MULTI_RESOURCE' }],
    demandSlots: [{ id: 'slot', serviceId: 's', date: '2026-11-01', minResourceCount: 1, capacityWeightPerResource: 1, priority: 1 }],
    unavailabilities: [], lockedAllocations: [] };
}
function alloc(overrides: Partial<Allocation> = {}): Allocation {
  return { id: 'pin', slotId: 'slot', serviceId: 's', resourceId: 'r', date: '2026-11-01',
    capacityConsumed: 1, isLocked: true, source: 'MANUAL_EDIT', ...overrides };
}
function datedSlots(p: SchedulingProblem, dates: string[], weight = 1) {
  p.demandSlots = dates.map(date => ({ ...p.demandSlots[0], id: `s:${date}`, date, capacityWeightPerResource: weight }));
}

describe('stress review: configuration, locks and allocation integrity', () => {
  it.each([
    ['duplicate slot', (p: SchedulingProblem) => p.demandSlots.push({ ...p.demandSlots[0] })],
    ['empty resource ID', (p: SchedulingProblem) => { p.resources[0].id = ''; }],
    ['infinite weight', (p: SchedulingProblem) => { p.demandSlots[0].capacityWeightPerResource = Infinity; }],
    ['zero staff', (p: SchedulingProblem) => { p.demandSlots[0].minResourceCount = 0; }],
    ['unknown leave resource', (p: SchedulingProblem) => p.unavailabilities.push({ resourceId: 'ghost', date: '2026-11-01', reason: 'LEAVE' })],
    ['future history', (p: SchedulingProblem) => { p.trailingContext = { resourceTrailingWorkDays: new Map([['r', ['2026-11-01']]]) }; }],
    ['long horizon', (p: SchedulingProblem) => { p.horizon.endDate = '2040-01-01'; }],
  ])('rejects %s', (_, mutate) => {
    const p = fixture(); mutate(p); expect(scheduler().generate(p).status).toBe('INVALID_CONFIG');
  });
  it.each([{ resourceId: 'ghost' }, { slotId: 'ghost' }, { serviceId: 'ghost' },
    { date: '2026-11-02' }, { capacityConsumed: NaN }, { capacityConsumed: -2 }])('preserves and blocks invalid pin %j', overrides => {
    const p = fixture(); p.lockedAllocations = [alloc(overrides)];
    const result = scheduler().generate(p);
    expect(result.status).toBe('INVALID_SCHEDULE'); expect(result.allocations).toContainEqual(p.lockedAllocations[0]);
    expect(result.violations.some(v => v.ruleCode === 'H0_INTEGRITY')).toBe(true);
  });
  it('blocks duplicate allocation IDs', () => {
    const p = fixture(); p.lockedAllocations = [alloc(), alloc()];
    expect(scheduler().generate(p).violations.some(v => v.ruleCode === 'H0_INTEGRITY')).toBe(true);
  });
  it.each([-1, Infinity, NaN])('rejects invalid timeout %s', timeoutMs => {
    expect(() => scheduler().generate(fixture(), { timeoutMs })).toThrow();
  });
});

describe('stress review: capacity, distinct staffing and leave', () => {
  it('allows exactly full fractional capacity but not a third half duty', () => {
    const p = fixture(); p.demandSlots = [0, 1, 2].map(i => ({ ...p.demandSlots[0], id: `slot${i}`, capacityWeightPerResource: 0.5, shift: { startMinute: i * 480, endMinute: (i + 1) * 480, timezone: 'UTC' } }));
    const result = scheduler().generate(p);
    expect(result.allocations).toHaveLength(2); expect(result.status).toBe('PARTIAL');
    expect(result.violations.every(v => v.ruleCode === 'H4_MINIMUM_COVERAGE')).toBe(true);
  });
  it('requires two different people despite spare capacity', () => {
    const p = fixture(); p.resources[0].maxDailyCapacity = 2; p.demandSlots[0].minResourceCount = 2;
    const result = scheduler().generate(p); expect(result.allocations).toHaveLength(1); expect(result.status).toBe('PARTIAL');
    p.resources.push({ ...p.resources[0], id: 'r2' });
    expect(new Set(scheduler().generate(p).allocations.map(a => a.resourceId)).size).toBe(2);
  });
  it.each(['LEAVE', 'SICK_LEAVE', 'COMP_OFF', 'BLOCKED'] as const)('excludes %s and keeps invalid locks visible', reason => {
    const p = fixture(); p.unavailabilities = [{ resourceId: 'r', date: '2026-11-01', reason }];
    expect(scheduler().generate(p).allocations).toHaveLength(0);
    p.lockedAllocations = [alloc()]; const result = scheduler().generate(p);
    expect(result.status).toBe('INVALID_SCHEDULE'); expect(result.metrics.coverageRate).toBe(0);
    expect(result.allocations).toEqual(p.lockedAllocations);
  });
  it('reports overcapacity and zero coverage for overbooked pinned staff', () => {
    const p = fixture(); p.demandSlots.push({ ...p.demandSlots[0], id: 'other' });
    p.lockedAllocations = [alloc(), alloc({ id: 'pin2', slotId: 'other' })];
    const result = scheduler().generate(p); expect(result.status).toBe('INVALID_SCHEDULE');
    expect(result.metrics.coverageRate).toBe(0); expect(result.violations.some(v => v.ruleCode === 'H2_CAPACITY_LIMIT')).toBe(true);
  });
});

describe('stress review: fatigue boundaries', () => {
  it('accepts six workdays and leaves seventh uncovered', () => {
    const p = fixture(); datedSlots(p, generateDateSequence('2026-11-01', '2026-11-07'));
    const result = scheduler().generate(p); expect(result.allocations).toHaveLength(6); expect(result.status).toBe('PARTIAL');
  });
  it('rejects bridging past and future work into a seven-day run', () => {
    const p = fixture(); datedSlots(p, generateDateSequence('2026-11-01', '2026-11-07'));
    p.lockedAllocations = p.demandSlots.filter(s => s.date !== '2026-11-04').map(s => alloc({ id: `pin${s.id}`, slotId: s.id, date: s.date }));
    const result = scheduler().generate(p); expect(result.allocations).toHaveLength(6); expect(result.status).toBe('PARTIAL');
  });
  it('counts trailing history, deduplicates dates, and honors a rest gap', () => {
    const p = fixture(); p.trailingContext = { resourceTrailingWorkDays: new Map([['r', [...generateDateSequence('2026-10-26', '2026-10-31'), '2026-10-31']]]) };
    expect(scheduler().generate(p).allocations).toHaveLength(0);
    p.trailingContext = { resourceTrailingWorkDays: new Map([['r', generateDateSequence('2026-10-25', '2026-10-30')]]) };
    expect(scheduler().generate(p).status).toBe('FEASIBLE');
  });
  it('independently audits a seven-day pinned run', () => {
    const p = fixture(); datedSlots(p, generateDateSequence('2026-11-01', '2026-11-07'));
    p.lockedAllocations = p.demandSlots.map(s => alloc({ id: `pin${s.id}`, slotId: s.id, date: s.date }));
    const result = scheduler().generate(p); expect(result.status).toBe('INVALID_SCHEDULE');
    expect(result.violations.find(v => v.ruleCode === 'H6_MAX_CONSECUTIVE_DAYS')?.date).toBe('2026-11-07');
  });
});

describe('stress review: fixed-defect regressions', () => {
  it('F1 rejects NaN fatigue configuration instead of disabling fatigue', () => {
    const p = fixture(); datedSlots(p, generateDateSequence('2026-11-01', '2026-11-07'));
    // Desired: constructor rejects malformed limits (finite positive integer).
    expect(() => scheduler(NaN).generate(p)).toThrow();
  });
  it('F2 preserves colon-containing resource IDs in capacity violation metadata', () => {
    const p = fixture(); p.resources[0].id = 'team:r';
    p.demandSlots.push({ ...p.demandSlots[0], id: 'other' });
    const violations = scheduler().validate(p, [alloc({ resourceId: 'team:r' }), alloc({ id: 'pin2', slotId: 'other', resourceId: 'team:r' })]);
    const capacity = violations.find(v => v.ruleCode === 'H2_CAPACITY_LIMIT');
    expect(capacity?.affectedResourceIds).toEqual(['team:r']); expect(capacity?.date).toBe('2026-11-01');
  });
  it('F3 repair fatigue metric includes trailing history', () => {
    const p = fixture(); p.trailingContext = { resourceTrailingWorkDays: new Map([['r', generateDateSequence('2026-10-27', '2026-10-31')]]) };
    const result = scheduler().suggestReplacements(p, p.demandSlots[0], []);
    expect(result[0].consecutiveWorkDaysOnDate).toBe(6);
  });
  it('F4 repair fatigue metric includes future locked work', () => {
    const p = fixture(); datedSlots(p, generateDateSequence('2026-11-01', '2026-11-04'));
    const future = p.demandSlots.slice(1).map(s => alloc({ id: `pin${s.id}`, slotId: s.id, date: s.date }));
    expect(scheduler().suggestReplacements(p, p.demandSlots[0], future)[0].consecutiveWorkDaysOnDate).toBe(4);
  });
  it.each([NaN, Infinity, -Infinity, 0, -1, 1.5])('F1 rejects malformed fatigue limit %s at construction', maxDays => {
    expect(() => new MaxConsecutiveWorkDaysConstraint(maxDays)).toThrow();
  });
});

describe('stress review: determinism, timeout and larger datasets', () => {
  it('is stable across repeat runs and reversed input ordering, without mutating input', () => {
    const p = fixture(); p.resources.push({ ...p.resources[0], id: 'r2' });
    datedSlots(p, generateDateSequence('2026-11-01', '2026-11-07'));
    const before = structuredClone(p); const first = scheduler().generate(p).allocations;
    expect(scheduler().generate(p).allocations).toEqual(first); expect(p).toEqual(before);
    p.resources.reverse(); p.demandSlots.reverse(); expect(scheduler().generate(p).allocations).toEqual(first);
  });
  it('zero budget stops new work, retains pins, and still audits them', () => {
    const p = fixture(); p.demandSlots.push({ ...p.demandSlots[0], id: 'other' }); p.lockedAllocations = [alloc()];
    const result = scheduler().generate(p, { timeoutMs: 0 });
    expect(result.status).toBe('TIMEOUT_PARTIAL'); expect(result.allocations).toEqual(p.lockedAllocations);
    expect(result.violations.some(v => v.ruleCode === 'H4_MINIMUM_COVERAGE')).toBe(true);
  });
  it('documents that preprocessing runs even after a zero time budget', () => {
    const p = fixture(); const check = vi.fn(() => ({ allowed: true }));
    const result = createScheduler({ hardConstraints: [...rules(), { id: 'probe', name: 'probe', description: 'probe', canAssign: check, validate: () => [] }], softConstraints: [] }).generate(p, { timeoutMs: 0 });
    expect(check).toHaveBeenCalled(); expect(result.metrics.timedOut).toBe(true);
  });
  it.each([30, 60, 120])('benchmarks %i resources and proportionate monthly demand', count => {
    const p = fixture(); p.horizon.endDate = '2026-11-30';
    p.resources = Array.from({ length: count }, (_, i) => ({ ...p.resources[0], id: `r${String(i).padStart(3, '0')}` }));
    p.services = Array.from({ length: count / 3 }, (_, i) => ({ ...p.services[0], id: `s${i}` }));
    p.demandSlots = p.services.flatMap(s => generateDateSequence('2026-11-01', '2026-11-30').map(date => ({ id: `${s.id}:${date}`, serviceId: s.id, date, minResourceCount: 1, capacityWeightPerResource: 1, priority: 1 })));
    const start = performance.now(); const result = scheduler().generate(p, { timeoutMs: 5000 });
    const elapsed = performance.now() - start;
    console.log(`BENCH resources=${count} slots=${p.demandSlots.length} allocations=${result.allocations.length} elapsedMs=${elapsed.toFixed(1)} status=${result.status} timedOut=${result.metrics.timedOut}`);
    expect(result.violations.filter(v => v.ruleCode !== 'H4_MINIMUM_COVERAGE')).toEqual([]);
    expect(new Set(result.allocations.map(a => a.id)).size).toBe(result.allocations.length);
  }, 20000);
});
