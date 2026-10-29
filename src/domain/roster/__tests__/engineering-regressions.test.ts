import { beforeEach, describe, expect, it } from 'vitest';
import {
  changeWorkspacePeriod, exportWorkspaceLibrary, generateWorkspaceRoster, getOrCreateWorkspace,
  importWorkspaceLibrary, publishRoster, removeAllocation, resetWorkspaceToDemo,
  updateHoliday, updateServiceRequirement,
} from '../service';

beforeEach(() => { resetWorkspaceToDemo(); changeWorkspacePeriod('default', { year: 2026, month: 11 }); resetWorkspaceToDemo(); });
function clearLeave() {
  const backup = JSON.parse(exportWorkspaceLibrary()); backup.workspaces.default.dataset.leaves = [];
  importWorkspaceLibrary(JSON.stringify(backup)); generateWorkspaceRoster();
}

describe('Engineering-manager release regressions', () => {
  it('rejects malformed holiday edits atomically, with no partially committed dataset', () => {
    clearLeave(); const before = exportWorkspaceLibrary();
    expect(() => updateHoliday('default', '2026-11-03', 'x'.repeat(201))).toThrow();
    expect(exportWorkspaceLibrary()).toBe(before);
    expect(publishRoster('default').success).toBe(true);
  });
  it('rejects overlapping process ownership through bundle edits atomically', () => {
    const before = exportWorkspaceLibrary();
    expect(() => updateServiceRequirement('default', 'bp-brand-17-cs', { coveredProcessIds: ['proc-cs', 'proc-acc'] })).toThrow();
    expect(exportWorkspaceLibrary()).toBe(before);
  });
  it('returns detached read snapshots, including historical allocations', () => {
    clearLeave(); expect(publishRoster('default').success).toBe(true);
    const read = getOrCreateWorkspace(); const allocationCount = read.publications[0].allocations.length;
    read.publications[0].allocations.pop(); read.dataset.brands[0].name = 'Mutated externally';
    const current = getOrCreateWorkspace();
    expect(current.publications[0].allocations).toHaveLength(allocationCount);
    expect(current.dataset.brands[0].name).not.toBe('Mutated externally');
  });
  it('returns detached command results as well as reads', () => {
    const first = getOrCreateWorkspace().allocations[0]; const changed = removeAllocation('default', first.id);
    changed.dataset.employees.pop();
    expect(getOrCreateWorkspace().dataset.employees).toHaveLength(30);
  });
  it('retains soft preference notices after harmless edits and backup roundtrip', () => {
    const initial = getOrCreateWorkspace();
    const notices = initial.violations.filter(violation => violation.severity === 'WARNING');
    expect(notices.length).toBeGreaterThan(0);
    const fresh = importWorkspaceLibrary(exportWorkspaceLibrary());
    expect(fresh.violations.filter(violation => violation.severity === 'WARNING')).toEqual(notices);
  });
});

it('does not retain caller-owned period objects during creation or month changes', () => {
  const creationPeriod = { year: 2028, month: 2 };
  getOrCreateWorkspace('period-ownership-test', creationPeriod);
  creationPeriod.month = 13;
  expect(getOrCreateWorkspace('period-ownership-test').period.month).toBe(2);
  const nextPeriod = { year: 2027, month: 3 };
  changeWorkspacePeriod('default', nextPeriod); nextPeriod.month = 13;
  expect(getOrCreateWorkspace().period.month).toBe(3);
});
