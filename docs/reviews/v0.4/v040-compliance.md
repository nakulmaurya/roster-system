# v0.4 independent assessment / engineering gate — current-turn review

**Final verdict: functional assessment core and point-in-time public access PASS within documented v0.4 scope; full submission INCOMPLETE.** Read-only review of final check3, public-browser, actual app/DB restart and now-completed backup/restore logs closes the earlier functional evidence hold. No reviewer tests, processes or deployment actions. Temporary hosting and applicant artifact gaps remain explicit; no enterprise/legal certification.

## Final runtime-evidence follow-up — supersedes provisional status below

Inspected `/data/roster-v040-final-check-3.log`, `/data/roster-v040-public-e2e.log`, `/data/roster-v040-restart.log`, `/data/roster-v040-backup.log`, current URL file, deployed release record and matching realistic-publication assertion. These are supplied parent executions, not reviewer reruns.

- **213/213 tests across 14 files**, final chained lint/types/build complete. Includes backend17 (15 enabled actual-PG cases + two policy cases) and the added idle-pool recovery regression. New `db.ts` handles idle PG error events without process crash or sensitive diagnostic logging.
- **27/27 public HTTPS browser cases, 2.8m, no skips**, including actual viewer, role/CSRF/Origin rejection, competing CAS writes, isolation, stale-tab protection, durable leave, process filters, shift save, responsive dialogs and manual changes.
- **Realistic publication evidence gap CLOSED:** final browser assertion retains 30 employees,20 brands,>600 demand slots, all original brand-process requirements, and>600 published allocations. Explicit BACKUP authorization of an existing unused person resolves a real gap; publish succeeds without demand deletion or staffing reduction. Manual removal then returns draft while prior snapshot is identical. Public tests also reject invalid/forged publication and tampering.
- **Actual app restart PASSED:** saved server session/revision/sentinel retained. **Actual PG cluster restart PASSED:** app process survived, saved state/session recovered. This is stronger than earlier pool reconnect alone; not a guarantee all in-flight writes survive outages.
- **Backup no longer pending:** log explicitly ends “Backup created and disposable database restore completed”; timer active, mode0600 dump638678 bytes,29 restored workspaces. Credits one completed restore and enabled scheduling, not future daily success/offsite DR or full field-level restore equivalence.
- Public app verified by supplied logs at **https://thank-consumption-motivation-seniors.trycloudflare.com**. Temporary Quick Tunnel, no SLA, may change/stop on recreation; keep operational review-period ownership. Previous allocated-only hostname is superseded.
- Release record reports dedicated rosterapp, root-owned release, loopback app/DB and Secure production HTTPS cookies. Cookie/API behavior is tested; OS privilege/config details are operator records, not a separate independent host audit.
- Supplied deployed checksum record says **exit0**; reviewer did not independently retrieve remote files. Final observed sorted source/script/migration checksum-list digest is `ee3b52d0221461319bbf5af42037cefa330e8b3e7c2c3cd07e17e0d579051c97`, superseding the pre-pool-fix digest. Package/lock hashes unchanged. Use complete release manifest for reproducibility.

### Final gate separation

1. **Functional assessment core + public testability: PASS** with configured policy, greedy algorithm, recorded-history and deployment bounds. Specialized interval/history permutations have domain-test evidence; not every possible UI/legal scenario was exhaustively exercised.
2. **Applicant submission: INCOMPLETE; video gate now complete on supplied evidence.** GitHub repository and LinkedIn URL absent. Inspected video metadata:236.2seconds,2,139,442bytes; decode log is empty and parent explicitly reports full ffmpeg decode succeeded. External log states HTTPS download SHA-256 matches release file. `public/walkthrough.mp4` is linked in RELEASE_VERIFICATION/SUBMISSION at `https://thank-consumption-motivation-seniors.trycloudflare.com/walkthrough.mp4`. Parent reports all15 real scene screenshots and corrected caption frames visually inspected. Actual scripted-browser recording is captioned/no voiceover with fictional isolated demo, no applicant impersonation; content covers generation/calendars/views/settings/primary absence/coverage gating/inspector and honest unresolved repair per release record. Reviewer did not independently watch the full video or rerun decoding/download. Recruiter incomplete CC/deadline still require confirmation. Temporary/no-SLA hosting caveat applies equally to video link. This status supersedes historical video-pending observations below; owned documents frozen after this targeted update.
3. **Production/enterprise/security/accessibility/labor-law certification: NOT GRANTED.** Same-VM backup and one disposable restore are bounded operational improvements; stable hosting, offsite disaster recovery, monitoring/load/security/account administration remain follow-ups.

No remaining core functional blocker identified in the inspected final evidence. Full matrix and explicit optional-versus-prudent distinctions updated in `docs/ASSESSMENT_COMPLIANCE.md`.

---

## Prior frozen-source follow-up (historical)


The parent reported source frozen after integration and a same-slot distinct-coverage correction. Inspected actual server/route/migration/hook/history/interval/UI source, rewritten README/approach and third-party notices. No application code changed by this reviewer.

### Completed implementation evidence

- Actual PostgreSQL `pg` and canonical JSONB aggregates; unused Drizzle schema/dependency removed.
- Manager/viewer scoped hashed sessions, explicit expiring isolated demos, Origin/CSRF and body/rate limits; transaction revalidates session after acquiring workspace row lock.
- DB row lock + revision CAS; independent immutable publication table/trigger and semantic canonical JSONB comparison. Client history/status is not adopted as authority; server audits, timestamps and versions publication.
- Synchronous import/action/export/finally-clear bridge; UI adopts only acknowledged server state, no localStorage autosave/fallback.
- Real shift intervals with overnight/timezone/DST/availability/minimum-rest handling; recorded adjacent-month history and dependent-month re-audit. Missing history is explicitly unknown.
- Restricted month-scoped catalogue CRUD; reference-safe removals and preserved snapshots.
- README eight answers now match this architecture; deployment/body/history bounds disclosed. Server 100-publication preflight prevents commit of 101 and preserves existing history; portable larger-history support is separately documented/tested.

### Observed final-check log (not reviewer execution)

`/data/roster-v040-final-check-2.log` now shows successful chained lint/typecheck, **13 files / 212 tests passed**, including `backend.test.ts` **17 passed** (15 enabled real-PG integration scenarios plus two server-policy cases), followed by completed optimized Next.js build and API routes. No skipped DB suite was shown. Parent must preserve final exit status and exact release identity; this reviewer did not start or monitor a check process.

The first integrated check's 211/212 failure is parent-reported history. Inspected `coverageCounts`: same-slot duplicate allocations are excluded from *other-duty* shift comparison; a Set counts the person once, and separate duplicate/allocation audit still blocks invalid schedules. Original integrity assertion remains one distinct person, not changed to zero. Second check confirms that test passes. This fixes coverage semantics without making duplicate schedules publishable.

The successful API-publication integration fixture removes all service demand to isolate authority/history mechanics. This is legitimate scoped API evidence, **not proof of publishing a realistic staffed roster**. Deployed browser evidence must cover realistic clean generation → valid publish → edit → preserved history, as well as invalid publish rejection.

### Remaining functional versus submission gates

- **Deployed functional gate pending:** production-browser workflows, realistic-demand publication, actual app/service restart durability (connection-pool restart test alone is insufficient), backup/recovery and fresh external HTTPS demo flow.
- A temporary quick-tunnel URL is allocated in `/data/roster-v040-public-url.txt`; parent says v0.4 not deployed there yet at review boundary. No request was made by this reviewer. Hostname allocation/service-active status is not public application verification; temporary/non-SLA access can satisfy assessment accessibility if it actually works for evaluation.
- **Full submission incomplete:** actual accessible applicant GitHub repository, 3–5 minute video, LinkedIn profile; public app verification; recruiter deadline and incomplete CC confirmation. These are not confused with source functionality.
- **No enterprise/production/labor-law certification.** No new source-only blocker identified beyond required deployed functional evidence and declared operational scope.

### Frozen-source identity observed in follow-up

Digest of sorted `sha256sum` lines for every file under `src`, `scripts`, `migrations` (relative paths; not a complete config/release manifest):
`01af0c912b2181b00eaa9c7e26ea9fbee01a4382ad5b0af33a8068b303d0f345`

- package.json: `487273c71ba744f5a1a3efc491adb5248c65234c48e9d13b1df5fe2eeacf7176`
- package-lock.json: `e8f9b553d48f9a871ae16ed5d92aaf5a9ee41f69d350d32da770699bc266c130`
- README: `9cbe27816a83b8ba56c3d1d007cf77e556d80d6bf47d39eb14e1c0d098aa3f0a`
- APPROACH: `00ccd865be2a9fdd39d8cd284249a4bc5b4243ed01dedd8d5240b5da954f805f`
- THIRD_PARTY_NOTICES: `504fa9bf72e820617e3fdde43b5969bd7955842d604822cdfbd9f1efdb6989b1`

Notices now declare no copied GitHub application source, preserve handover provenance and inventory mixed licenses. Separate cloudflared Apache-2.0 license is included; dependency-specific distribution obligations remain, not blanket legal clearance.

---

## Historical initial snapshot (superseded where updated above)

## Scope and authority

- Reviewed original assignment PDF (all seven pages), current README, selected engine/domain/UI source, existing functional assertions, release notes, package metadata/lockfile and emerging backend contract/source.
- Snapshot window: 2026-10-29 16:27–16:31 UTC. Parent later requested no further full-unit runs while workers modify files; complied. Final exact-revision tests belong after integration.
- Owned outputs only: `docs/ASSESSMENT_COMPLIANCE.md` and this report. No source/runtime/Git/deployment changes. An initial temporary PDF extraction outside these outputs was removed; it is not retained as a deliverable.
- Full A–F, optional/prudent separation, scenario acceptance expectations, eight README answers, licensing and deployment/submission matrix are in `docs/ASSESSMENT_COMPLIANCE.md`.

## Early blockers communicated to parent

1. **Central DB end-to-end:** original v0.3 uses browser storage; Drizzle schema alone does not meet the explicit central database requirement. New PostgreSQL pool/bridge is implementation evidence only; actual API/UI/shared durable behavior remains to test.
2. **D2 temporal conflicts:** aggregate daily load does not catch two overlapping 0.5 shifts. New interval code now exists but was not credited as a completed integrated feature. Need overlap/non-overlap/overnight/touched-day-leave/prior-history scenarios.
3. **Public URL:** prior release note states external port probe failed despite localhost/private tunnel success. Parent reports possible Cloudflare quick tunnel. A working fresh-browser HTTPS URL can satisfy public access, but is temporary/non-SLA and must be tested as deployed.
4. **Submission package:** no actual accessible GitHub, 3–5 minute video or applicant LinkedIn URLs verified here; approach note exists. Eight README answers exist but need reconciliation with actual v0.4. Incomplete PDF CC address and deadline start need applicant/recruiter confirmation.
5. **Exact integrated tests:** historical release evidence is not proof of live-changing v0.4. Do not attach an old green badge to new code.

## Independent executions and actual outcomes

### Initial full baseline run (before parent's no-full-run message)

Command: `npm test -- --no-cache` from `/data/roster-improvement`.

- Start 16:28:51 UTC; duration 37.24s.
- **126 passed, 1 failed, 127 total; exit 1.**
- Failure: `src/domain/roster/__tests__/qa-review.test.ts`, `QA-08 a valid library must roundtrip after 101 normal publications`, timed out at default 5000 ms.
- Eight test files passed; one contained the timeout. Original full-dataset clean generation and sole-primary leave→gap→repair scenarios passed. Calendar, integrity and other existing domain assertions passed.
- This was a changing-tree run, not an exact-release validation. It must not be reported as “all tests green” or used to certify subsequently added source.

### Targeted disambiguation

Command: `npm test -- --no-cache src/domain/roster/__tests__/qa-review.test.ts -t 'QA-08' --testTimeout=30000`.

- Start 16:30:02 UTC; test took 10.513s (run 11.32s).
- **1 passed, 19 skipped; exit 0.** The 101-publication roundtrip completed without the asserted semantic failure under this invocation-only budget.
- No test source/configuration edited. This supports an expensive test/default-time-budget issue on this machine; it does not establish the ordinary suite is green, excuse all performance concerns, or prove semantic correctness outside the assertion.
- Vite additionally warned about `__dirname` under a prospective native config loader. Not a current test failure.

No production build, lint/typecheck, browser, PostgreSQL API, deployed scenario or public endpoint was independently executed by this reviewer in this turn. Existing 127-unit/21-browser release logs are historical v0.3 evidence only.

## Architecture gate findings

- Pure engine/domain-adapter separation is appropriate; greedy heuristic is permitted. Independent hard audit and distinct-resource coverage are materially stronger evidence than visual polish.
- `server/bridge.ts` explicitly makes global domain-store import/action/export/finally-clear synchronous. This addresses the known global-store hazard in design, but needs failure cleanup and interleaved two-workspace tests. Never await inside the bridge. Prefer request-scoped services in a future refactor.
- DB row lock/CAS, session-scope authorization and server-generated audited publication are the right contract; must prove actual routes/transactions enforce them. Do not trust client history, status, metrics, role or workspace identifier.
- New `run` Promise callers must await successful DB acknowledgement; errors/conflicts must not show success or silently fall back to local-only storage.
- Emerging server parse limit is 100 publications versus service limit 10,000 and QA-08 at 101. This is a contract/UX limit mismatch to resolve or explicitly document/test, not proof of existing data corruption. Similar issue: 2 MB HTTP body vs larger local backups.
- Emerging catalogue commands use restrict-on-reference removal and active-month scope. Good non-destructive approach; test rollback, lead reassignment, allocations/baseline preservation, immutable history and clear month scope. Full dynamic catalogue CRUD is optional under PDF §6, not an invented core gate.
- New shift code visibly models real intervals, cross-date overlap, minimum rest policy, touched-day availability and DST fail-closed conversion. Actual adapter/service/server history wiring and scenario pass evidence remain pending. Engine-only trailing-context support is not automatic prior-month loading.

## Licenses and copying

Direct installed packages inspected report MIT, Apache-2.0 and ISC; `pg` MIT was observed after another worker installed it. Lockfile contains LGPL libvips/sharp platform entries, MPL axe-core/lightningcss and CC-BY caniuse-lite. Distinguish optional/dev/platform packages and actual distribution before making legal claims. Do not call the entire tree MIT; preserve required LICENSE/NOTICE/attribution and applicable distribution obligations.

No external code copied by this reviewer. Source search found no explicit provenance markers, which cannot prove originality. User allows licensed GitHub references, not unknown-license copying. Any copied reference needs repo/commit/path/license/modification provenance. Notion-like UI does not license proprietary assets or imply affiliation.

## Snapshot fingerprints (not a frozen release identity)

These were captured at approximately 16:30 UTC while other files could change:

- Original assignment: `9e4d3dde2ec6ac713f2f0d984d394f82fd582588c934916f00bd9fc64c2ae814`
- README: `3438aea4cf276735ea27c536fd7d9a1a02f901a58cea0606361cf8cb52c1448c`
- package.json: `c1ff4d8f465be7ec47a1e923a35ea4ea3ca54b962eec606efe4bc062cdd4379c`
- engine types: `a0bb90be65c42a508ce5ad83c0c4e224a5591c30f1cdda6913141875502c22a1`
- adapter: `2601ee19b9f3d0d05f65b45e8ec50367d942b4943b077f31a598fe56bdf7fb4b`
- service: `ef29f56824b78c7328772a9effd4f087ba71ec17d21c7b661889963af61cd937`
- local-persistence hook: `2bf0f12b66a6f03de3744a80fc834360a3be936774f19511da8ac3e0ff961a3d`

Package and source modifications afterward require fresh fingerprints and execution evidence. Do not use these selected hashes as a release manifest.

## Conditions for final assessment verdict

1. Freeze actual integration and reconcile README/approach/env with it.
2. Run ordinary engineering checks, with transparent resolution of QA-08 budget; record actual results and candidate identity.
3. Execute core functional scenarios, especially real shifts, month history, manual conflict handling and post-generation leave; verify UI in production build.
4. Execute real PostgreSQL shared persistence, restart durability, workspace isolation, stale-write rejection, unauthorized/viewer/CSRF rejection, immutable history and server-publish bypass tests.
5. Independently verify public HTTPS core workflows and obtain real submission URLs/video/profile.
6. Update the matrix with concrete observed evidence. Missing optional fairness/notifications do not block; missing mandatory behavior and submission artifacts do.

Passing those conditions can justify **assessment-compliant within documented assumptions**. It does not certify enterprise readiness, production SLA, or comprehensive labor-law compliance.
