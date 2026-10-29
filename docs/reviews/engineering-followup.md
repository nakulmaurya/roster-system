# Engineering follow-up — revised roster source

**2026-10-29. Read-only source review plus isolated in-memory reproductions and targeted checks against the existing `:3100` preview.** No production/tests/package/Git edits; no deployment. **This is not production-build or production-mode e2e sign-off.** Those remain pending.

## Improvements independently confirmed

- **E1:** Repeated the 201-character holiday-name failure: operation throws and the entire exported library is byte-for-byte unchanged. Subsequent valid-fixture publication succeeds. Publication now derives its problem from authoritative dataset/configuration.
- **E4:** Mutating a returned publication's allocations no longer changes stored history. Public command results/reads are detached.
- **E5:** Two new eligibility records at an identical mocked clock tick have unique IDs.
- **E6:** Cross-requirement bundle overlap is rejected with no library change.
- **E7:** A historical allocation referencing an unknown employee is rejected atomically. Source includes increasing/unique version checks, workspace-period checks, datetime validation and aligned publication-count limits.
- **E8:** Factory validation now supplies soft constraints to the independent auditor.
- **E9 mostly:** Replacement repair wording and requirement-derived labels correct the dashboard claims. `src/app/layout.tsx:6` still says “Enterprise Resource Scheduling”; change this metadata to match the browser-local demo limitation (remaining P2 wording issue).
- **E2 targeted preview check:** Invalid saved JSON remains exactly `{corrupt-original`; recovery/download-original controls appear without overwriting it.
- **E3 partial preview check:** Real keyboard cell activation opens the named dialog; Tab remains inside it. Modal bodies are now bounded/scrollable and background is inert. **Focus restoration still fails**, below.

Evidence: `engineering-followup-reproductions.json` and `engineering-followup-browser.json` in this directory. Browser probes used an isolated Chromium context at 390×844, not the full existing acceptance suite.

## Remaining concrete issues

### F1 — P2, but fails the agreed keyboard acceptance gate: Escape does not restore invoking-cell focus

**Files:** `src/components/roster/Dialog.tsx:19–20,37–41`; `src/components/RosterDashboard.tsx:104–105`.

**Reproduced in preview:** Focus the first `Edit Apex Athletics, CS, ACC, NDR, RET, 2026-11-01` button, press Enter, Tab, Escape. Dialog opens and Tab is contained, but `document.activeElement === invokingButton` is **false** after close. The effect captures/restores focus after the surrounding tree has been made inert; that timing does not reliably retain the invoker.

**Fix/acceptance:** Capture the actual trigger before applying inertness and restore after background is interactive. Repeat for cell, settings, navigation and changes dialogs; close by Escape and close button must both restore focus to an appropriate live trigger. Do not treat the current focus trap alone as complete E3 acceptance.

### F2 — P1 for the claimed cross-tab data-preservation workflow: `localStorage.clear()` bypasses editing pause and stale data is written back

**File:** `src/hooks/useRosterWorkspace.ts:33–36,53–57,69–78`.

**Reproduced in preview:** Two tabs in one isolated context. In tab B execute `localStorage.clear()`. Tab A shows **no** conflict notice (`StorageEvent.key` is `null`, which the handler ignores). Click Generate roster in tab A; it writes its stale library back into storage. Thus another tab's deletion is silently undone despite the new cross-tab protection. `persist` also unconditionally overwrites storage without comparing it to the last observed value, leaving a delivery-window race before a normal storage event is handled.

**Fix/acceptance:** Treat clear events affecting this local storage as changes; compare the current persisted value with the expected last-observed value before ordinary writes and pause on mismatch. Guard *all* normal write paths, not only `run`; explicit reset/restore may replace data only after an appropriately scoped replacement confirmation. Test clear, removeItem, normal key replacement, and external writes while a backup read is pending. A pre-write comparison narrows event-delivery races but is not a fully atomic multi-tab transaction; don't claim full conflict-free concurrency without a single-writer/locking protocol.

### F3 — P2: Caller-owned period argument still aliases authoritative state

**File:** `src/domain/roster/service.ts:164–186,622–634,742–743`.

**Reproduced in memory:**

```ts
const period = { year: 2028, month: 2 };
changeWorkspacePeriod('default', period);
period.month = 13;
// getOrCreateWorkspace().period.month === 13
// stored problem still begins 2028-02-01
```

The transaction clones existing state and its return value, **not the incoming period**. `getMutableWorkspace` stores the original argument. The initial `getOrCreateWorkspace(newId, period)` path has the same issue. This is an API ownership defect, not an observed normal dashboard interaction.

**Fix/acceptance:** Store the parsed/cloned period, never the caller's object. After mutating any command argument post-return, stored authoritative fields and derived problem must remain unchanged. Also note that `getOrCreateWorkspace` is a creating read outside the transaction wrapper; apply creation invariants/limits there if arbitrary IDs are supported.

## Release decision

**Hold final sign-off:** close F2 (or explicitly remove the stronger cross-tab preservation claim), satisfy F1's keyboard acceptance, and complete the final production build and production-mode browser suite. F3 is small and should be fixed now, but is not independently an ordinary-UI P1. No P0 found; the original partial-mutation/publication blocker is convincingly fixed by the exercised paths.

The synchronous transaction wrappers call private internal implementations rather than recursively entering the public wrappers; rollback and detached results work for the exercised error paths. I found no new reason to replace that architecture. This is not exhaustive proof over every mutation. Production personnel-use restrictions from the original review still apply.

---

## Latest targeted re-review — 2026-10-29, ~04:41 UTC

**This update supersedes the F1–F3 open-status and associated code-level hold above. No remaining concrete P0/P1 blocker found in the latest targeted paths. Final build/full-suite release evidence is still pending and has not been claimed passed here.**

Independently repeated isolated in-memory and `:3100` preview probes (no suite runs, no source/test/Git changes):

- **F1 closed for the reproduced path:** keyboard Enter opens the cell dialog, Tab is inside, and after Escape/full close focus returns to the exact invoking cell (`restoredToInvoker: true`). Source captures the invoker before inertness, retains it across dialog switches, and restores after cleanup via animation frame with a focusable heading fallback. Full settings/navigation/changes/mobile acceptance remains the release suite's responsibility.
- **F2 closed for the reproduced clear/stale-write path:** another tab's `localStorage.clear()` now produces the conflict banner; attempting Generate does **not** recreate the deleted key (`savedAgain: false`). Source handles clear/key removal, checks persisted value before mutation and ordinary writes, guards ordinary reset, and reconfirms replacement if storage changed while an async import read was pending. This is useful detection, not a claim of fully atomic multi-tab serialization.
- **F3 closed:** mutating the caller's period to month 13 after month change leaves stored period at February 2028 and derived horizon at `2028-02-01`. Both period entry points use parsed copies, and initial public creation now enters the transaction boundary.
- Metadata now explicitly describes a browser-local demo; the remaining E9 metadata wording issue is closed.
- Previous targeted E1/E4/E5/E6/E7 probes remain passing: rollback unchanged, detached publication reads, same-tick unique IDs, atomic overlap rejection and atomic invalid-history rejection.

Latest evidence: `engineering-final-reproductions.json`, `engineering-final-browser.json`. These are narrow checks against the existing preview, **not** a production build or production-mode full browser acceptance result. Do not reopen cosmetic/architectural work on the strength of this audit; finish the exact-revision release gates and retain the documented production-use restrictions.

---

## Bounded demo release verdict — final supplied validation evidence

**Approved for the fictional-data, browser-local demo scope, subject to deploying and verifying the same validated artifact.** No open concrete release-blocking defect remains from this audit. This supersedes the earlier pending-local-gates hold; it is **not** production personnel-system approval or deployment confirmation.

Reviewed `/data/roster-final-check.log`: final check records lint/typechecking, 127 passing unit/integration tests and a successful optimized Next.js production build. Reviewed `/data/roster-final-production-e2e.log`: **21/21 browser cases pass**; the requesting engineer identifies this as the exact-revision production-mode run on port 3200. Coverage includes recovery preservation, quota failure, mutation rollback, publication snapshots, cross-tab clear/removal, changed-library confirmation during async restore, keyboard focus restoration and 390/320px overflow checks. Reviewed `/data/roster-final-audit.json`: **zero reported dependency vulnerabilities** in that point-in-time audit, not a security certification. A CI workflow is present. These are reviewed execution records, not suites independently rerun by this reviewer.

The requesting engineer also reports inspection of final 1600/390/320px and settings/inspector/coverage screenshots, with no page overflow or page errors in exercised paths; this reviewer has not independently re-inspected that final screenshot set.

### Scope and operational conditions that remain

- **Browser-local storage only:** no connected central database or cross-device synchronization. Back up JSON; storage may be cleared, unavailable or full.
- **No authentication or authenticated/server-enforced publication:** use fictional data only. Local snapshots are not tamper-proof manager approvals.
- **Daily-capacity model:** no intraday shift overlap, travel/dependency or comprehensive contractual/labor-law validation.
- **Prior-month history is not loaded automatically:** fatigue checks only cover supplied history; do not claim automatic cross-month compliance.
- **Cross-tab protection is best-effort detection, not atomic localStorage transactions or general multi-user concurrency control.** The comparison/write sequence does not provide a full serialization guarantee.
- Generation is a deterministic greedy heuristic, not an optimality or infeasibility proof.

**Deployment still unverified:** the candidate VM build is reported in progress. No claim is made that it has completed, been installed/restarted, or is externally reachable. Before announcing availability, verify the deployed artifact matches the validated revision, perform the runtime smoke checks and external-URL check, and retain the limitations above in the demo handoff. No VM or deployment operations were performed by this reviewer.
