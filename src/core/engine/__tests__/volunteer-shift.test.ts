import { describe, it, expect } from 'vitest';
import {
  createScheduler,
  UnavailableResourceConstraint,
  DailyCapacityLimitConstraint,
  EligibilityConstraint,
  MinimumCoverageConstraint,
  DistinctResourcesConstraint,
  SchedulingProblem,
  Resource,
  Service,
  DemandSlot,
} from '../index';

describe('Secondary Domain Reusability: Community Food Bank Volunteer Shifts', () => {
  it('schedules volunteer stations with zero D2C brand/process coupling', () => {
    // 1. Volunteer Resources
    const volunteers: Resource[] = [
      { id: 'vol-1', name: 'Aaron', capabilityIds: ['cap-kitchen', 'cap-registration'], maxDailyCapacity: 1.0 },
      { id: 'vol-2', name: 'Bella', capabilityIds: ['cap-kitchen'], maxDailyCapacity: 1.0 },
      { id: 'vol-3', name: 'Carlos', capabilityIds: ['cap-kitchen'], maxDailyCapacity: 1.0 },
      { id: 'vol-4', name: 'Diana', capabilityIds: ['cap-registration'], maxDailyCapacity: 1.0 },
      { id: 'vol-5', name: 'Evan', capabilityIds: ['cap-registration'], maxDailyCapacity: 1.0 },
      { id: 'vol-6', name: 'Fiona', capabilityIds: ['cap-warehouse'], maxDailyCapacity: 1.0 },
      { id: 'vol-7', name: 'George', capabilityIds: ['cap-warehouse'], maxDailyCapacity: 1.0 },
    ];

    // 2. Station Services
    const stations: Service[] = [
      {
        id: 'station-kitchen',
        name: 'Soup Kitchen Station',
        requiredCapabilityId: 'cap-kitchen',
        staffingModel: 'MULTI_RESOURCE',
      },
      {
        id: 'station-registration',
        name: 'Front Desk Registration',
        requiredCapabilityId: 'cap-registration',
        staffingModel: 'MULTI_RESOURCE',
      },
      {
        id: 'station-warehouse',
        name: 'Heavy Inventory Logistics',
        requiredCapabilityId: 'cap-warehouse',
        staffingModel: 'MULTI_RESOURCE',
      },
    ];

    // 3. Shift Demand
    const demandSlots: DemandSlot[] = [
      {
        id: 'kitchen:2026-11-14',
        serviceId: 'station-kitchen',
        date: '2026-11-14',
        minResourceCount: 3, // Needs 3 volunteers
        capacityWeightPerResource: 1.0,
        priority: 15,
      },
      {
        id: 'registration:2026-11-14',
        serviceId: 'station-registration',
        date: '2026-11-14',
        minResourceCount: 2, // Needs 2 volunteers
        capacityWeightPerResource: 1.0,
        priority: 10,
      },
      {
        id: 'warehouse:2026-11-14',
        serviceId: 'station-warehouse',
        date: '2026-11-14',
        minResourceCount: 2, // Needs 2 volunteers
        capacityWeightPerResource: 1.0,
        priority: 10,
      },
    ];

    const problem: SchedulingProblem = {
      id: 'foodbank-event-2026-11-14',
      horizon: { startDate: '2026-11-14', endDate: '2026-11-14', timezone: 'UTC' },
      resources: volunteers,
      services: stations,
      demandSlots,
      unavailabilities: [],
      lockedAllocations: [],
    };

    const volunteerScheduler = createScheduler({
      hardConstraints: [
        new UnavailableResourceConstraint(),
        new DailyCapacityLimitConstraint(),
        new EligibilityConstraint(),
        new MinimumCoverageConstraint(),
        new DistinctResourcesConstraint(),
      ],
      softConstraints: [],
    });

    const solution = volunteerScheduler.generate(problem);

    expect(solution.status).toBe('FEASIBLE');
    expect(solution.metrics.coverageRate).toBe(1.0);
    expect(solution.allocations).toHaveLength(7); // 3 + 2 + 2 = 7 slots filled

    // Verify distinct volunteers at each station
    const kitchenAllocs = solution.allocations.filter((a) => a.serviceId === 'station-kitchen');
    const registrationAllocs = solution.allocations.filter((a) => a.serviceId === 'station-registration');
    const warehouseAllocs = solution.allocations.filter((a) => a.serviceId === 'station-warehouse');

    expect(kitchenAllocs).toHaveLength(3);
    expect(registrationAllocs).toHaveLength(2);
    expect(warehouseAllocs).toHaveLength(2);

    const distinctKitchenVolunteers = new Set(kitchenAllocs.map((a) => a.resourceId));
    expect(distinctKitchenVolunteers.size).toBe(3);

    // Verify zero blockers
    expect(solution.violations.filter((v) => v.severity === 'BLOCKER')).toHaveLength(0);
  });
});
