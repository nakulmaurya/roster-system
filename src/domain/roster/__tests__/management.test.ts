import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyManagementCommand, managementRemovalBlockers, type ManagementCommand } from '../management';
import * as service from '../service';
import { type SeedDataset } from '../seed-data';

const config = { maxConsecutiveDays: 6, enforcePodAffinity: true, honorPreferredOffDay: true, preferPrimaryContinuity: true };
const period = { year: 2026, month: 11 };
function fixture() {
  const dataset: SeedDataset = {
    pods: [{ id: 'p1', name: 'First pod', leadEmployeeId: 'e1' }],
    employees: [
      { id: 'e1', name: 'Lead', email: '', podId: 'p1', maxDailyCapacity: 1, preferredOffDay: 0 },
      { id: 'e2', name: 'Backup', email: '', podId: 'p1', maxDailyCapacity: 1, preferredOffDay: 0 },
    ],
    brands: [{ id: 'b1', name: 'Brand', podId: 'p1', staffingModel: 'SINGLE' }],
    processes: [{ id: 'q1', code: 'CS', name: 'Support' }, { id: 'q2', code: 'ACC', name: 'Accounts' }],
    calendars: [{ id: 'c1', name: 'Daily', baseRule: 'EVERY_DAY', excludePublicHolidays: false }],
    publicHolidays: [], leaves: [],
    brandProcesses: [{ id: 's1', brandId: 'b1', processId: 'q1', calendarId: 'c1', minStaffing: 1, capacityWeight: 1,
      calendarOverrides: Array.from({ length: 30 }, (_, index) => index + 1).filter(day => day !== 2)
        .map(day => ({ date: `2026-11-${String(day).padStart(2, '0')}`, action: 'REMOVE' as const })) }],
    assignments: [
      { id: 'a1', employeeId: 'e1', brandProcessId: 's1', role: 'PRIMARY', priorityTier: 1 },
      { id: 'a2', employeeId: 'e2', brandProcessId: 's1', role: 'BACKUP', priorityTier: 2 },
    ],
  };
  return { format: 'datastraw-workspaces', schemaVersion: 1,
    workspaces: { default: { period, status: 'DRAFT', version: 1, dataset, solverConfig: config,
      allocations: [], baselineAllocations: [], publications: [] } } };
}
function library() { return JSON.parse(service.exportWorkspaceLibrary()); }
function seedEdit(edit: (document: ReturnType<typeof service.getOrCreateWorkspace>) => void) {
  const backup = library(); edit(backup.workspaces.default);
  return service.importWorkspaceLibrary(JSON.stringify(backup));
}
function command(command: ManagementCommand) { return applyManagementCommand('default', command); }
function unchanged(action: () => unknown) {
  const before = service.exportWorkspaceLibrary();
  expect(action).toThrow();
  expect(service.exportWorkspaceLibrary()).toBe(before);
}

beforeEach(() => {
  vi.restoreAllMocks();
  service.importWorkspaceLibrary(JSON.stringify(fixture()));
});

describe('active-month catalog CRUD', () => {
  it('adds, edits and removes an unreferenced employee without authorizing them', () => {
    let state = command({ action: 'create', kind: 'employees', input: { name: ' New person ', email: '', podId: 'p1', maxDailyCapacity: 0.5, preferredOffDay: 2 } });
    const added = state.dataset.employees.at(-1)!;
    expect(added.name).toBe('New person');
    expect(state.dataset.assignments.some(a => a.employeeId === added.id)).toBe(false);
    expect(state.problem.resources.find(r => r.id === added.id)?.capabilityIds).toEqual([]);
    state = command({ action: 'update', kind: 'employees', id: added.id, input: { name: 'Renamed', email: 'new@example.com', maxDailyCapacity: 0.75, preferredOffDay: 4 } });
    expect(state.dataset.employees.at(-1)).toMatchObject({ id: added.id, name: 'Renamed', maxDailyCapacity: 0.75, preferredOffDay: 4 });
    state = command({ action: 'remove', kind: 'employees', id: added.id });
    expect(state.dataset.employees.some(e => e.id === added.id)).toBe(false);
  });

  it('adds brands without hidden requirements, updates their staffing model, and removes them', () => {
    let state = command({ action: 'create', kind: 'brands', input: { name: 'New brand', podId: 'p1', staffingModel: 'SINGLE' } });
    const added = state.dataset.brands.at(-1)!;
    expect(state.dataset.brandProcesses).toHaveLength(1);
    state = command({ action: 'update', kind: 'brands', id: added.id, input: { name: 'Multi brand', staffingModel: 'MULTI' } });
    expect(state.dataset.brands.at(-1)?.staffingModel).toBe('MULTI');
    expect(command({ action: 'remove', kind: 'brands', id: added.id }).dataset.brands).toHaveLength(1);
  });

  it('adds, edits and removes processes with stable IDs', () => {
    const state = command({ action: 'create', kind: 'processes', input: { name: 'Returns', code: 'RET' } });
    const added = state.dataset.processes.at(-1)!;
    const edited = command({ action: 'update', kind: 'processes', id: added.id, input: { code: 'RMA', name: 'Returns handling' } });
    expect(edited.dataset.processes.at(-1)).toEqual({ id: added.id, code: 'RMA', name: 'Returns handling' });
    expect(command({ action: 'remove', kind: 'processes', id: added.id }).dataset.processes).toHaveLength(2);
  });

  it('adds pods with a real lead, allows replacement, and removes an empty pod', () => {
    let state = command({ action: 'create', kind: 'pods', input: { name: 'New pod', leadEmployeeId: 'e1' } });
    const added = state.dataset.pods.at(-1)!;
    state = command({ action: 'update', kind: 'pods', id: added.id, input: { name: 'Renamed pod', leadEmployeeId: 'e2' } });
    expect(state.dataset.pods.at(-1)?.leadEmployeeId).toBe('e2');
    expect(state.dataset.assignments).toHaveLength(2); // Leadership is not eligibility.
    expect(state.dataset.employees.find(e => e.id === 'e2')?.podId).toBe('p1');
    expect(command({ action: 'remove', kind: 'pods', id: added.id }).dataset.pods).toHaveLength(1);
  });

  it('uses ID-based relations when renaming in-use records', () => {
    const before = service.getOrCreateWorkspace();
    command({ action: 'update', kind: 'processes', id: 'q1', input: { code: 'CX', name: 'Customer care' } });
    command({ action: 'update', kind: 'employees', id: 'e1', input: { name: 'New lead name' } });
    const state = command({ action: 'update', kind: 'brands', id: 'b1', input: { name: 'Renamed brand' } });
    expect(state.dataset.assignments).toEqual(before.dataset.assignments);
    expect(state.dataset.brandProcesses).toEqual(before.dataset.brandProcesses);
    expect(state.dataset.pods[0].leadEmployeeId).toBe('e1');
  });
});

describe('reference-safe restricted removals', () => {
  it.each([
    ['employees', 'e1', /pod lead/],
    ['employees', 'e2', /eligibilities/],
    ['brands', 'b1', /service requirements/],
    ['processes', 'q1', /bundled-duty/],
    ['pods', 'p1', /employees/],
    ['brandProcesses', 's1', /eligibilities/],
  ] as const)('blocks referenced %s records with an explanation', (kind, id, reason) => {
    const state = service.getOrCreateWorkspace();
    expect(managementRemovalBlockers(state, kind, id).join(';')).toMatch(reason);
    unchanged(() => command({ action: 'remove', kind, id }));
  });

  it('blocks removal of a secondary bundled process, not just the primary process', () => {
    seedEdit(state => { state.dataset.brandProcesses[0].coveredProcessIds = ['q1', 'q2']; });
    unchanged(() => command({ action: 'remove', kind: 'processes', id: 'q2' }));
  });

  it('blocks removal of people with time-off records even without eligibility', () => {
    seedEdit(state => {
      state.dataset.assignments = state.dataset.assignments.filter(a => a.employeeId !== 'e2');
      state.dataset.leaves.push({ id: 'l1', employeeId: 'e2', leaveDate: '2026-11-03', leaveType: 'PLANNED', status: 'APPROVED' });
    });
    expect(managementRemovalBlockers(service.getOrCreateWorkspace(), 'employees', 'e2').join(';')).toContain('time-off');
    unchanged(() => command({ action: 'remove', kind: 'employees', id: 'e2' }));
  });

  it('counts both people and brands referencing a pod', () => {
    const reasons = managementRemovalBlockers(service.getOrCreateWorkspace(), 'pods', 'p1');
    expect(reasons.join(';')).toContain('2 employees');
    expect(reasons.join(';')).toContain('1 brands');
  });

  it('blocks both current allocations and pins without silently removing anything', () => {
    service.generateWorkspaceRoster();
    const allocation = service.getOrCreateWorkspace().allocations[0];
    expect(allocation).toBeDefined();
    seedEdit(state => {
      state.dataset.assignments = [];
      state.allocations[0].isLocked = true;
    });
    expect(managementRemovalBlockers(service.getOrCreateWorkspace(), 'brandProcesses', 's1').join(';')).toContain('current allocations');
    unchanged(() => command({ action: 'remove', kind: 'brandProcesses', id: 's1' }));
    unchanged(() => command({ action: 'remove', kind: 'employees', id: allocation.resourceId }));
  });

  it('protects baseline-only references even after current work is removed', () => {
    service.generateWorkspaceRoster();
    seedEdit(state => {
      state.baselineAllocations = structuredClone(state.allocations);
      state.allocations = []; state.dataset.assignments = [];
      state.dataset.pods[0].leadEmployeeId = 'e2';
    });
    expect(managementRemovalBlockers(service.getOrCreateWorkspace(), 'brandProcesses', 's1').join(';')).toContain('baseline allocations');
    unchanged(() => command({ action: 'remove', kind: 'brandProcesses', id: 's1' }));
    unchanged(() => command({ action: 'remove', kind: 'employees', id: 'e1' }));
  });

  it('removes unused eligibility and then an unused requirement without deleting its brand or process', () => {
    command({ action: 'remove', kind: 'assignments', id: 'a1' });
    command({ action: 'remove', kind: 'assignments', id: 'a2' });
    const state = command({ action: 'remove', kind: 'brandProcesses', id: 's1' });
    expect(state.dataset.brandProcesses).toEqual([]);
    expect(state.dataset.brands).toHaveLength(1);
    expect(state.dataset.processes).toHaveLength(2);
    expect(state.totalSlots).toBe(0);
  });

  it('blocks eligibility removal when allocated to that employee/service pair', () => {
    service.generateWorkspaceRoster();
    const allocation = service.getOrCreateWorkspace().allocations[0];
    const assignment = service.getOrCreateWorkspace().dataset.assignments.find(a => a.employeeId === allocation.resourceId)!;
    unchanged(() => command({ action: 'remove', kind: 'assignments', id: assignment.id }));
    seedEdit(state => { state.baselineAllocations = state.allocations; state.allocations = []; });
    unchanged(() => command({ action: 'remove', kind: 'assignments', id: assignment.id }));
  });
});

describe('atomicity, month scope and publication history', () => {
  it.each([
    { action: 'update', kind: 'employees', id: 'e1', input: { podId: 'missing' } },
    { action: 'update', kind: 'employees', id: 'e1', input: { maxDailyCapacity: 0 } },
    { action: 'update', kind: 'employees', id: 'e1', input: { preferredOffDay: 7 } },
    { action: 'update', kind: 'brands', id: 'b1', input: { podId: 'missing' } },
    { action: 'update', kind: 'processes', id: 'q1', input: { code: '' } },
    { action: 'update', kind: 'pods', id: 'p1', input: { leadEmployeeId: 'missing' } },
    { action: 'create', kind: 'pods', input: { name: 'Orphan pod', leadEmployeeId: '' } },
    { action: 'update', kind: 'brands', id: 'missing', input: { name: 'X' } },
    { action: 'remove', kind: 'processes', id: 'missing' },
  ] satisfies ManagementCommand[])('rolls back invalid command %# across the full library', invalid => {
    unchanged(() => command(invalid));
  });

  it('rejects unknown workspace targets without initializing or wiping any library entries', () => {
    unchanged(() => applyManagementCommand('missing', { action: 'remove', kind: 'processes', id: 'q2' }));
  });

  it('preserves all other-month drafts and history while reopening only the changed month', () => {
    service.generateWorkspaceRoster();
    expect(service.publishRoster('default').success).toBe(true);
    const archived = library();
    archived.workspaces['default:2026-11'] = structuredClone(archived.workspaces.default);
    const december = structuredClone(fixture().workspaces.default);
    december.period = { year: 2026, month: 12 };
    december.dataset.brandProcesses[0].minStaffing = 0;
    december.dataset.brandProcesses[0].calendarOverrides = [];
    archived.workspaces['default:2026-12'] = december;
    service.importWorkspaceLibrary(JSON.stringify(archived));
    const before = library();
    const snapshot = structuredClone(before.workspaces.default.publications);
    const version = before.workspaces.default.version;
    const state = command({ action: 'update', kind: 'employees', id: 'e1', input: { name: 'Revised name' } });
    expect(state.status).toBe('DRAFT');
    expect(state.version).toBe(version + 1);
    expect(state.publications).toEqual(snapshot);
    const after = library();
    for (const key of Object.keys(before.workspaces).filter(key => key !== 'default')) {
      expect(after.workspaces[key]).toEqual(before.workspaces[key]);
    }
    expect(state.allocations).toEqual(before.workspaces.default.allocations);
    expect(state.baselineAllocations).toEqual(before.workspaces.default.baselineAllocations);
  });

  it('does not reopen a publication or increment its version on a no-op edit', () => {
    service.generateWorkspaceRoster(); expect(service.publishRoster('default').success).toBe(true);
    const before = service.getOrCreateWorkspace();
    const state = command({ action: 'update', kind: 'employees', id: 'e1', input: { name: 'Lead' } });
    expect(state.status).toBe('PUBLISHED');
    expect(state.version).toBe(before.version);
  });

  it('removes current-month records even if immutable snapshots reference them, without damaging history', () => {
    // Publish an unused employee; it is safe to retire only from the new draft.
    const added = command({ action: 'create', kind: 'employees', input: { name: 'Never scheduled', email: '', podId: 'p1', maxDailyCapacity: 1, preferredOffDay: 0 } }).dataset.employees.at(-1)!;
    service.generateWorkspaceRoster(); expect(service.publishRoster('default').success).toBe(true);
    const snapshot = service.getOrCreateWorkspace().publications;
    const state = command({ action: 'remove', kind: 'employees', id: added.id });
    expect(state.status).toBe('DRAFT');
    expect(state.publications).toEqual(snapshot);
    expect(state.publications[0].dataset.employees.some(e => e.id === added.id)).toBe(true);
  });

  it('revalidates edits without regenerating work or silently dropping locks', () => {
    service.generateWorkspaceRoster();
    seedEdit(state => { state.allocations[0].isLocked = true; });
    const before = service.getOrCreateWorkspace();
    const allocatedId = before.allocations[0].resourceId;
    const state = command({ action: 'update', kind: 'employees', id: allocatedId, input: { maxDailyCapacity: 0.1 } });
    expect(state.allocations).toEqual(before.allocations);
    expect(state.violations.some(v => v.severity === 'BLOCKER')).toBe(true);
  });

  it('does not mutate caller input and returns detached canonical snapshots', () => {
    const input = { name: 'New process', code: 'NEW' };
    const state = command({ action: 'create', kind: 'processes', input });
    input.name = 'Changed outside'; state.dataset.processes.pop();
    expect(service.getOrCreateWorkspace().dataset.processes.at(-1)?.name).toBe('New process');
  });

  it('cannot override IDs through malformed runtime update payloads', () => {
    const state = command({ action: 'update', kind: 'employees', id: 'e1', input: { id: 'hijacked', name: 'Same identity' } } as unknown as ManagementCommand);
    expect(state.dataset.employees[0]).toMatchObject({ id: 'e1', name: 'Same identity' });
  });

  it('propagates canonical import rejection without partially mutating live records', () => {
    const before = service.exportWorkspaceLibrary();
    vi.spyOn(service, 'importWorkspaceLibrary').mockImplementationOnce(() => { throw new Error('Import rejected'); });
    expect(() => command({ action: 'update', kind: 'employees', id: 'e1', input: { name: 'Uncommitted' } })).toThrow('Import rejected');
    expect(service.exportWorkspaceLibrary()).toBe(before);
  });
});


describe('management integration edge cases', () => {
  it('preserves optional shift and rest configuration during unrelated edits', () => {
    const shift = { startMinute: 1320, endMinute: 360, timezone: 'Asia/Kolkata' };
    seedEdit(state => {
      state.dataset.brandProcesses[0].shift = shift;
      state.solverConfig.minimumRestMinutes = 480;
    });
    const state = command({ action: 'update', kind: 'brands', id: 'b1', input: { name: 'Renamed overnight brand' } });
    expect(state.dataset.brandProcesses[0].shift).toEqual(shift);
    expect(state.solverConfig.minimumRestMinutes).toBe(480);
  });

  it('can remove an existing employee after replacing leadership and unused eligibility', () => {
    command({ action: 'update', kind: 'pods', id: 'p1', input: { leadEmployeeId: 'e2' } });
    command({ action: 'remove', kind: 'assignments', id: 'a1' });
    const state = command({ action: 'remove', kind: 'employees', id: 'e1' });
    expect(state.dataset.employees.map(e => e.id)).toEqual(['e2']);
    expect(state.dataset.pods[0].leadEmployeeId).toBe('e2');
  });

  it('can remove an existing pod after explicitly moving its people and brands', () => {
    const added = command({ action: 'create', kind: 'pods', input: { name: 'Destination', leadEmployeeId: 'e2' } }).dataset.pods.at(-1)!;
    for (const id of ['e1', 'e2']) command({ action: 'update', kind: 'employees', id, input: { podId: added.id } });
    command({ action: 'update', kind: 'brands', id: 'b1', input: { podId: added.id } });
    expect(command({ action: 'remove', kind: 'pods', id: 'p1' }).dataset.pods.map(p => p.id)).toEqual([added.id]);
  });

  it('rejects duplicate generated IDs with the whole library untouched', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
    command({ action: 'create', kind: 'processes', input: { name: 'First', code: 'ONE' } });
    unchanged(() => command({ action: 'create', kind: 'processes', input: { name: 'Second', code: 'TWO' } }));
  });

  it('rolls back a real late canonical-import audit failure including all draft and publication data', () => {
    service.generateWorkspaceRoster(); expect(service.publishRoster('default').success).toBe(true);
    const before = service.exportWorkspaceLibrary();
    const bad = JSON.parse(before);
    bad.workspaces.default.publications[0].allocations[0].resourceId = 'missing-historical-person';
    // Simulate a library rejected only after import has rebuilt derived state.
    vi.spyOn(service, 'exportWorkspaceLibrary').mockReturnValueOnce(JSON.stringify(bad));
    expect(() => command({ action: 'update', kind: 'employees', id: 'e1', input: { name: 'Must not commit' } })).toThrow(/historical allocations/);
    expect(service.exportWorkspaceLibrary()).toBe(before);
  });
});
