# v040 — management workflows

Status: implementation complete; owned files frozen for parent integration.

## Owned changes

- `src/domain/roster/management.ts` — typed active-month catalog commands and reference blockers.
- `src/domain/roster/__tests__/management.test.ts` — 40 dedicated regression tests.
- `src/components/roster/CatalogManagement.tsx` — people, brands, processes, pods/leads, restricted requirement/eligibility removal.
- `src/components/roster/WorkspaceSettings.tsx` — replaces add-only People & brands section with Catalog & leads; preserves scheduling and OperationsSettings routing.

No edits to service, validation, engine, hook, dashboard, OperationsSettings, CSS, package files, dependencies, Git, or deployment.

## Integration contract

`applyManagementCommand('default', command)` accepts typed create/update commands for `employees | brands | processes | pods` and remove commands for those plus `brandProcesses | assignments`. `managementRemovalBlockers(workspace, kind, id)` returns readable reference counts/reasons for disabled removal buttons. Changes are executed inside the existing `run(callback, message)` bridge; success/reset waits for the boolean or Promise<boolean> acknowledgement. No localStorage, separate data store, or direct persistence bypass.

Commands read the complete canonical export, edit only the active default document, validate the resulting dataset and current/baseline allocation references, and invoke canonical atomic full-library import. The callback therefore returns the service's rebuilt canonical state and participates in the backend hook's persistence/rollback/CAS contract. Non-default targets are explicitly refused rather than returning a misleading active state.

## Safety and scope

- Stable IDs on update; create uses UUIDs. Invalid input, unknown records, invalid references, and duplicate IDs leave the entire live library unchanged.
- No hidden regeneration, eligibility grant, allocation deletion, cascade, or history cleanup. Current pins and baseline allocations are retained.
- Removal is restricted while referenced by eligibility, time off, pod leadership, pod membership, service requirements, bundled duties, or current/baseline allocations as applicable. UI explains why removal is disabled; domain checks again at execution time.
- Used baseline records deliberately cannot be deleted by this workflow. Keep them for this month; do not destroy baseline/history to make a remove button work.
- New unreferenced records can be removed immediately. Existing employees/pods can be removed after explicit safe reassignment/revocation. New brands intentionally start with no hidden service requirements; use Services, then Eligibility.
- Every pod must have an existing employee lead (existing schema). Leadership replacement is editable, does not move the employee, and grants no scheduling eligibility. To remove a lead, replace them first.
- A substantive edit to a published active document reopens it as DRAFT with a new version; snapshots stay immutable. No-op edits do not reopen it.
- Other-month catalogs/documents and publication snapshots are retained in the exported library, not reconstructed from the active workspace. Canonical scheduler import may revalidate adjacent work-history dependencies and reopen dependent publications; UI says so. Future newly opened months inherit the currently open month according to the existing service policy; edits are not silently global catalog migrations.
- Optional service shift metadata, solver minimum-rest settings, and pinned snapshot trailing context pass through canonical schemas untouched. Parent owns service shift editing in OperationsSettings.

## Verification

- Dedicated suite: **40/40 passed** (`npx vitest run src/domain/roster/__tests__/management.test.ts`, completed in 2.77s). Log: `/data/reviews/v040-workflows-tests.log`.
- Owned-file ESLint: clean (empty diagnostic log). Log: `/data/reviews/v040-workflows-lint.log`.
- Latest typecheck log has no diagnostics; earlier concurrent pass was blocked only by the parent-owned CloudCheck import, since fixed by parent. Parent should capture a serialized final typecheck exit status.
- Coverage includes CRUD for all four catalogs; lead replacement; useful removal after explicit safe reassignment; secondary bundle references; current/pinned/baseline-only records; service/eligibility removal; malformed and unknown targets; immutable IDs; duplicate-generated-ID rollback; reference validation; optional shift/rest preservation; snapshot/archive preservation; detached snapshots/input; revalidation without regeneration; no-op published edits; both mocked importer rejection and **real late historical-audit import failure rollback**.
- A full-suite invocation was inadvertently started immediately before the parent's stop request. It was terminated (including its npm/vitest process tree); its partial log is NOT a validation result. No further broad checks, build, DB tests, or browser tests run. Parent will perform serialized final integration checks.

## Parent follow-up

- Verify DB-backed CRUD acknowledgement and rejection rollback through the completed hook; domain tests do not substitute for live PostgreSQL integration.
- Check responsive rendering with existing quiet classes. No CSS changes or new dependencies were introduced.
- Existing Eligibility tab still uses the parent-owned revoke behavior (retains affected allocations for visible revalidation); the catalog's restricted eligibility deletion path instead refuses allocated/baseline-referenced pairs.
