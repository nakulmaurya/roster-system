import { beforeEach, describe, expect, it } from 'vitest';
import { getMonthHorizon, toSchedulingProblem } from '../adapter';
import { generateSeedData } from '../seed-data';
import {
  resetWorkspaceToDemo, changeWorkspacePeriod, exportRosterToCsv,
  addCustomEmployee, addCustomBrand, upsertAssignment, removeAssignment,
  addEmployeeLeave, removeEmployeeLeave, removeAllocation,
  getDiffSummary, publishRoster, getOrCreateWorkspace, generateWorkspaceRoster,
  importWorkspaceLibrary, exportWorkspaceLibrary, updateServiceRequirement, updateSolverCustomConfig,
} from '../service';

beforeEach(() => {
  resetWorkspaceToDemo();
  changeWorkspacePeriod('default', { year: 2026, month: 11 });
  resetWorkspaceToDemo();
});
function editFixture(edit: (document: ReturnType<typeof getOrCreateWorkspace>) => void) {
  const library = JSON.parse(exportWorkspaceLibrary());
  edit(library.workspaces.default);
  return importWorkspaceLibrary(JSON.stringify(library));
}

describe('Dynamic roster configuration and safe workspace lifecycle', () => {
  it('validates month rather than silently rolling 13 into the next year', () => {
    expect(() => getMonthHorizon(2026, 13)).toThrow();
    expect(getMonthHorizon(2028, 2).endDate).toBe('2028-02-29');
  });
  it('uses all 31 selected-month dates in CSV', () => {
    changeWorkspacePeriod('default', { year: 2027, month: 1 });
    const csv = exportRosterToCsv();
    expect(csv.split('\r\n')[0]).toContain('2027-01-31');
    expect(csv).not.toContain('2026-11');
    expect(csv.split('\r\n')[0].split(',')).toHaveLength(35);
  });
  it('preserves month-specific edits when switching back', () => {
    const state = getOrCreateWorkspace();
    const removed = state.allocations[0]; removeAllocation('default', removed.id);
    changeWorkspacePeriod('default', { year: 2027, month: 2 });
    const restored = changeWorkspacePeriod('default', { year: 2026, month: 11 });
    expect(restored.allocations.some(a => a.id === removed.id)).toBe(false);
  });
  it('does not automatically authorize new employees for all brands', () => {
    const state = addCustomEmployee('default', { name: 'New Hire', email: '', podId: 'pod-1', preferredOffDay: 0 });
    const employee = state.dataset.employees.at(-1)!;
    expect(state.dataset.assignments.filter(a => a.employeeId === employee.id)).toHaveLength(0);
    expect(state.problem.resources.find(r => r.id === employee.id)?.capabilityIds).toEqual([]);
  });
  it('does not automatically authorize relief employees for a new brand', () => {
    const state = addCustomBrand('default', { name: 'New Brand', podId: 'pod-1', staffingModel: 'SINGLE', calendarId: 'cal-365' });
    const service = state.dataset.brandProcesses.at(-1)!;
    expect(state.dataset.assignments.filter(a => a.brandProcessId === service.id)).toHaveLength(0);
    expect(state.violations.some(v => v.affectedServiceIds.includes(service.id))).toBe(true);
  });
  it('revalidates revoked eligibility without silently deleting work', () => {
    const allocation = getOrCreateWorkspace().allocations[0];
    const state = removeAssignment('default', allocation.resourceId, allocation.serviceId);
    expect(state.violations.some(v => v.ruleCode === 'H3_ELIGIBILITY')).toBe(true);
    expect(state.allocations.some(a => a.id === allocation.id)).toBe(true);
  });
  it('records removals in the draft diff', () => {
    const removed = getOrCreateWorkspace().allocations[0]; removeAllocation('default', removed.id);
    expect(getDiffSummary().some(d => d.changeType === 'REMOVED' && d.date === removed.date)).toBe(true);
  });
  it('removes unavailable unlocked work and updates off-day records', () => {
    const allocation = getOrCreateWorkspace().allocations.find(a => !a.isLocked)!;
    const state = addEmployeeLeave('default', allocation.resourceId, allocation.date, 'COMP_OFF');
    expect(state.allocations.some(a => a.resourceId === allocation.resourceId && a.date === allocation.date)).toBe(false);
    expect(state.offDays.some(o => o.resourceId === allocation.resourceId && o.date === allocation.date && o.reason === 'COMP_OFF')).toBe(true);
  });
  it('deduplicates leave and allows cancellation', () => {
    const a = getOrCreateWorkspace().allocations[0];
    addEmployeeLeave('default', a.resourceId, a.date); const state = addEmployeeLeave('default', a.resourceId, a.date, 'PLANNED');
    const leaves = state.dataset.leaves.filter(l => l.employeeId === a.resourceId && l.leaveDate === a.date);
    expect(leaves).toHaveLength(1); removeEmployeeLeave('default', leaves[0].id);
    expect(getOrCreateWorkspace().dataset.leaves.some(l => l.id === leaves[0].id)).toBe(false);
  });
  it('preserves published snapshots when the draft changes', () => {
    editFixture(state => { state.dataset.leaves = []; }); generateWorkspaceRoster();
    const published = publishRoster('default'); expect(published.success).toBe(true);
    const snapshot = structuredClone(published.state.publications[0]); const version = published.state.version;
    const state = removeAllocation('default', published.state.allocations[0].id);
    expect(state.status).toBe('DRAFT'); expect(state.version).toBe(version + 1);
    expect(state.publications[0]).toEqual(snapshot);
  });
  it('does not trust stale violation state during publication', () => {
    const state = getOrCreateWorkspace(); removeAllocation('default', state.allocations[0].id); state.violations = [];
    expect(publishRoster('default').success).toBe(false);
  });
  it('supports operating and staffing overrides through the adapter', () => {
    const service = getOrCreateWorkspace().dataset.brandProcesses[0];
    const state = updateServiceRequirement('default', service.id, { calendarOverrides: [{ date: '2026-11-01', action: 'REMOVE' }], staffingOverrides: [{ date: '2026-11-02', minStaffing: 3 }] });
    expect(state.problem.demandSlots.some(s => s.serviceId === service.id && s.date === '2026-11-01')).toBe(false);
    expect(state.problem.demandSlots.find(s => s.serviceId === service.id && s.date === '2026-11-02')?.minResourceCount).toBe(3);
  });
  it('rejects invalid solver settings before mutating them', () => {
    expect(() => updateSolverCustomConfig('default', { maxConsecutiveDays: 0 })).toThrow();
    expect(getOrCreateWorkspace().solverConfig.maxConsecutiveDays).toBe(6);
  });
  it('rejects broken configuration relationships', () => {
    const data = generateSeedData(); data.brandProcesses[0].calendarId = 'missing';
    expect(() => toSchedulingProblem(data, { year: 2026, month: 11 })).toThrow();
  });
  it('round-trips backup data and rebuilds validation instead of trusting stored metrics', () => {
    const state = getOrCreateWorkspace(); const count = state.allocations.length;
    const backup = exportWorkspaceLibrary(); removeAllocation('default', state.allocations[0].id);
    const restored = importWorkspaceLibrary(backup);
    expect(restored.allocations).toHaveLength(count);
    expect(restored.problem.horizon.startDate).toBe('2026-11-01');
  });
  it('rejects corrupt backups atomically', () => {
    const before = getOrCreateWorkspace().allocations.length;
    expect(() => importWorkspaceLibrary('{"format":"nope"}')).toThrow();
    expect(getOrCreateWorkspace().allocations).toHaveLength(before);
  });
  it('escapes quotes and neutralizes spreadsheet formulas in CSV', () => {
    editFixture(state => { state.dataset.brands[0].name = '=HYPERLINK("bad")'; });
    expect(exportRosterToCsv()).toContain('"\'=HYPERLINK(""bad"")"');
  });
  it('updates priority when an existing eligibility role changes', () => {
    const state = getOrCreateWorkspace(); const a = state.dataset.assignments[0];
    const next = upsertAssignment('default', a.employeeId, a.brandProcessId, 'RELIEF');
    expect(next.dataset.assignments.find(item => item.id === a.id)?.priorityTier).toBe(3);
  });
});
