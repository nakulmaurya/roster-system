# Independent engineering-manager review

**Project:** `/data/roster-improvement`  
**Reviewed:** 2026-10-29, approximately 04:17–04:22 UTC.  
**Decision:** **Do not release the current revision without fixing the P1 defects below.** No P0 found. A fictional-data, explicitly browser-local demo is a reasonable release target; a production personnel-management system is not.

## Scope and evidence

Read README, AGENT_HANDOVER, APPROACH, engine types/solver/calendar/demand/integrity/constraints/repair/factory, domain adapter/service/validation/seed/schema, both components, app CSS/layout, build/test configuration and existing tests. Dashboard is being replaced concurrently: UI references below describe the baseline inspected, **not a claim about the replacement**. Preserve the listed contracts in the new implementation and rerun acceptance against the completed revision.

No production code, package files, existing tests, Git operations, deployment or VM changes. Ran isolated in-memory service reproductions using a temporary TypeScript transpilation harness; results are in `/data/reviews/engineering-reproductions.json`. Check logs are alongside this review.

### Checks actually run

- `npm test`: **57 tests passed in 6 files**, exit 0.
- `./node_modules/.bin/tsc --noEmit --incremental false`: **passed**, exit 0. Disabled incremental output to avoid touching the project's build-info file.
- `npm run lint`: **passed**, exit 0.
- **Did not run a production build or browser tests**: avoid competing with the concurrent dashboard work and altering `.next`/test artifacts. Existing `.next` output is not evidence that the final revision builds. Browser/UI defects below are source-confirmed unless explicitly described as reproduced.

Passing current checks does not cover the reproduced failed-mutation/publication, reference-ownership, ID-collision, bundle-overlap or historical-import cases.

## Ranked findings

### P1 — E1: Failed configuration mutation corrupts live state; publication validates an obsolete problem

**Locations:** `src/domain/roster/service.ts:680–687` (`updateHoliday`), `:95–98` (`refreshValidation`), `:559–576` (`publishRoster`). Similar mutation-before-derivation patterns exist at `:247–265`, `:450–465`.

**Reproduced:** Begin with the seed dataset with leave removed, regenerate, and verify 100% coverage/zero blockers. Call:

```ts
updateHoliday('default', '2026-11-03', 'x'.repeat(201));
```

It throws when the adapter invokes the dataset schema (name maximum 200), **after** changing the stored holidays. The stored dataset now fails `datasetSchema.safeParse`, but `publishRoster('default')` returns `success: true`, status `PUBLISHED`. The previous `problem` remains in place because assignment of the new problem never completed. Publication audits that previous problem, then snapshots the invalid new dataset. This creates a published backup that cannot be restored through normal schema validation.

**Reachability:** OperationsSettings holiday input has no maximum length (`OperationsSettings.tsx:104–105`); its catch displays an error but cannot roll back the service's prior mutation.

**Fix:** Treat configuration mutations as transactions: clone authoritative state, validate input and whole dataset, derive problem, audit candidate allocations, then replace the store in one commit. Invalid schedules may intentionally remain as flagged drafts; malformed configuration or a thrown operation must not partially commit. Publication must revalidate the authoritative dataset/config/period and derive a fresh problem, rather than trusting cached `state.problem`.

**Acceptance:** The above failure leaves serialized state, status, version, snapshots, problem, allocations and metrics unchanged. Publication cannot succeed on any schema-invalid authoritative dataset or when a newly derived problem has blockers. Add equivalent rollback tests for brand creation/eligibility/configuration exceptions.

### P1 — E2: Failed local restore immediately overwrites the user's only saved data

**Locations:** baseline `src/components/RosterDashboard.tsx:75–95`.

**Source-confirmed reproduction:** Put invalid JSON (or a previously saved backup no longer accepted by the schema) at `datastraw-workspaces-v1`, then reload. Restore catches the failure and leaves the demo state active, but unconditionally sets `ready=true`. The autosave effect runs and writes `exportWorkspaceLibrary()` over the failed input. Recovery evidence is lost despite a warning saying only that restore failed. After a prior in-memory workspace exists, the replacement may be that workspace instead of pristine seed; either way it overwrites the failed input.

**Fix:** Separate hydration completion from permission to write. Quarantine/preserve the original raw value; do not autosave after restore failure until the user explicitly chooses reset or successfully imports a replacement. Offer download of the failed raw value. A save failure must remain visibly unsaved.

**Acceptance:** A reload with malformed, schema-incompatible and oversized stored backups leaves the original bytes untouched. User can download them and explicitly reset. Successful restore produces no baseline write before restoration. Test normal empty-storage initialization separately. This contract is required in the replacement dashboard too.

### P1 — E3: Core roster editing is not keyboard accessible; overlays lack modal contracts

**Locations:** baseline `RosterDashboard.tsx:793–803` clickable `<td>`; `:855–871` cell overlay; `:1012–1026` settings overlay; manual employee select `:982–993`. Existing e2e configuration only exercises a 1440×1000 viewport (`playwright.config.ts:6`).

**Source-confirmed:** Active cells have `onClick` but no focusable button or keyboard activation, so a keyboard-only manager cannot open the edit workflow. Cell/settings overlays have no named dialog semantics, focus containment, Escape handling or focus restoration. Several icon-only closes lack accessible names. Cell-overlay content has neither bounded height nor its own vertical overflow (`:858`, `:874`), making long candidate lists unsafe on short viewports. Actual clipping on a device was not browser-tested.

**Fix:** Use actual buttons in cells (or a fully implemented accessible grid), named dialogs, managed focus, Escape/close, background inertness for modal overlays, labelled controls and a bounded scrolling body. Do not just add `role="button"` without keyboard behavior.

**Acceptance:** Keyboard-only user can open a named brand/date cell, select candidate, assign, remove/pin work, close using Escape and return focus to the invoking cell. Tab cannot escape a modal. Test 390×844 and 320×568, 200% zoom, and a long candidate list; controls and close remain reachable without whole-page horizontal overflow (the roster matrix may independently scroll). Apply this to the replacement, not a throwaway patch to the old UI.

### P2 — E4: Published snapshots are detached from drafts but remain publicly mutable through service references

**Locations:** `service.ts:56–62`, `:140–145`, `:178–179`, `:575–578`; mutation methods likewise return internal state. `getOrCreateWorkspace` hands callers the store-owned object and mutable publications array.

**Reproduced:** Publish a valid seed fixture (685 allocations). Execute `getOrCreateWorkspace().publications[0].allocations.pop()`. The next service read contains 684 historical allocations while status remains `PUBLISHED`. The publication clone correctly prevents ordinary draft edits from changing history, but does not provide an immutable public snapshot boundary. Current tests deliberately mutate returned state, reinforcing this ownership leak.

This is an accidental-integrity/API-contract issue, **not a claim that local data can be made tamper-proof against the browser owner**. README already disclaims authenticated/tamper-proof approval.

**Fix/acceptance:** Keep a private authoritative store; return detached read snapshots or appropriately immutable data, including nested publications. A mutation to an object returned to UI/test code must not affect stored history. Prefer readonly TypeScript contracts plus runtime detachment/freezing as appropriate; TS alone does not prevent reference mutation. Replace fixture setup through live references with explicit fixture/import construction.

### P2 — E5: Eligibility IDs collide within a millisecond and leave a broken dataset after throwing

**Location:** `service.ts:450–465`, especially `:455` using `asgn-dyn-${Date.now()}`.

**Reproduced:** Freeze `Date.now` to one value and add two different employee/service eligibility pairs through `upsertAssignment`. Both records get the same ID; second adapter validation throws and **both records remain**. Dataset schema subsequently rejects the workspace. Fast programmatic/batch use makes this possible; ordinary deliberate human clicks are less likely to share a millisecond.

**Fix/acceptance:** Use `crypto.randomUUID()` as other record creators do, plus the E1 atomic boundary. Multiple upserts in the same clock tick all have unique IDs; any rejected operation leaves state unchanged.

### P2 — E6: Bundle editing bypasses the domain's existing process-ownership guard

**Locations:** `validation.ts:53–56`; `service.ts:632–640` versus explicit duplicate guard `:695`; `OperationsSettings.tsx:72–76`.

**Reproduced:** For seed `brand-17`, update `bp-brand-17-cs` to cover both its CS process and the process of `bp-brand-17-acc`. Existing ACC requirement remains. Schema accepts the resulting overlapping duties. The same duplication is explicitly prohibited by `addProcessToBrand`, so the two management paths enforce inconsistent rules. Duty is now represented in both a bundle and separate requirement, affecting capacity and staffing demand.

**Fix/acceptance:** If each brand/process is intended to have one owning requirement (as the add-process guard says), enforce it in whole-dataset validation, imports and every update, not only one UI action. Reject overlap atomically; splitting a duty should explicitly move it between requirements. If overlapping queues are intended, model/name them as distinct queues rather than silently treating the same catalogue process as two owners.

### P2 — E7: Backup validation does not audit historical published allocations or snapshot version uniqueness

**Locations:** `validation.ts:67–76`; `service.ts:661–673`.

**Reproduced:** Export a valid published fixture; set current document status to `DRAFT`; change one historical snapshot allocation's `resourceId` to `unknown`; import. Import succeeds and preserves that invalid record as publication history. Each snapshot dataset is reference-checked, but its allocations are only shape-checked. Only current state is independently audited, and only the matching active publication is compared. `.find` also accepts duplicate snapshot versions without a uniqueness invariant.

**Impact:** “Validated backup”/historical publication integrity is weaker than it sounds; this is not authentication or tamper detection.

**Fix/acceptance:** For every imported publication, rebuild its own period/problem/config and independently validate its allocations. Reject malformed history (or explicitly quarantine/label unverified imported history rather than retaining a published presentation). Enforce unique, coherent snapshot versions. Import remains atomic across all workspaces and history. Also align creation/retention with the schema's maximum 100 publications: current publisher can append beyond a backup the importer accepts.

### P2 — E8: Normal validation silently drops all soft-preference warnings

**Locations:** `solver.ts:262–264`; `index.ts:38–39`; `repair-advisor.ts:219–224`; `service.ts:95–98`.

**Source-confirmed:** Generation evaluates soft constraints; `scheduler.validate` runs only hard constraints. Every service refresh replaces violations with this hard-only list. A simple edit removes warnings about preferred off-days without changing the allocation responsible. Backup restore likewise drops them. Conversely, toggling a lock does not refresh, so warning presence depends on the chosen operation.

**Fix/acceptance:** Make audit output explicit: either hard-only blockers plus a separately recomputed soft-warning stream, or full validation evaluating soft constraints consistently. Do not imply an edit resolved a warning by making it disappear. Regression: generation, harmless edit and export/import retain the same warning for the same unchanged preference violation. Warning-only schedules can still publish.

### P2 — E9: Some UI claims overstate what the engine did

**Locations:** baseline `RosterDashboard.tsx:164–169`, `:767`, `:1265–1269`; `src/app/layout.tsx:6–8`.

- Auto-repair `repairedCount` counts **allocations added**, not fully resolved slots/conflicts; candidates can be PRIMARY or BACKUP, not necessarily relief. A two-person gap may receive two additions; a still-understaffed slot may receive one. “N gaps resolved with relief staff” is false in those cases.
- Hard-coded “1-Primary (80%)” is not derived from configured staffing/workload or a demonstrated 80% metric.
- “All brands satisfy ... labor constraints. Safe to publish!” lacks the documented within-month/daily-model qualification; absence of local blockers is not labor compliance or operational safety.
- Page metadata calls it “Enterprise Resource Scheduling” despite explicitly local demo storage/authentication limitations.

**Acceptance:** Say “N allocations added; M gaps / K blockers remain,” and display the actual role/configuration. Use “passes configured daily checks for supplied history” rather than general compliance/safety. Keep browser-local/no-auth/no-cross-month-history limitations visible and consistent with README. Reassess these strings in the replacement UI.

## What is sound; do not replace without evidence

- Engine is actually separated from React/Next/Zod/ORM and uses generic resource/service contracts. A second-domain fixture exists.
- Structural and hard-constraint auditing are separate from candidate generation; mandatory blockers affect statuses and publication. Distinct-person coverage, capability, availability and capacity accounting are substantially better than raw allocation counts.
- Invalid pins are preserved and surfaced, not silently deleted. Manual invalid edits being retained as visible draft conflicts is intentional, not by itself a defect.
- Snapshot cloning already isolates ordinary draft changes from publication history. Strengthen ownership; don't discard the workflow.
- Import constructs a new map before replacing the existing one; preserve that useful atomic pattern and extend its validation.
- README/approach accurately disclose greedy/no-backtracking/no-optimality, daily capacity not intraday shifts, browser-local not connected PostgreSQL, and missing automatic previous-month context. These limitations are **not newly discovered regressions**.
- No proof found of a wrong mandatory engine result for well-formed normal input under the configured rules. Do not claim a P0 or blame a greedy unresolved gap on an engine “infeasibility bug.”

## Optional refactors, not release defects

- Factor a pure candidate-state mutation/derivation helper and a repository boundary to eliminate repeated boilerplate. Specific architecture/library choices are optional; rollback and ownership behavior are not.
- Break dashboard display/filter/dialog/persistence responsibilities into small components/hooks once the replacement stabilizes. Line count alone is not a defect.
- Reuse context/index construction between generator, audit and repair to reduce divergence; optimize coverage lookups only after measuring.
- Consider cross-tab conflict detection or a documented single-tab mode. README already discloses unmerged same-origin tabs; don't present absent central concurrency as a newly discovered local demo regression.
- ORM tables are a future integration sketch, not a production-ready repository: no migrations/client; bundled processes/overrides/history need persistence design and tenancy constraints before wiring up. Adding a database dependency alone solves none of this.
- No need for backtracking, virtualization, a state-management framework or a server rewrite solely to fix the P1 items.

## Release gates and acceptance checklist

### Fictional-data demo

1. **Must fix E1 and E2.** Add failing-before/passing-after regression coverage for both. No error handler may leave partial authoritative configuration changes; no hydration error may destroy the original backup.
2. **Must satisfy E3 for the replacement UI**: real keyboard cell actions, named focus-managed dialogs, narrow/short viewport acceptance. Accessibility is a functional contract, not styling polish.
3. Address E4–E9 now where practical; explicitly track remaining P2s. Do not retain an unqualified “immutable snapshots” promise if callers still own live references. Correct misleading UI wording before publishing the demo.
4. Once concurrent edits stop, run `npm run check` on the **exact final revision** and production-mode browser acceptance. Existing unit success or old build artifacts are not release proof.
5. Add e2e coverage for failed local restore preservation, storage quota failure, manual keyboard editing, blocker-gated publication, draft-after-publication with unchanged historical content, rollback of invalid holiday input, import rejection and mobile dialogs. Existing e2e tests cover useful happy paths but not these gates.
6. `npm run check` currently omits e2e (`package.json:15–16`) and lint only targets `src`; execute e2e as a separately recorded gate. No CI workflow was found in the inspected tree; an enforced pipeline or reproducible recorded manual release checklist is acceptable for the demo.
7. Verify backup export/import after the final build, error and unsaved-state messaging, external application URL and submission artifacts. Do not infer external reachability from localhost. No deployment was attempted in this audit.

### Real personnel / production use

**Not approved.** Central authenticated persistence, access control, durable versioned transactions/concurrency, appropriate transport/deployment, and actual contractual shift/rest/history requirements need implementation and verification. The current schema-only database, browser-editable publication and monthly daily-capacity checks cannot be presented as meeting those requirements. This is a scope/release restriction already acknowledged by the documentation, not a demand to implement an enterprise platform during the dashboard redesign.
