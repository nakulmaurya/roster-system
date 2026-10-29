# Independent QA review — roster service

> **Final independent verification: PASS on the exercised local candidate.** All **127 unit/integration tests** passed (including **20/20 QA acceptance tests**), and all **21 production-browser tests** passed against `http://127.0.0.1:3200`. The six service findings and the eligibility UI finding below are historical pre-fix evidence; their acceptance reproductions now pass. No open blocker was established within this review's tested scope. This does not certify the candidate VM, deployment, or untested requirements.

Review date: 2026-10-29. Project: `/data/roster-improvement`.

## Outcome and scope

**Six reproducible service findings: two High, three Medium, one Low.** Seven failing acceptance assertions cover these six findings (the ID-collision and rollback assertions cover the same root cause). No Critical defect established.

This is a pre-fix service review. The parent was notified and is patching production concurrently; the failures below describe the observed implementation before those fixes, not a claim that they remain after patches. No subsequent service-source retest is claimed.

Only one project source file was added: `src/domain/roster/__tests__/qa-review.test.ts`. No existing test or production edits; no package/lockfile, Git, VM, or deployment actions. Logs are outside the project under `/data`. No old UI selectors were used as evidence.

### Actual execution

- Baseline `npm test`: **57/57 passed**, six existing files, duration 3.13s. Log: `/data/qa-baseline.log`.
- Final authorized QA file: **20 tests: 13 passing controls/characterizations, 7 failing acceptance tests**. Tests are intentionally left failing for the production owner to fix.
- Complete run `npm test` during concurrent work: **116 tests: 105 pass, 7 fail, 4 expected fail**, 8 files, duration 5.26s. A concurrently added `stress-review.test.ts` accounts for 39 cases and is not my work. The original six test files still passed. Log: `/data/qa-full-suite.log`.
- Earlier structured QA run (19 cases, before the final multi-resource control was added): `/data/qa-review-results.json`, 12 pass / 7 fail. Use the final suite log for the final count.
- No build/typecheck/lint, production-browser, or cross-month fatigue certification is implied by the service results.

Reproduce all QA acceptance failures:

```sh
cd /data/roster-improvement
./node_modules/.bin/vitest run src/domain/roster/__tests__/qa-review.test.ts
```

Reproduce one finding:

```sh
./node_modules/.bin/vitest run src/domain/roster/__tests__/qa-review.test.ts -t 'QA-08'
```

### Test setup shared by reproductions

The checked-in QA file defines the exact importable fixture: November 2026; one daily single-resource service `svc`; two eligible employees `a` and `b`, each daily capacity 1; one valid pod/calendar/brand/process; no leave; max six consecutive days. `beforeEach` imports only this fixture and generates a fully covered roster. No fixtures depend on prior test order or seed publication feasibility. `published()` asserts publication success before proceeding. Backup edits use JSON export/import, not direct mutation of internal derived validation.

## Ranked findings

| Rank | Severity | Tests | Finding |
|---|---|---|---|
| 1 | High | QA-01, QA-02 | Same-millisecond eligibility creation corrupts live dataset even though operation throws |
| 2 | High | QA-08 | Normal publication history outgrows import schema; application's own backup cannot restore |
| 3 | Medium | QA-03 | Invalid historical allocations accepted as publication history |
| 4 | Medium | QA-04 | Demoted imported publication can be republished with a duplicate version number |
| 5 | Medium | QA-09 | Repair with zero changes unpublishes a fully valid roster |
| 6 | Low | QA-06 | Invalid/mismatched publication timestamp accepted while retaining PUBLISHED |

### 1. High — colliding assignment IDs and non-atomic failure (QA-01 / QA-02)

Location observed: `service.ts`, `upsertAssignment` (ID generated as `asgn-dyn-${Date.now()}`; push happens before `toSchedulingProblem` validation).

**Exact repro:**

1. Initialize the shared fixture; remove eligibility `a/svc` and `b/svc` with `removeAssignment`.
2. Freeze `Date.now()` to `1793246400000` with Vitest `vi.spyOn(Date, 'now').mockReturnValue(...)`. This deterministically models two writes within one clock millisecond, rather than depending on machine speed.
3. `upsertAssignment('default', 'a', 'svc', 'PRIMARY')` succeeds.
4. Save `exportWorkspaceLibrary()`.
5. `upsertAssignment('default', 'b', 'svc', 'BACKUP')` throws.
6. Inspect exported dataset assignments after catching the exception.

**Expected:** Two valid requests get distinct IDs; if any request is rejected, the entire state remains unchanged.

**Actual:** The second request throws `Duplicate assignments ID: asgn-dyn-1793246400000`, but both entries remain in the live dataset with the same ID. The rejection is not rolled back. Subsequent generation/import of this data is subject to the same dataset-schema rejection. The problem/validation and mutated dataset can also diverge because rebuild threw before commit.

**Impact:** A supported manager edit can poison the current workspace and the resulting backup. Same-ms timing is deterministic in the test; no claim is made that every human click naturally triggers it.

**Proposed acceptance:** Use collision-resistant IDs; stage and validate a cloned dataset/problem before committing. Both QA-01 and QA-02 must pass. Rejected edits preserve dataset, derived state, publication status, and version. Add a uniqueness check after a batch of eligibility additions.

### 2. High — backup not restorable after 101 publications (QA-08)

Locations observed: `service.ts:publishRoster`, `validation.ts:workspaceDocumentSchema` (`publications.max(100)`).

**Exact repro:** From the fixture, run 101 iterations. Publish on the first iteration. On each subsequent iteration toggle the first allocation's lock, then publish again. All 101 publications succeed. Execute `importWorkspaceLibrary(exportWorkspaceLibrary())`.

**Expected:** Every library exported from supported service operations can be imported, with history preserved according to an explicit retention policy.

**Actual:** Publisher stores 101 snapshots; importer rejects the application's own backup for exceeding the 100-item `publications` maximum. No tampering, external payload, or excessive workspace count is required. The pre-existing workspace is not cleared by this schema rejection, but restore into a fresh session is unavailable.

**Impact:** Repeat review/revision cycles eventually produce unusable backups. This is a data-recovery reliability defect, not evidence of live data deletion.

**Proposed acceptance:** Align publication retention/export/import constraints. Prefer preserving the 101 valid snapshots or an explicit, documented archival policy; never silently emit an unimportable backup. The current test expects all 101 publications retained and a successful roundtrip. If product deliberately chooses bounded retention, agree that policy and update this acceptance explicitly rather than hiding history loss. Test both the documented limit and one beyond it.

### 3. Medium — unaudited historical snapshots (QA-03)

Locations observed: `validation.ts:publishedSnapshotSchema`; `service.ts:importWorkspaceLibrary`.

**Exact repro:** Publish fixture version 1; toggle a lock; publish version 2. Export JSON. Change only `workspaces.default.publications[0].allocations[0].resourceId` to `nonexistent`. Import.

**Expected:** Every stored historical snapshot is independently validated against its own dataset, month and solver rules. Invalid history is rejected atomically, or explicitly quarantined instead of presented as valid publication history.

**Actual:** Import succeeds. The first historical snapshot still references a nonexistent employee. Active version 2 is audited, but old historical allocation relationships/rules are not audited. Snapshot allocation fields pass shape validation, which does not verify those relationships.

**Impact:** History cannot be trusted for audit/review after restore even when the active roster is valid. This is not a cryptographic authenticity requirement: the demo is unauthenticated, and coherent user-edited JSON is not expected to prove provenance.

**Proposed acceptance:** Construct and audit each snapshot's scheduling problem, including eligibility, leave, workload and structural integrity. Reject the repro atomically (current test), or implement an agreed quarantine workflow with an explicit invalid-history state. Include a valid historical snapshot roundtrip control.

### 4. Medium — duplicate publication versions after import demotion (QA-04)

Locations observed: `service.ts:importWorkspaceLibrary` demotion branch, `publishRoster` snapshot append.

**Exact repro:** Publish version 1; export JSON. Set `workspaces.default.allocations[0].isLocked = true` without changing the corresponding snapshot. Import. The importer correctly changes status to DRAFT because allocations differ. Publish again.

**Expected:** The changed draft gets a fresh version; historical version 1 remains intact and version identifiers remain unique.

**Actual:** The importer keeps `version = 1` when demoting to DRAFT; publishing appends another snapshot with version 1. History versions become `[1, 1]`. A later restore searches history using `.find(p => p.version === state.version)`, so duplicate identifiers also make matching ambiguous.

**Proposed acceptance:** Imported draft version must exceed every preserved historical version whenever it represents changed publication content, or publisher must allocate the next unused version. The old snapshot must remain immutable; publish then export/import must remain PUBLISHED and history versions must be unique/monotonic.

### 5. Medium — zero-gap repair unpublishes unchanged roster (QA-09)

Locations observed: `service.ts:autoRepairAllGaps` unconditional commit; `commitWorkspace` PUBLISHED-to-DRAFT transition.

**Exact repro:** Publish the fully covered fixture. Record status/version. Call `autoRepairAllGaps()`.

**Expected:** `repairedCount = 0` is a no-op; a published, unchanged valid roster remains PUBLISHED at the same version.

**Actual:** Repair returns `repairedCount = 0`, allocations unchanged, but status becomes DRAFT and version increments from 1 to 2.

**Impact:** A harmless repeat action changes the operational publication state and creates unnecessary review/version churn.

**Proposed acceptance:** Only commit a draft edit when repair actually changes allocations. Revalidation may update derived fields but should not revoke publication without content/rule change or a newly detected blocker. Keep QA-09 alongside the idempotent-publish and successful-repair controls.

### 6. Low — malformed publication timestamp retained as PUBLISHED (QA-06)

Locations observed: `validation.ts` publication date fields accept arbitrary strings; `service.ts` import matching omits timestamp equality.

**Exact repro:** Publish fixture; export JSON; set `workspaces.default.publishedAt = 'not-a-date'`; leave snapshot timestamp valid and unchanged; import.

**Expected:** Malformed timestamp rejected atomically or workspace demoted/reconciled with its verified snapshot. A PUBLISHED state should not contain a different or invalid publication timestamp.

**Actual:** Import returns PUBLISHED with `publishedAt = 'not-a-date'`.

**Impact:** Broken or contradictory audit metadata and possible invalid-date displays in consumers; no demonstrated scheduling-rule bypass.

**Proposed acceptance:** Validate timestamp syntax for published snapshots and state, require state/snapshot publication timestamps to agree, and ensure a published document has its required timestamp. The repro must not retain PUBLISHED (current test); stricter rejection is also valid but would require changing the test to accept that policy.

## Verified safety controls (passing)

- Month switching restores original month-specific datasets and lock state rather than blending edits from the second month.
- Leap-February backup roundtrip preserves archived published month snapshots/status.
- Broken dataset relationships in an archived month reject the entire import without modifying existing workspace state.
- Falsified active allocation workload is revalidated, demotes publication, and blocks publication with structural integrity violations.
- A pin remains byte-for-byte present through a solver-rule regeneration; approved leave against that pin is exposed as `H1_UNAVAILABLE_RESOURCE` and blocks publication.
- Approved COMP_OFF removes unlocked work, creates the right off-day record, and a safe alternative fills the gap. Cancelling the leave removes its unavailability.
- Revoking eligibility exposes `H3_ELIGIBILITY` and reduces valid coverage; restoring eligibility removes that violation and restores coverage.
- Repair fills a missing seat while preserving other pins, and rerunning repair does not add more work.
- Increasing one date's staffing requirement to two is repaired with two distinct people and no blockers.
- Calendar removal retains an existing invalid pin visibly rather than dropping it silently; integrity violations block publication.
- Publishing twice is idempotent; an actual later lock edit creates version 2 and leaves the old snapshot unchanged.
- Reset is **active-month-only** (confirmed by the current reset confirmation copy); other months correctly retain their prior drafts. Do not report retained other-month drafts as a reset bug.

## Repair limits / non-findings

Revoking an employee's eligibility leaves their current work visible, including unlocked work. Auto-repair does not silently delete that invalid work. In the two-person fixture, after revocation and repair, coverage was 26/30 and `H3_ELIGIBILITY` persisted; publication stayed blocked. Source explicitly says not to delete invalid or locked work, so this is recorded as a workflow limitation, not an independently proven correctness defect. A manager must remove/replace invalid work or regenerate; UI must not describe gap fill as resolving **all** conflicts. No optimality or swap-search claim is made.

Cross-month fatigue-history loading remains an explicitly documented integration limitation, not a new finding here. No security/authentication or central persistence certification is implied by these tests.

## Follow-up

Production owner to apply fixes and rerun the authorized acceptance file plus baseline suite. This report remains a pre-fix evidence record. New-UI desktop/mobile smoke results, if performed, will be appended below separately with their own observations and scope.

## Acceptance-test maintenance requested by production owner

After the evidence runs above, the owner requested a detached-snapshot API contract. The QA file now re-reads `getOrCreateWorkspace()` after subsequent edits instead of relying on previously returned objects mutating in place. Assertions about actual current state, preserved pins, publication history, leave cancellation and eligibility remain intact. No fixture relies on editing a returned service state.

QA-02 now checks unchanged export **only if** the second same-ms operation is rejected. If it succeeds after a collision fix, it asserts two distinct valid eligibility IDs and successful regeneration. This avoids incorrectly requiring rollback for a newly valid successful operation. QA-06 still explicitly expects a recoverable DRAFT rather than an import exception for malformed active `publishedAt`.

These compatibility adjustments were not followed by another service run while the owner was actively patching production. The pre-fix test counts above remain the recorded observed results, not a post-fix certification. All acceptance tests remain active (not skipped or marked expected-fail).

## New UI independent smoke — desktop and 390px

Tested the newly served app at `http://127.0.0.1:3100` with sandbox-local Playwright/Chromium, fresh browser contexts, desktop **1440×1000** and mobile **390×844**, plus functional passes at 1440/390×900. No old E2E selectors or old UI source were used. This is a development-server smoke, not a deployment test. Source was changing concurrently; observations below are time-scoped to this run.

### UI-01 — Medium: eligibility editor silently changes a primary role on an unchanged save

**Reproduced on both widths.**

1. Start a fresh browser context on the new UI. The functional test also exercised switching from November 2026 to February 2028 and back first; no eligibility modifications were made during month switching.
2. Desktop: click `Workspace settings`. Mobile: `Open navigation` → `Workspace settings`.
3. Click section `Eligibility`.
4. Selected employee is `Aarav Sharma (Pod Lead)` (`emp-01`); selected service is `Apex Athletics · CS, ACC, NDR, RET`.
5. Observe `Current eligibility` is **Primary**, but the `Assignment role` combobox value is **BACKUP**.
6. Without editing any fields, click `Save eligibility`.
7. `Current eligibility` changes from **Primary** to **Backup**.

**Expected:** Selecting an existing authorization loads its current role. Saving without changing the form preserves that role.

**Actual:** The form defaults to BACKUP independently of the selected pair; unchanged save modifies authorization and future ranking policy.

**Proposed acceptance:** Synchronize the role control from the selected employee/service assignment when opening and whenever either selector changes. Use an explicit creation default only for a previously unassigned pair. Test an existing PRIMARY, BACKUP and RELIEF pair plus a new pair; unchanged save must preserve existing values.

**Evidence:** `/data/reviews/qa-ui-functional.json` contains the role input value and before/after Current eligibility text for both widths; screenshots `/data/reviews/qa-eligibility-before-1440.png` and `qa-eligibility-before-390.png` show the contradiction before save. Repro script: `/data/reviews/qa-ui-functional.cjs`.

### Smoke controls that passed

- All four new view buttons (`By brand`, `By person`, `By pod`, `By process`) were clickable and displayed their respective content on desktop and mobile.
- Week/Month toggles worked; February 2028 Month view had one label column plus **29 date columns**, final date **29 Tue**, on both widths.
- Month switching back restored the November view and edit-cell dialog could be opened for Apex, November 2.
- Desktop/mobile main document widths equalled viewport widths (1440/390), with roster overflow contained in its scrollable region rather than the full document.
- Mobile navigation opens and reaches Workspace settings. All seven settings section buttons were exercised on desktop. Settings rendered at both widths.
- Settings dialog had an accessible name and `aria-modal=true`; focus moved inside on open; first Tab remained inside; Escape closed the dialog. This is a narrow keyboard smoke, not a complete focus-trap or screen-reader audit.
- Date, search, pod/staffing filters and settings form controls inspected in the accessibility tree had programmatic names.
- Publish was disabled when the sample mandatory gap was unresolved.
- No uncaught `pageerror` was observed during the initial desktop pass or the desktop/mobile functional passes.

### Evidence and limitations

- `/data/reviews/qa-ui-smoke.cjs`, `qa-ui-observations.json`: responsive navigation/settings observations.
- `/data/reviews/qa-ui-functional.cjs`, `qa-ui-functional.json`: month and eligibility functional reproduction.
- Screenshots: `qa-desktop.png`, `qa-mobile.png`, `qa-settings-1440.png`, `qa-settings-390.png`, and the eligibility screenshots above.
- An initial mobile automation attempt tried the desktop settings button without opening the mobile menu and timed out; after inspecting the actual mobile accessibility tree, the corrected script used `Open navigation` and succeeded. That automation error is **not** a product defect.
- No full accessibility conformance, visual contrast, screen-reader usability, complete focus cycling, or touch-device certification is claimed. No additional accessibility defect was established by the exercised checks.
- No UI production file or pre-existing E2E test was modified. Browser contexts used local demo state only and were closed.

## UI-01 fix reverified — 2026-10-29 follow-up

At the production owner's request, reran the actual browser functional smoke on `:3100` in fresh desktop (1440px) and mobile (390px) contexts after the eligibility-role fix. **UI-01 no-op-save reproduction now passes on both widths.**

- Before save: Assignment role value = `PRIMARY`; Current eligibility = `Primary`.
- After clicking `Save eligibility` without editing any fields: Current eligibility remains `Primary`.
- No uncaught page errors in either context.
- The same browser pass again exercised leap-February month switching and opening the allocation-edit dialog.

Latest evidence: `/data/reviews/qa-ui-reverify.log` and `/data/reviews/qa-ui-functional.json`. The functional script overwrites its latest screenshots/JSON on repeat runs, so the `qa-eligibility-before-*` screenshots now show the **fixed** state. The original pre-fix console evidence has been preserved separately from the session tool result as `/data/reviews/qa-ui-functional-prefixed-evidence.txt` (pre-fix BACKUP selection, Primary→Backup on save). The earlier finding above is historical evidence, not an open issue after this recheck.

**Remaining UI blockers established by this review: none.** This is limited to the paths exercised, not a complete application acceptance or accessibility certification. No production or test files were edited during the recheck; service suites were not rerun while the owner was executing their full suite.


## Final independent verification — completed after production fixes

The owner supplied `/data/roster-final-check.log` and `/data/roster-final-production-e2e.log`. Those logs were inspected: they report successful lint/typecheck, 127 tests, a completed production build, and 21 successful browser tests. **In addition to reviewing those logs, this QA reviewer independently reran the unit suite and the full browser suite.** No production, source, configuration, package, or test file was edited during final verification.

### Independently executed results

| Check | Actual result | Evidence |
|---|---|---|
| `npm test` | **127/127 passed**, 9 files, 16.27s | `/data/reviews/qa-final-unit.log` |
| Authorized `qa-review.test.ts` within that run | **20/20 passed**, including every prior failing acceptance reproduction | Same unit log |
| Full existing Playwright suite against production server `:3200` | **21/21 passed**, 41.7s | `/data/reviews/qa-final-production-e2e.log` |
| Separate independent functional smoke against production `:3200` | Desktop 1440px + mobile 390px passed; no-op eligibility save retained PRIMARY; leap-February had 29 dates; allocation dialog opened; Escape closed settings; no uncaught page errors | `/data/reviews/qa-final-production-smoke.json` and `.log` |

Exact full browser command (read-only source/test use; generated artifacts outside the project):

```sh
cd /data/roster-improvement
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3200 CHROMIUM_PATH=/usr/local/bin/chromium \
  ./node_modules/.bin/playwright test --output=/data/reviews/qa-final-e2e-artifacts
```

The independently rerun production browser suite covered readable week/month/leap-year behavior, isolated browser-context workspaces, approved time-off persistence, explicit new-person eligibility, the PRIMARY no-op-save regression, backup roundtrip, process-bundle filtering, corrupt local-data preservation, quota-failure visibility, keyboard assignment-dialog traversal/focus restoration, invalid-holiday rollback, publication blockers and snapshot preservation, cross-tab conflicts, 390px/320px layout, cross-tab clear/removeItem handling, async-restore conflict confirmation, and settings/mobile-navigation focus restoration.

### Final disposition

- QA-01 / QA-02 (assignment ID collision and atomicity): **acceptance now passes**.
- QA-03 (historical snapshot allocation validation): **acceptance now passes**.
- QA-04 (version reuse after import demotion): **acceptance now passes**.
- QA-06 (malformed active publication timestamp): **recoverable-DRAFT acceptance now passes**.
- QA-08 (101-publication backup roundtrip): **acceptance now passes**.
- QA-09 (zero-change repair preserving publication): **acceptance now passes**.
- UI-01 (unchanged role save demoting PRIMARY): **independent desktop/mobile reproduction now passes**, and the full production regression suite passes.

**Recommendation:** No QA blocker remains established for this tested local candidate. Preserve the earlier reproduction details as regression rationale rather than deleting them or interpreting the pre-fix failure counts as the final result.

### Final limitations / handoff

- Lint, typecheck and production build success were verified by reading the owner's supplied check log; they were not independently rerun by this reviewer. Unit and production-browser results above **were independently rerun**.
- Candidate VM build/deployment was in progress according to the owner. This reviewer did not inspect or change the VM, deployment, Git, package files, or remote infrastructure. Local production success is not VM acceptance.
- Browser coverage uses Chromium automation, not a real touch device or assistive technology. Narrow keyboard/layout tests do not establish full WCAG compliance, contrast compliance, or screen-reader certification.
- Local browser state, publication snapshots and backup validation are demo behavior, not authenticated multi-user authorization or a central persistence audit. Structurally coherent edited backups cannot prove cryptographic provenance.
- The documented lack of automatic previous-month fatigue-history integration and lack of global optimality/swap-search guarantees remain limitations. Valid pins and invalid retained work still require explicit manager review rather than silent destructive repair.
- Tested history includes the specific 101-publication roundtrip; this is not an unbounded history, storage quota, browser memory or maximum-scale performance guarantee.
- No claim is made that every possible invalid payload, concurrency interleaving, configuration, browser, device, calendar boundary or business rule has been exhausted. The disposition is scoped to the recorded reproducible tests.
