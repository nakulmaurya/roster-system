import { z } from "zod";
import { librarySchema } from "@/domain/roster/validation";
import {
  exportWorkspaceLibrary,
  importWorkspaceLibrary,
  resetWorkspaceToDemo,
  publishRoster,
  RosterWorkspaceState,
} from "@/domain/roster/service";
import { HttpError, reject } from "./errors";
import { canonical } from "./canonical";

export type Library = z.infer<typeof librarySchema>;
export type Document = Library["workspaces"][string];
const empty: Library = {
  format: "datastraw-workspaces",
  schemaVersion: 1,
  workspaces: {
    default: {
      period: { year: 2026, month: 11 },
      status: "DRAFT",
      version: 1,
      dataset: {
        pods: [],
        employees: [],
        processes: [],
        calendars: [],
        publicHolidays: [],
        brands: [],
        brandProcesses: [],
        assignments: [],
        leaves: [],
      },
      solverConfig: {
        maxConsecutiveDays: 6,
        enforcePodAffinity: true,
        honorPreferredOffDay: true,
        preferPrimaryContinuity: true,
      },
      allocations: [],
      baselineAllocations: [],
      publications: [],
    },
  },
};
const blank = JSON.stringify(empty);

/** NEVER await inside this bridge. Import/apply/export/finally-clear is one synchronous JS turn.
 * No per-request domain store survives an asynchronous boundary, including errors. */
function bridge<T>(
  library: Library,
  action: (state: RosterWorkspaceState) => T,
): T {
  try {
    const state = importWorkspaceLibrary(JSON.stringify(library));
    return action(state);
  } finally {
    importWorkspaceLibrary(blank);
  }
}
export function seedLibrary(): Library {
  return bridge(empty, () => {
    resetWorkspaceToDemo();
    return JSON.parse(exportWorkspaceLibrary()) as Library;
  });
}
export function periodKey(doc: Document) {
  return `${doc.period.year}-${String(doc.period.month).padStart(2, "0")}`;
}
export function parseLibrary(input: unknown): Library {
  const raw: unknown = typeof input === "string" ? JSON.parse(input) : input;
  const library = librarySchema.parse(raw);
  const docs = Object.values(library.workspaces);
  if (!library.workspaces.default || docs.length > 24)
    reject(
      422,
      "LIMIT",
      "An active workspace and at most 24 month documents are required.",
    );
  for (const doc of docs) {
    if (
      doc.dataset.employees.length > 300 ||
      doc.dataset.brandProcesses.length > 150 ||
      doc.dataset.assignments.length > 6000 ||
      doc.allocations.length > 12000 ||
      doc.publications.length > 100
    )
      reject(422, "LIMIT", "Workspace exceeds server assessment limits.");
  }
  return library;
}
export function hydrate(library: Library) {
  return bridge(library, (state) => ({
    library: exportWorkspaceLibrary(),
    workspace: state,
  }));
}
function content(doc: Document) {
  return canonical({
    period: doc.period,
    dataset: doc.dataset,
    solverConfig: doc.solverConfig,
    allocations: doc.allocations,
  });
}
/** Validate proposals as draft edits only; all history and publication authority stays here. */
export function applyProposal(
  current: Library,
  proposed: Library,
  publish: boolean,
) {
  const byPeriod = new Map<string, Document>();
  // Active document is authoritative over any stale archived alias of its month.
  for (const doc of Object.values(current.workspaces))
    byPeriod.set(periodKey(doc), doc);
  byPeriod.set(
    periodKey(current.workspaces.default),
    current.workspaces.default,
  );
  const nextByPeriod = new Map<string, Document>();
  for (const [id, proposal] of Object.entries(proposed.workspaces)) {
    const key = periodKey(proposal);
    const old = byPeriod.get(key);
    if (canonical(proposal.publications) !== canonical(old?.publications ?? []))
      reject(
        422,
        "HISTORY_IMMUTABLE",
        "Published history cannot be inserted, altered or removed by a client.",
      );
    const unchanged = old && content(old) === content(proposal);
    const doc: Document = {
      ...proposal,
      publications: structuredClone(old?.publications ?? []),
      status: unchanged ? old.status : "DRAFT",
      version: old
        ? unchanged
          ? old.version
          : Math.max(old.version, ...old.publications.map((p) => p.version + 1))
        : 1,
      publishedAt: old?.publishedAt,
      baselineAllocations: structuredClone(
        old?.baselineAllocations ?? proposal.allocations,
      ),
    };
    // default wins; ignore stale month alias submitted by older service versions.
    if (id === "default" || !nextByPeriod.has(key)) nextByPeriod.set(key, doc);
  }
  // Never delete old months via a client library replacement (including backup restore/reset).
  for (const [key, old] of byPeriod)
    if (!nextByPeriod.has(key)) nextByPeriod.set(key, old);
  const activeKey = periodKey(proposed.workspaces.default);
  const workspaces: Record<string, Document> = {};
  for (const [key, doc] of nextByPeriod)
    if (key !== activeKey) workspaces[`default:${key}`] = doc;
  workspaces.default = nextByPeriod.get(activeKey)!;
  const next = parseLibrary({ ...current, workspaces });
  try {
    return bridge(next, (initialState) => {
      let workspace = initialState;
      if (publish) {
        if (
          initialState.status !== "PUBLISHED" &&
          initialState.publications.length >= 100
        )
          reject(
            422,
            "PUBLICATION_LIMIT",
            "This month has reached the server limit of 100 publications. Existing history is preserved; use another month.",
          );
        const result = publishRoster("default");
        if (!result.success) reject(422, "PUBLICATION_BLOCKED", result.message);
        workspace = result.state;
      }
      return {
        library: JSON.parse(exportWorkspaceLibrary()) as Library,
        workspace,
      };
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    reject(
      422,
      "DOMAIN_VALIDATION",
      "Proposed workspace failed independent domain validation.",
    );
  }
}
