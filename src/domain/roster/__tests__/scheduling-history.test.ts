import { beforeEach, describe, expect, it } from 'vitest';
import { SeedDataset } from '../seed-data';
import {
  importWorkspaceLibrary, exportWorkspaceLibrary, generateWorkspaceRoster,
  publishRoster, changeWorkspacePeriod, removeAllocation, updateServiceRequirement, autoRepairAllGaps,
} from '../service';

const config = { maxConsecutiveDays: 6, enforcePodAffinity: true, honorPreferredOffDay: true, preferPrimaryContinuity: true };
const shift = { startMinute: 540, endMinute: 1020, timezone: 'Asia/Kolkata' };
function dataset(): SeedDataset {
  return {
    pods: [{ id: 'p', name: 'P', leadEmployeeId: 'a' }],
    employees: ['a', 'b'].map(id => ({ id, name: id, email: '', podId: 'p', maxDailyCapacity: 1, preferredOffDay: 0 })),
    processes: [{ id: 'proc', code: 'P', name: 'Process' }],
    calendars: [{ id: 'c', name: 'Daily', baseRule: 'EVERY_DAY', excludePublicHolidays: false }],
    publicHolidays: [], brands: [{ id: 'brand', name: 'Brand', podId: 'p', staffingModel: 'SINGLE' }],
    brandProcesses: [{ id: 's', brandId: 'brand', processId: 'proc', calendarId: 'c', minStaffing: 1, capacityWeight: 1, shift }],
    assignments: ['a', 'b'].map(employeeId => ({ id: `asgn-${employeeId}`, employeeId, brandProcessId: 's', role: 'RELIEF', priorityTier: 3 })), leaves: [],
  };
}
function document(month: number) {
  return { period: { year: 2026, month }, status: 'DRAFT', version: 1, solverConfig: config, dataset: dataset(),
    allocations: [] as Array<{id: string; slotId: string; serviceId: string; resourceId: string; date: string; capacityConsumed: number; isLocked: boolean; source: 'MANUAL_EDIT'}>, baselineAllocations: [], publications: [] };
}
function restoreWithHistory() {
  const prior = document(10);
  for (let day = 26; day <= 31; day++) {
    const date = `2026-10-${day}`;
    prior.allocations.push({ id: `a-${day}`, slotId: `s:${date}`, serviceId: 's', resourceId: 'a', date, capacityConsumed: 1, isLocked: false, source: 'MANUAL_EDIT' });
  }
  importWorkspaceLibrary(JSON.stringify({ format: 'datastraw-workspaces', schemaVersion: 1, workspaces: { default: document(11), 'default:2026-10': prior } }));
}
beforeEach(restoreWithHistory);

describe('automatic archived-month scheduling history', () => {
  it('carries actual recorded days via JSON-safe records and avoids a seventh day during generation and repair', () => {
    const state = generateWorkspaceRoster();
    expect(state.problem.trailingContext?.resourceTrailingWorkDays).not.toBeInstanceOf(Map);
    const transport = JSON.parse(JSON.stringify(state.problem));
    expect(transport.trailingContext.resourceTrailingWorkDays.a).toHaveLength(6);
    expect(transport.trailingContext.resourceWorkIntervals.a).toHaveLength(6);
    expect(state.allocations.find(a => a.date === '2026-11-01')?.resourceId).toBe('b');
    const first = state.allocations.find(a => a.date === '2026-11-01')!;
    removeAllocation('default', first.id);
    expect(autoRepairAllGaps().state.allocations.find(a => a.date === '2026-11-01')?.resourceId).toBe('b');
  });
  it('audits an imported seventh-day pin and blocks publication without erasing the pin', () => {
    const library = JSON.parse(exportWorkspaceLibrary());
    library.workspaces.default.allocations = [{ id: 'bad', slotId: 's:2026-11-01', serviceId: 's', resourceId: 'a', date: '2026-11-01', capacityConsumed: 1, isLocked: true, source: 'MANUAL_EDIT' }];
    const restored = importWorkspaceLibrary(JSON.stringify(library));
    expect(restored.violations.some(v => v.ruleCode === 'H6_MAX_CONSECUTIVE_DAYS')).toBe(true);
    expect(publishRoster('default').success).toBe(false);
    expect(generateWorkspaceRoster().allocations.some(a => a.id === 'bad')).toBe(true);
  });
  it('invalidates a dependent archived publication after editing the active prior month, preserving snapshot history', () => {
    generateWorkspaceRoster();
    const publication = publishRoster('default');
    expect(publication.success).toBe(true);
    const snapshot = publication.state.publications;
    changeWorkspacePeriod('default', { year: 2026, month: 10 });
    removeAllocation('default', 'a-31');
    const library = JSON.parse(exportWorkspaceLibrary());
    expect(library.workspaces['default:2026-11'].status).toBe('DRAFT');
    expect(library.workspaces['default:2026-11'].publications).toEqual(snapshot);
    const current = changeWorkspacePeriod('default', { year: 2026, month: 11 });
    expect(current.status).toBe('DRAFT');
    expect((current.problem.trailingContext?.resourceTrailingWorkDays as Record<string, string[]>).a).not.toContain('2026-10-31');
    expect(publishRoster('default').state.version).toBeGreaterThan(snapshot[0].version);
  });
  it('cannot retain a current publication when imported prior history changed even if current allocations remain valid', () => {
    generateWorkspaceRoster(); expect(publishRoster('default').success).toBe(true);
    const library = JSON.parse(exportWorkspaceLibrary());
    library.workspaces['default:2026-10'].allocations.pop();
    expect(importWorkspaceLibrary(JSON.stringify(library)).status).toBe('DRAFT');
  });
  it('preserves requirement shifts and snapshot history across canonical backup roundtrips', () => {
    generateWorkspaceRoster(); const published = publishRoster('default').state;
    const restored = importWorkspaceLibrary(exportWorkspaceLibrary());
    expect(restored.status).toBe('PUBLISHED');
    expect(restored.dataset.brandProcesses[0].shift).toEqual(shift);
    expect(restored.publications).toEqual(published.publications);
    expect(restored.publications[0].trailingContext?.resourceWorkIntervals?.a).toHaveLength(6);
  });
  it('validates optional shift requirements atomically and supplies a documented legacy full-day default', () => {
    const before = exportWorkspaceLibrary();
    expect(() => updateServiceRequirement('default', 's', { shift: { ...shift, endMinute: 1441 } })).toThrow();
    expect(exportWorkspaceLibrary()).toBe(before);
    const library = JSON.parse(before); delete library.workspaces.default.dataset.brandProcesses[0].shift;
    const state = importWorkspaceLibrary(JSON.stringify(library));
    expect(state.problem.demandSlots[0].shift).toEqual({ startMinute: 0, endMinute: 1440, timezone: 'Asia/Kolkata' });
  });
  it('only uses the adjacent previous month, never an unrelated archive', () => {
    const state = changeWorkspacePeriod('default', { year: 2027, month: 1 });
    expect(state.problem.trailingContext?.resourceTrailingWorkDays).toEqual({});
  });
});
