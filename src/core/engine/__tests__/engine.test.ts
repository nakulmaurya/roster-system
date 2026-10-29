import { describe, it, expect } from 'vitest';
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
  SchedulingProblem,
  Resource,
  Service,
  DemandSlot,
  Allocation,
} from '../index';

describe('Core Scheduling Engine - Acceptance Tests', () => {
  const defaultHardConstraints = [
    new UnavailableResourceConstraint(),
    new DailyCapacityLimitConstraint(),
    new EligibilityConstraint(),
    new MinimumCoverageConstraint(),
    new DistinctResourcesConstraint(),
    new MaxConsecutiveWorkDaysConstraint(6),
  ];

  const defaultSoftConstraints = [
    new PrimaryContinuityPreference(),
    new PreferredOffDayPreference(),
    new WorkloadEquityPreference(),
    new GroupAffinityPreference(),
  ];

  const scheduler = createScheduler({
    hardConstraints: defaultHardConstraints,
    softConstraints: defaultSoftConstraints,
  });

  it('Scenario 1: Single-resource brand loses coverage when sole primary is on leave', () => {
    const resource: Resource = {
      id: 'emp-1',
      name: 'Alice Sole Primary',
      capabilityIds: ['cap-brand-apex'],
      maxDailyCapacity: 1.0,
      groupId: 'pod-1',
      tags: { 'role:service-apex': 'PRIMARY' },
    };

    const service: Service = {
      id: 'service-apex',
      name: 'Brand Apex',
      requiredCapabilityId: 'cap-brand-apex',
      staffingModel: 'SINGLE_RESOURCE',
    };

    const slots: DemandSlot[] = [
      {
        id: 'service-apex:2026-11-01',
        serviceId: 'service-apex',
        date: '2026-11-01',
        minResourceCount: 1,
        capacityWeightPerResource: 1.0,
        priority: 10,
      },
    ];

    const problem: SchedulingProblem = {
      id: 'prob-1',
      horizon: { startDate: '2026-11-01', endDate: '2026-11-01', timezone: 'UTC' },
      resources: [resource],
      services: [service],
      demandSlots: slots,
      unavailabilities: [
        {
          resourceId: 'emp-1',
          date: '2026-11-01',
          reason: 'SICK_LEAVE',
        },
      ],
      lockedAllocations: [],
    };

    const solution = scheduler.generate(problem);

    expect(solution.status).toBe('PARTIAL');
    expect(solution.allocations).toHaveLength(0);
    expect(solution.metrics.coverageRate).toBe(0);

    const blocker = solution.violations.find((v) => v.ruleCode === 'H4_MINIMUM_COVERAGE');
    expect(blocker).toBeDefined();
    expect(blocker?.severity).toBe('BLOCKER');
    expect(blocker?.affectedServiceIds).toContain('service-apex');
  });

  it('Scenario 2: Eligible backup restores coverage when sole primary is on leave', () => {
    const primary: Resource = {
      id: 'emp-1',
      name: 'Alice Primary',
      capabilityIds: ['cap-brand-apex'],
      maxDailyCapacity: 1.0,
      groupId: 'pod-1',
      tags: { 'role:service-apex': 'PRIMARY' },
    };

    const backup: Resource = {
      id: 'emp-2',
      name: 'Bob Backup',
      capabilityIds: ['cap-brand-apex'],
      maxDailyCapacity: 1.0,
      groupId: 'pod-1',
      tags: { 'role:service-apex': 'BACKUP' },
    };

    const service: Service = {
      id: 'service-apex',
      name: 'Brand Apex',
      requiredCapabilityId: 'cap-brand-apex',
      staffingModel: 'SINGLE_RESOURCE',
    };

    const slots: DemandSlot[] = [
      {
        id: 'service-apex:2026-11-01',
        serviceId: 'service-apex',
        date: '2026-11-01',
        minResourceCount: 1,
        capacityWeightPerResource: 1.0,
        priority: 10,
      },
    ];

    const problem: SchedulingProblem = {
      id: 'prob-2',
      horizon: { startDate: '2026-11-01', endDate: '2026-11-01', timezone: 'UTC' },
      resources: [primary, backup],
      services: [service],
      demandSlots: slots,
      unavailabilities: [
        {
          resourceId: 'emp-1',
          date: '2026-11-01',
          reason: 'LEAVE',
        },
      ],
      lockedAllocations: [],
    };

    const solution = scheduler.generate(problem);

    expect(solution.status).toBe('FEASIBLE');
    expect(solution.allocations).toHaveLength(1);
    expect(solution.allocations[0].resourceId).toBe('emp-2');
    expect(solution.metrics.coverageRate).toBe(1.0);
    expect(solution.violations.filter((v) => v.severity === 'BLOCKER')).toHaveLength(0);
  });

  it('Scenario 3: Ineligible resource assignment is rejected', () => {
    const untrained: Resource = {
      id: 'emp-3',
      name: 'Charlie Untrained',
      capabilityIds: ['cap-brand-other'], // Lacks cap-brand-apex
      maxDailyCapacity: 1.0,
    };

    const service: Service = {
      id: 'service-apex',
      name: 'Brand Apex',
      requiredCapabilityId: 'cap-brand-apex',
      staffingModel: 'SINGLE_RESOURCE',
    };

    const problem: SchedulingProblem = {
      id: 'prob-3',
      horizon: { startDate: '2026-11-01', endDate: '2026-11-01', timezone: 'UTC' },
      resources: [untrained],
      services: [service],
      demandSlots: [
        {
          id: 'service-apex:2026-11-01',
          serviceId: 'service-apex',
          date: '2026-11-01',
          minResourceCount: 1,
          capacityWeightPerResource: 1.0,
          priority: 10,
        },
      ],
      unavailabilities: [],
      lockedAllocations: [],
    };

    const manualInvalidAllocation: Allocation = {
      id: 'alloc-manual',
      slotId: 'service-apex:2026-11-01',
      serviceId: 'service-apex',
      resourceId: 'emp-3',
      date: '2026-11-01',
      capacityConsumed: 1.0,
      isLocked: false,
      source: 'MANUAL_EDIT',
    };

    const violations = scheduler.validate(problem, [manualInvalidAllocation]);
    const eligibilityViolation = violations.find((v) => v.ruleCode === 'H3_ELIGIBILITY');

    expect(eligibilityViolation).toBeDefined();
    expect(eligibilityViolation?.severity).toBe('BLOCKER');
    expect(eligibilityViolation?.affectedResourceIds).toContain('emp-3');
  });

  it('Scenario 4: Multi-resource slot requiring 2 staff fails if same person is scheduled twice', () => {
    const resource: Resource = {
      id: 'emp-1',
      name: 'Alice',
      capabilityIds: ['cap-cs'],
      maxDailyCapacity: 2.0, // High capacity
    };

    const service: Service = {
      id: 'service-mega-cs',
      name: 'MegaStore CS',
      requiredCapabilityId: 'cap-cs',
      staffingModel: 'MULTI_RESOURCE',
    };

    const problem: SchedulingProblem = {
      id: 'prob-4',
      horizon: { startDate: '2026-11-01', endDate: '2026-11-01', timezone: 'UTC' },
      resources: [resource],
      services: [service],
      demandSlots: [
        {
          id: 'service-mega-cs:2026-11-01',
          serviceId: 'service-mega-cs',
          date: '2026-11-01',
          minResourceCount: 2,
          capacityWeightPerResource: 1.0,
          priority: 10,
        },
      ],
      unavailabilities: [],
      lockedAllocations: [],
    };

    const duplicateAllocations: Allocation[] = [
      {
        id: 'alloc-1',
        slotId: 'service-mega-cs:2026-11-01',
        serviceId: 'service-mega-cs',
        resourceId: 'emp-1',
        date: '2026-11-01',
        capacityConsumed: 1.0,
        isLocked: false,
        source: 'MANUAL_EDIT',
      },
      {
        id: 'alloc-2',
        slotId: 'service-mega-cs:2026-11-01',
        serviceId: 'service-mega-cs',
        resourceId: 'emp-1', // Duplicated!
        date: '2026-11-01',
        capacityConsumed: 1.0,
        isLocked: false,
        source: 'MANUAL_EDIT',
      },
    ];

    const violations = scheduler.validate(problem, duplicateAllocations);
    const distinctViolation = violations.find((v) => v.ruleCode === 'H5_DISTINCT_RESOURCES');

    expect(distinctViolation).toBeDefined();
    expect(distinctViolation?.severity).toBe('BLOCKER');
  });

  it('Scenario 5: Exceeding daily capacity triggers H2_CAPACITY_LIMIT', () => {
    const resource: Resource = {
      id: 'emp-1',
      name: 'Alice',
      capabilityIds: ['cap-brand-1', 'cap-brand-2'],
      maxDailyCapacity: 1.0,
    };

    const problem: SchedulingProblem = {
      id: 'prob-5',
      horizon: { startDate: '2026-11-01', endDate: '2026-11-01', timezone: 'UTC' },
      resources: [resource],
      services: [],
      demandSlots: [],
      unavailabilities: [],
      lockedAllocations: [],
    };

    const doubleBooked: Allocation[] = [
      {
        id: 'a1',
        slotId: 's1:2026-11-01',
        serviceId: 's1',
        resourceId: 'emp-1',
        date: '2026-11-01',
        capacityConsumed: 1.0,
        isLocked: false,
        source: 'MANUAL_EDIT',
      },
      {
        id: 'a2',
        slotId: 's2:2026-11-01',
        serviceId: 's2',
        resourceId: 'emp-1',
        date: '2026-11-01',
        capacityConsumed: 1.0, // Total = 2.0 > 1.0
        isLocked: false,
        source: 'MANUAL_EDIT',
      },
    ];

    const violations = scheduler.validate(problem, doubleBooked);
    const capacityViolation = violations.find((v) => v.ruleCode === 'H2_CAPACITY_LIMIT');

    expect(capacityViolation).toBeDefined();
    expect(capacityViolation?.severity).toBe('BLOCKER');
  });

  it('Scenario 6: Max consecutive work days fatigue limit prevents >6 consecutive days', () => {
    const resource: Resource = {
      id: 'emp-1',
      name: 'Alice',
      capabilityIds: ['cap-1'],
      maxDailyCapacity: 1.0,
    };

    const service: Service = {
      id: 'service-1',
      name: 'Service 1',
      requiredCapabilityId: 'cap-1',
      staffingModel: 'SINGLE_RESOURCE',
    };

    const dates = [
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07', // 7th consecutive day!
    ];

    const slots: DemandSlot[] = dates.map((d) => ({
      id: `service-1:${d}`,
      serviceId: 'service-1',
      date: d,
      minResourceCount: 1,
      capacityWeightPerResource: 1.0,
      priority: 10,
    }));

    const problem: SchedulingProblem = {
      id: 'prob-6',
      horizon: { startDate: '2026-11-01', endDate: '2026-11-07', timezone: 'UTC' },
      resources: [resource],
      services: [service],
      demandSlots: slots,
      unavailabilities: [],
      lockedAllocations: [],
    };

    const solution = scheduler.generate(problem);

    // Should only allocate 6 days, leaving the 7th day open to satisfy fatigue constraint
    expect(solution.allocations).toHaveLength(6);
    expect(solution.status).toBe('PARTIAL'); // 7th day is unfulfilled because only 1 resource exists
  });

  it('Scenario 7: Locked allocations survive solver generation unaltered', () => {
    const primary: Resource = {
      id: 'emp-1',
      name: 'Alice Primary',
      capabilityIds: ['cap-1'],
      maxDailyCapacity: 1.0,
      tags: { 'role:service-1': 'PRIMARY' },
    };

    const relief: Resource = {
      id: 'emp-relief',
      name: 'Relief Staff',
      capabilityIds: ['cap-1'],
      maxDailyCapacity: 1.0,
      tags: { 'role:service-1': 'RELIEF' },
    };

    const service: Service = {
      id: 'service-1',
      name: 'Service 1',
      requiredCapabilityId: 'cap-1',
      staffingModel: 'SINGLE_RESOURCE',
    };

    const lockedAlloc: Allocation = {
      id: 'locked-relief-alloc',
      slotId: 'service-1:2026-11-01',
      serviceId: 'service-1',
      resourceId: 'emp-relief', // Client specifically locked relief staff on this day
      date: '2026-11-01',
      capacityConsumed: 1.0,
      isLocked: true,
      source: 'MANUAL_EDIT',
    };

    const problem: SchedulingProblem = {
      id: 'prob-7',
      horizon: { startDate: '2026-11-01', endDate: '2026-11-01', timezone: 'UTC' },
      resources: [primary, relief],
      services: [service],
      demandSlots: [
        {
          id: 'service-1:2026-11-01',
          serviceId: 'service-1',
          date: '2026-11-01',
          minResourceCount: 1,
          capacityWeightPerResource: 1.0,
          priority: 10,
        },
      ],
      unavailabilities: [],
      lockedAllocations: [lockedAlloc],
    };

    const solution = scheduler.generate(problem);

    expect(solution.allocations).toHaveLength(1);
    expect(solution.allocations[0].resourceId).toBe('emp-relief');
    expect(solution.allocations[0].isLocked).toBe(true);
  });

  it('Scenario 8: Suggests lexicographically ranked replacements for a gap', () => {
    const primaryBackup: Resource = {
      id: 'emp-backup',
      name: 'Bob Backup',
      capabilityIds: ['cap-brand'],
      maxDailyCapacity: 1.0,
      groupId: 'pod-1',
      tags: { 'role:service-brand': 'BACKUP' },
    };

    const crossPodRelief: Resource = {
      id: 'emp-relief',
      name: 'Rita Relief',
      capabilityIds: ['cap-brand'],
      maxDailyCapacity: 1.0,
      groupId: 'pod-2', // Different pod
      tags: { 'role:service-brand': 'RELIEF' },
    };

    const service: Service = {
      id: 'service-brand',
      name: 'Brand Process',
      requiredCapabilityId: 'cap-brand',
      staffingModel: 'SINGLE_RESOURCE',
      tags: { podId: 'pod-1' },
    };

    const slot: DemandSlot = {
      id: 'service-brand:2026-11-05',
      serviceId: 'service-brand',
      date: '2026-11-05',
      minResourceCount: 1,
      capacityWeightPerResource: 1.0,
      priority: 10,
      metadata: { podId: 'pod-1' },
    };

    const problem: SchedulingProblem = {
      id: 'prob-8',
      horizon: { startDate: '2026-11-05', endDate: '2026-11-05', timezone: 'UTC' },
      resources: [crossPodRelief, primaryBackup],
      services: [service],
      demandSlots: [slot],
      unavailabilities: [],
      lockedAllocations: [],
    };

    const candidates = scheduler.suggestReplacements(problem, slot, []);

    expect(candidates).toHaveLength(2);
    // Rank 1 must be Bob Backup (BACKUP role and same pod) over Rita (RELIEF and different pod)
    expect(candidates[0].resourceId).toBe('emp-backup');
    expect(candidates[0].rank).toBe(1);
    expect(candidates[0].roleTier).toBe('BACKUP');
    expect(candidates[0].isSameGroup).toBe(true);

    expect(candidates[1].resourceId).toBe('emp-relief');
    expect(candidates[1].rank).toBe(2);
  });
});
