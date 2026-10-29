/** Independent QA acceptance tests. Production and prior tests are intentionally untouched. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  importWorkspaceLibrary, exportWorkspaceLibrary, getOrCreateWorkspace,
  generateWorkspaceRoster, changeWorkspacePeriod,
  toggleCellLock, addEmployeeLeave, removeEmployeeLeave, removeAssignment,
  upsertAssignment, updateSolverCustomConfig, updateServiceRequirement,
  autoRepairAllGaps, removeAllocation, publishRoster, resetWorkspaceToDemo,
} from '../service';

const period = { year: 2026, month: 11 };
const config = { maxConsecutiveDays: 6, enforcePodAffinity: true, honorPreferredOffDay: true, preferPrimaryContinuity: true };
function fixture() {
  return {
    period, status: 'DRAFT', version: 1, solverConfig: config,
    dataset: {
      pods: [{ id: 'pod', name: 'QA', leadEmployeeId: 'a' }],
      employees: ['a', 'b'].map(id => ({ id, name: id, email: '', podId: 'pod', maxDailyCapacity: 1, preferredOffDay: 0 })),
      processes: [{ id: 'proc', code: 'QA', name: 'QA' }],
      calendars: [{ id: 'cal', name: 'Daily', baseRule: 'EVERY_DAY', excludePublicHolidays: false }],
      publicHolidays: [], brands: [{ id: 'brand', name: 'QA', podId: 'pod', staffingModel: 'SINGLE' }],
      brandProcesses: [{ id: 'svc', brandId: 'brand', processId: 'proc', calendarId: 'cal', minStaffing: 1, capacityWeight: 1 }],
      assignments: ['a', 'b'].map(employeeId => ({ id: `asgn-${employeeId}`, employeeId, brandProcessId: 'svc', role: 'RELIEF', priorityTier: 3 })),
      leaves: [],
    },
    allocations: [], baselineAllocations: [], publications: [],
  };
}
function backup() { return JSON.parse(exportWorkspaceLibrary()); }
function restore(library: unknown) { return importWorkspaceLibrary(JSON.stringify(library)); }
function published() {
  const result = publishRoster('default');
  expect(result.success).toBe(true);
  return result.state;
}
beforeEach(() => {
  vi.restoreAllMocks();
  restore({ format: 'datastraw-workspaces', schemaVersion: 1, workspaces: { default: fixture() } });
  generateWorkspaceRoster();
});

describe('Independent service QA: passing safety controls', () => {
  it('month switch restores draft, locks and original dataset independently', () => {
    const s = getOrCreateWorkspace(); const a = s.allocations[0];
    toggleCellLock('default', a.id);
    changeWorkspacePeriod('default', { year: 2027, month: 2 });
    updateServiceRequirement('default', 'svc', { minStaffing: 2 });
    const back = changeWorkspacePeriod('default', period);
    expect(back.allocations.find(x => x.id === a.id)?.isLocked).toBe(true);
    expect(back.dataset.brandProcesses[0].minStaffing).toBe(1);
    expect(back.problem.horizon.endDate).toBe('2026-11-30');
  });
  it('backup roundtrip preserves published and archived months', () => {
    const s = published(); const snapshot = structuredClone(s.publications);
    changeWorkspacePeriod('default', { year: 2028, month: 2 });
    const library = exportWorkspaceLibrary(); restore(JSON.parse(library));
    expect(getOrCreateWorkspace().problem.horizon.endDate).toBe('2028-02-29');
    const back = changeWorkspacePeriod('default', period);
    expect(back.status).toBe('PUBLISHED'); expect(back.publications).toEqual(snapshot);
  });
  it('rejects malformed relationships atomically, even in archived months', () => {
    changeWorkspacePeriod('default', { year: 2027, month: 1 });
    const before = exportWorkspaceLibrary(); const library = backup();
    library.workspaces['default:2026-11'].dataset.brandProcesses[0].calendarId = 'missing';
    expect(() => restore(library)).toThrow(); expect(exportWorkspaceLibrary()).toBe(before);
  });
  it('detects active allocation tampering and blocks publication', () => {
    published(); const library = backup(); library.workspaces.default.allocations[0].capacityConsumed = 0.1;
    const s = restore(library); expect(s.status).toBe('DRAFT');
    expect(s.violations.some(v => v.ruleCode === 'H0_INTEGRITY')).toBe(true);
    expect(publishRoster('default').success).toBe(false);
  });
  it('preserves pins across rule regeneration and surfaces approved-leave conflicts', () => {
    const a = getOrCreateWorkspace().allocations[0]; toggleCellLock('default', a.id);
    addEmployeeLeave('default', a.resourceId, a.date, 'PLANNED');
    const s = updateSolverCustomConfig('default', { maxConsecutiveDays: 3 });
    expect(s.allocations.find(x => x.id === a.id)).toEqual({ ...a, isLocked: true });
    expect(s.violations.some(v => v.ruleCode === 'H1_UNAVAILABLE_RESOURCE')).toBe(true);
    expect(publishRoster('default').success).toBe(false);
  });
  it('removes unlocked leave work, repairs with qualified available staff, cancels leave', () => {
    const a = getOrCreateWorkspace().allocations[0];
    addEmployeeLeave('default', a.resourceId, a.date, 'COMP_OFF');
    const { state: s, repairedCount } = autoRepairAllGaps();
    expect(repairedCount).toBe(1);
    expect(s.allocations.some(x => x.resourceId === a.resourceId && x.date === a.date)).toBe(false);
    expect(s.coverageRate).toBe(1);
    expect(s.offDays.some(x => x.resourceId === a.resourceId && x.date === a.date && x.reason === 'COMP_OFF')).toBe(true);
    removeEmployeeLeave('default', s.dataset.leaves[0].id);
    expect(getOrCreateWorkspace().problem.unavailabilities).toEqual([]);
  });
  it('revoke/reinstate eligibility changes coverage and prevents invalid repair', () => {
    const a = getOrCreateWorkspace().allocations[0];
    removeAssignment('default', a.resourceId, a.serviceId);
    const s = getOrCreateWorkspace();
    expect(s.violations.some(v => v.ruleCode === 'H3_ELIGIBILITY')).toBe(true);
    expect(s.coverageRate).toBeLessThan(1);
    upsertAssignment('default', a.resourceId, a.serviceId, 'PRIMARY');
    const reinstated = getOrCreateWorkspace();
    expect(reinstated.violations.some(v => v.ruleCode === 'H3_ELIGIBILITY')).toBe(false);
    expect(reinstated.coverageRate).toBe(1);
  });
  it('repair fills a missing seat without dropping existing pins', () => {
    const a = getOrCreateWorkspace().allocations[0]; toggleCellLock('default', a.id);
    const b = getOrCreateWorkspace().allocations[1]; removeAllocation('default', b.id);
    const s = autoRepairAllGaps().state;
    expect(s.allocations.find(x => x.id === a.id)?.isLocked).toBe(true);
    expect(s.coverageRate).toBe(1);
    expect(autoRepairAllGaps().repairedCount).toBe(0);
  });
  it('repair respects multi-resource headcount and distinct identities', () => {
    const s = getOrCreateWorkspace(); const date = s.allocations[0].date;
    updateServiceRequirement('default', 'svc', { staffingOverrides: [{ date, minStaffing: 2 }] });
    const result = autoRepairAllGaps();
    const work = result.state.allocations.filter(a => a.date === date);
    expect(work).toHaveLength(2); expect(new Set(work.map(a => a.resourceId)).size).toBe(2);
    expect(result.state.coverageRate).toBe(1);
    expect(result.state.violations.filter(v => v.severity === 'BLOCKER')).toEqual([]);
  });
  it('calendar removal preserves invalid pins visibly and blocks publication', () => {
    const a = getOrCreateWorkspace().allocations[0]; toggleCellLock('default', a.id);
    const s = updateServiceRequirement('default', 'svc', { calendarOverrides: [{ date: a.date, action: 'REMOVE' }] });
    expect(s.allocations.some(x => x.id === a.id)).toBe(true);
    expect(s.violations.some(v => v.ruleCode === 'H0_INTEGRITY')).toBe(true);
    expect(publishRoster('default').success).toBe(false);
  });
  it('publication is idempotent and later edits keep the old snapshot intact', () => {
    const s = published(); const snapshot = structuredClone(s.publications[0]);
    published(); expect(getOrCreateWorkspace().publications).toHaveLength(1);
    toggleCellLock('default', s.allocations[0].id);
    const draft = getOrCreateWorkspace();
    expect(draft.version).toBe(2); expect(draft.status).toBe('DRAFT');
    expect(draft.publications[0]).toEqual(snapshot);
    published(); expect(getOrCreateWorkspace().publications.map(p => p.version)).toEqual([1, 2]);
  });
});

describe('Independent service QA: unmet acceptance / reproducible defects', () => {
  it('QA-01 adding two eligibilities in the same millisecond must not corrupt dataset IDs', () => {
    removeAssignment('default', 'a', 'svc'); removeAssignment('default', 'b', 'svc');
    vi.spyOn(Date, 'now').mockReturnValue(1793246400000);
    upsertAssignment('default', 'a', 'svc', 'PRIMARY');
    expect(() => upsertAssignment('default', 'b', 'svc', 'BACKUP')).not.toThrow();
    expect(new Set(getOrCreateWorkspace().dataset.assignments.map(a => a.id)).size).toBe(2);
    expect(() => generateWorkspaceRoster()).not.toThrow();
  });
  it('QA-02 rejected eligibility edit must leave workspace unchanged', () => {
    removeAssignment('default', 'a', 'svc'); removeAssignment('default', 'b', 'svc');
    vi.spyOn(Date, 'now').mockReturnValue(1793246400000);
    upsertAssignment('default', 'a', 'svc', 'PRIMARY');
    const before = exportWorkspaceLibrary();
    let rejected = false;
    try { upsertAssignment('default', 'b', 'svc', 'BACKUP'); } catch { rejected = true; }
    if (rejected) {
      expect(exportWorkspaceLibrary()).toBe(before);
    } else {
      const assignments = getOrCreateWorkspace().dataset.assignments;
      expect(assignments).toHaveLength(2);
      expect(new Set(assignments.map(a => a.id)).size).toBe(2);
      expect(() => generateWorkspaceRoster()).not.toThrow();
    }
  });
  it('QA-03 historical snapshots must be independently audited during import', () => {
    const s = published(); toggleCellLock('default', s.allocations[0].id); published();
    const library = backup();
    library.workspaces.default.publications[0].allocations[0].resourceId = 'nonexistent';
    expect(() => restore(library)).toThrow();
  });
  it('QA-04 tampered published backup must not reuse a historical version after revalidation', () => {
    published(); const library = backup();
    library.workspaces.default.allocations[0].isLocked = true;
    const s = restore(library); expect(s.status).toBe('DRAFT');
    published();
    const history = getOrCreateWorkspace().publications;
    expect(new Set(history.map(p => p.version)).size).toBe(history.length);
  });
  it('QA-06 importing mismatched history timestamps must not retain PUBLISHED status', () => {
    published(); const library = backup();
    library.workspaces.default.publishedAt = 'not-a-date';
    const s = restore(library); expect(s.status).toBe('DRAFT');
  });
  it('QA-08 a valid library must roundtrip after 101 normal publications', () => {
    for (let i = 0; i < 101; i++) {
      if (i) toggleCellLock('default', getOrCreateWorkspace().allocations[0].id);
      published();
    }
    expect(getOrCreateWorkspace().publications).toHaveLength(101);
    expect(() => importWorkspaceLibrary(exportWorkspaceLibrary())).not.toThrow();
  });
  it('QA-09 no-op repair must not reopen an unchanged publication', () => {
    const s = published(); const version = s.version;
    expect(autoRepairAllGaps().repairedCount).toBe(0);
    const after = getOrCreateWorkspace();
    expect(after.status).toBe('PUBLISHED'); expect(after.version).toBe(version);
  });
});

describe('Independent service QA: documented limits and scoped reset', () => {
  it('reset affects only the active month; other month drafts are retained', () => {
    const a = getOrCreateWorkspace().allocations[0]; removeAllocation('default', a.id);
    changeWorkspacePeriod('default', { year: 2027, month: 1 });
    expect(resetWorkspaceToDemo('default').dataset.employees.length).toBeGreaterThan(2);
    const back = changeWorkspacePeriod('default', period);
    expect(back.dataset.employees).toHaveLength(2);
    expect(back.allocations.some(x => x.id === a.id)).toBe(false);
  });
  it('repair does not silently remove revoked unlocked work and cannot promise all-conflict resolution', () => {
    const a = getOrCreateWorkspace().allocations[0];
    removeAssignment('default', a.resourceId, a.serviceId);
    autoRepairAllGaps(); const s = getOrCreateWorkspace();
    expect(s.allocations.some(x => x.id === a.id)).toBe(true);
    expect(s.violations.some(v => v.ruleCode === 'H3_ELIGIBILITY')).toBe(true);
    expect(publishRoster('default').success).toBe(false);
  });
});
