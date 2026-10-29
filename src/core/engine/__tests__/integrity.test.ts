import { describe, it, expect } from 'vitest';
import {
  Allocation, SchedulingProblem, createScheduler, DailyCapacityLimitConstraint,
  DistinctResourcesConstraint, EligibilityConstraint, MinimumCoverageConstraint,
  UnavailableResourceConstraint, MaxConsecutiveWorkDaysConstraint,
  generateDateSequence, expandOperatingCalendar, coverageForSlot,
} from '../index';

function problem(): SchedulingProblem {
  return {
    id: 'test', horizon: { startDate: '2026-11-01', endDate: '2026-11-02', timezone: 'UTC' },
    resources: [{ id: 'r', name: 'Resource', capabilityIds: ['c'], maxDailyCapacity: 1 }],
    services: [{ id: 's', name: 'Service', requiredCapabilityId: 'c', staffingModel: 'MULTI_RESOURCE' }],
    demandSlots: [{ id: 'slot', serviceId: 's', date: '2026-11-01', minResourceCount: 1, capacityWeightPerResource: 1, priority: 1 }],
    unavailabilities: [], lockedAllocations: [],
  };
}
function allocation(overrides: Partial<Allocation> = {}): Allocation {
  return { id: 'a', resourceId: 'r', slotId: 'slot', serviceId: 's', date: '2026-11-01', capacityConsumed: 1,
    isLocked: true, source: 'MANUAL_EDIT', ...overrides };
}
const scheduler = createScheduler({ hardConstraints: [new DailyCapacityLimitConstraint(), new DistinctResourcesConstraint(),
  new EligibilityConstraint(), new MinimumCoverageConstraint(), new UnavailableResourceConstraint(), new MaxConsecutiveWorkDaysConstraint()], softConstraints: [] });

describe('Engine integrity and honest result statuses', () => {
  it('returns FEASIBLE, never an unsupported optimality claim', () => expect(scheduler.generate(problem()).status).toBe('FEASIBLE'));
  it('does not claim feasibility when an unavailable locked employee occupies the only slot', () => {
    const p = problem(); p.lockedAllocations = [allocation()]; p.unavailabilities = [{ resourceId: 'r', date: '2026-11-01', reason: 'LEAVE' }];
    const result = scheduler.generate(p);
    expect(result.status).toBe('INVALID_SCHEDULE');
    expect(result.allocations).toEqual(p.lockedAllocations);
    expect(result.metrics.coverageRate).toBe(0);
  });
  it.each([
    ['duplicate resources', (p: SchedulingProblem) => p.resources.push(p.resources[0])],
    ['impossible date', (p: SchedulingProblem) => { p.horizon.startDate = '2026-02-30'; }],
    ['inverted horizon', (p: SchedulingProblem) => { p.horizon.endDate = '2026-10-01'; }],
    ['invalid timezone', (p: SchedulingProblem) => { p.horizon.timezone = 'Invalid/Zone'; }],
    ['fractional staff', (p: SchedulingProblem) => { p.demandSlots[0].minResourceCount = 1.5; }],
    ['negative workload', (p: SchedulingProblem) => { p.demandSlots[0].capacityWeightPerResource = -1; }],
    ['unknown service', (p: SchedulingProblem) => { p.demandSlots[0].serviceId = 'ghost'; }],
    ['NaN capacity', (p: SchedulingProblem) => { p.resources[0].maxDailyCapacity = NaN; }],
    ['out-of-horizon slot', (p: SchedulingProblem) => { p.demandSlots[0].date = '2027-01-01'; }],
  ])('rejects malformed configuration: %s', (_, mutate) => {
    const p = problem(); mutate(p);
    const result = scheduler.generate(p);
    expect(result.status).toBe('INVALID_CONFIG'); expect(result.allocations).toEqual([]);
    expect(result.violations.length).toBeGreaterThan(0);
  });
  it.each([
    { resourceId: 'ghost' }, { serviceId: 'ghost' }, { slotId: 'ghost' },
    { date: '2026-11-02' }, { capacityConsumed: 0 }, { capacityConsumed: -1 },
  ])('audits malformed allocation references and workload: %j', overrides => {
    expect(scheduler.validate(problem(), [allocation(overrides)]).some(v => v.ruleCode === 'H0_INTEGRITY')).toBe(true);
  });
  it('does not count duplicate people as two-person coverage', () => {
    const p = problem(); p.demandSlots[0].minResourceCount = 2; p.resources[0].maxDailyCapacity = 2;
    const allocations = [allocation(), allocation({ id: 'a2' })];
    expect(coverageForSlot(p, p.demandSlots[0], allocations)).toBe(1);
    expect(scheduler.validate(p, allocations).some(v => v.ruleCode === 'H4_MINIMUM_COVERAGE')).toBe(true);
  });
  it('returns a time-limited result without claiming infeasibility', () => {
    const result = scheduler.generate(problem(), { timeoutMs: 0 });
    expect(result.status).toBe('TIMEOUT_PARTIAL'); expect(result.metrics.timedOut).toBe(true);
  });
  it('has deterministic allocations for unchanged inputs', () => {
    expect(scheduler.generate(problem()).allocations).toEqual(scheduler.generate(problem()).allocations);
  });
  it('enforces fatigue from previous-month context', () => {
    const p = problem(); p.trailingContext = { resourceTrailingWorkDays: new Map([['r', ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']]]) };
    expect(scheduler.generate(p).allocations).toHaveLength(0);
  });
});

describe('Date and holiday correctness', () => {
  it('includes leap day', () => expect(generateDateSequence('2028-02-01', '2028-02-29')).toHaveLength(29));
  it('rejects impossible or reversed dates rather than silently returning nothing', () => {
    expect(() => generateDateSequence('2026-02-30', '2026-03-01')).toThrow();
    expect(() => generateDateSequence('2026-11-02', '2026-11-01')).toThrow();
  });
  it('honors explicit public-holiday exclusion on an everyday calendar', () => {
    const dates = expandOperatingCalendar({ id: 'c', name: 'daily', baseRule: 'EVERY_DAY', excludePublicHolidays: true },
      { startDate: '2026-11-01', endDate: '2026-11-02' }, ['2026-11-02']);
    expect(dates).toEqual(['2026-11-01']);
  });
});
