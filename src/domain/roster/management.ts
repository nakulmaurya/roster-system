/**
 * Active-month catalog commands. All writes cross the canonical atomic library
 * import boundary so a persistence-aware run(action, message) can commit them.
 * Other month drafts and immutable publication snapshots are never rewritten.
 */
import type { SeedDataset } from "./seed-data";
import type { RosterWorkspaceState } from "./service";
import { exportWorkspaceLibrary, importWorkspaceLibrary } from "./service";
import { datasetSchema, librarySchema } from "./validation";

export type CatalogKind = "employees" | "brands" | "processes" | "pods";
export type RemovableKind = CatalogKind | "brandProcesses" | "assignments";
export type CatalogRecord<K extends CatalogKind> = SeedDataset[K][number];
export type ManagementCommand =
  | {
      [K in CatalogKind]:
        | { action: "create"; kind: K; input: Omit<CatalogRecord<K>, "id"> }
        | {
            action: "update";
            kind: K;
            id: string;
            input: Partial<Omit<CatalogRecord<K>, "id">>;
          };
    }[CatalogKind]
  | { action: "remove"; kind: RemovableKind; id: string };

type ReferenceContext = Pick<
  RosterWorkspaceState,
  "dataset" | "allocations" | "baselineAllocations"
>;

/** Reasons are surfaced next to disabled remove buttons, and checked again at commit. */
export function managementRemovalBlockers(
  state: ReferenceContext,
  kind: RemovableKind,
  id: string,
): string[] {
  const d = state.dataset;
  if (!d[kind].some((record) => record.id === id))
    return ["This record no longer exists. Refresh the selection."];
  const reasons: string[] = [];
  const count = (n: number, label: string) => {
    if (n) reasons.push(`${n} ${label}`);
  };
  const allocationReferences = (
    predicate: (a: RosterWorkspaceState["allocations"][number]) => boolean,
  ) => {
    count(
      state.allocations.filter(predicate).length,
      "current allocations (including any pins)",
    );
    count(
      state.baselineAllocations.filter(predicate).length,
      "baseline allocations retained for comparison",
    );
  };
  switch (kind) {
    case "employees":
      count(
        d.pods.filter((p) => p.leadEmployeeId === id).length,
        "pod lead references; choose a replacement lead first",
      );
      count(
        d.assignments.filter((a) => a.employeeId === id).length,
        "eligibilities; revoke them first",
      );
      count(
        d.leaves.filter((l) => l.employeeId === id).length,
        "time-off records; resolve them first",
      );
      allocationReferences((a) => a.resourceId === id);
      break;
    case "brands":
      count(
        d.brandProcesses.filter((s) => s.brandId === id).length,
        "service requirements; remove them first",
      );
      break;
    case "processes":
      count(
        d.brandProcesses.filter(
          (s) => s.processId === id || s.coveredProcessIds?.includes(id),
        ).length,
        "service or bundled-duty references; remove or reconfigure them first",
      );
      break;
    case "pods":
      count(
        d.employees.filter((e) => e.podId === id).length,
        "employees; move them to another pod first",
      );
      count(
        d.brands.filter((b) => b.podId === id).length,
        "brands; move them to another pod first",
      );
      break;
    case "brandProcesses":
      count(
        d.assignments.filter((a) => a.brandProcessId === id).length,
        "eligibilities; revoke them first",
      );
      allocationReferences((a) => a.serviceId === id);
      break;
    case "assignments": {
      const assignment = d.assignments.find((a) => a.id === id)!;
      allocationReferences(
        (a) =>
          a.serviceId === assignment.brandProcessId &&
          a.resourceId === assignment.employeeId,
      );
      break;
    }
  }
  return reasons;
}

function assertAllocationReferences(state: ReferenceContext) {
  const employees = new Set(state.dataset.employees.map((e) => e.id));
  const services = new Set(state.dataset.brandProcesses.map((s) => s.id));
  for (const a of [...state.allocations, ...state.baselineAllocations]) {
    if (!employees.has(a.resourceId) || !services.has(a.serviceId)) {
      throw new Error(
        `Allocation ${a.id} has a missing employee or service. Resolve it before editing the catalog.`,
      );
    }
  }
}

/**
 * Deliberately restrict-only: no cascade, generation, allocation loss, or history
 * cleanup is hidden inside a catalog operation. IDs cannot change on update.
 */
export function applyManagementCommand(
  workspaceId: string,
  command: ManagementCommand,
): RosterWorkspaceState {
  const library = librarySchema.parse(JSON.parse(exportWorkspaceLibrary()));
  const state = library.workspaces[workspaceId];
  if (!state)
    throw new Error(
      "Unknown workspace. Open its month before editing the catalog.",
    );
  // Canonical importer returns the active workspace. Prevent misleading results
  // for callers that accidentally target an archived month/document.
  if (workspaceId !== "default")
    throw new Error(
      "Catalog management only supports the active default workspace. Open the desired month first.",
    );
  const before = JSON.stringify(state.dataset);
  const entries: Array<{ id: string }> = state.dataset[command.kind];
  if (command.action === "remove") {
    const blockers = managementRemovalBlockers(state, command.kind, command.id);
    if (blockers.length)
      throw new Error(
        `Cannot remove this record: ${blockers.join("; ")}. Nothing was changed.`,
      );
    entries.splice(
      entries.findIndex((record) => record.id === command.id),
      1,
    );
  } else if (command.action === "create") {
    entries.push({
      ...command.input,
      id: `${command.kind}-${crypto.randomUUID()}`,
    });
  } else {
    const index = entries.findIndex((record) => record.id === command.id);
    if (index < 0)
      throw new Error("This record no longer exists. Refresh the selection.");
    entries[index] = { ...entries[index], ...command.input, id: command.id };
  }
  state.dataset = datasetSchema.parse(state.dataset);
  assertAllocationReferences(state);
  if (
    JSON.stringify(state.dataset) !== before &&
    state.status === "PUBLISHED"
  ) {
    state.status = "DRAFT";
    state.version =
      Math.max(state.version, ...state.publications.map((p) => p.version)) + 1;
    delete state.publishedAt;
  }
  // Rebuilds the problem, off-days, coverage and validation; does not regenerate.
  // The import transaction validates the ENTIRE library before replacing it.
  return importWorkspaceLibrary(JSON.stringify(library));
}
