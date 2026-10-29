# v0.4 server-backed assessment upgrade

The current release adds PostgreSQL-authoritative storage, scoped sessions/roles, atomic revisions, fresh publication validation and immutable SQL history; configurable timed shifts/rest and adjacent-month history; safe configurable catalog CRUD; and an acknowledged async UI. Five specialist agents implemented or independently reviewed backend, scheduling, management, QA and assessment compliance.

Final execution: **213 tests + 27 public HTTPS browser cases passed**, including realistic full-roster publication, viewer enforcement, isolation, stale-write rejection and responsive UI. Actual app/DB restart and private backup/restore drills passed. See `docs/RELEASE_VERIFICATION.md` for evidence and limitations. The old local-only release description below is historical.

---

# Improvement report

## Baseline versus improved version

| Area          | Supplied handover                                                    | Improved version                                                                                                              |
| ------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Dates         | Hard-coded November/30-day UI and export                             | Selected month, leap years, correct export dates, independent month drafts                                                    |
| Eligibility   | New staff/brands silently receive broad relief assignments           | Explicit manager authorization only                                                                                           |
| Solver status | Greedy result labeled OPTIMAL; hard violations could return FEASIBLE | Honest FEASIBLE/PARTIAL/TIMEOUT/INVALID statuses                                                                              |
| Integrity     | Unknown references and falsified workload could evade audits         | Always-on configuration/allocation integrity checks                                                                           |
| Coverage      | Allocation row count                                                 | Distinct available, eligible, capacity-valid people                                                                           |
| Processes     | Bundles described in prose but anchored to CS                        | Explicit compatible-process membership; process views include bundles                                                         |
| Configuration | Limited rule/team forms                                              | Eligibility removal, leave/comp-off/cancellation, calendars, staffing, capacity, date overrides, holidays, process attachment |
| Changes       | Stale off-days/metrics, some default-config validation paths         | Rebuilt metrics/off-days; consistent configured rules                                                                         |
| Publication   | Mutable PUBLISHED state, no preserved snapshot, cached audit         | Fresh audit, cloned snapshots, edits reopen versioned draft                                                                   |
| Diff          | Additions only                                                       | Removals and pin changes included                                                                                             |
| Persistence   | In-memory only                                                       | Browser-local saves and atomic validated JSON backup/restore                                                                  |
| Export        | Fixed dates and incomplete CSV escaping                              | Dynamic dates, safe quoting, formula-prefix neutralization and gap labels                                                     |
| Toolchain     | Next 14 / React 18 / Vitest 2; broken lint/database commands         | Next 16 / React 19 / Vitest 5; working lint/typecheck/check commands                                                          |
| Documentation | Claims exceeded runtime implementation                               | Explicit capabilities, assumptions and remaining submission gaps                                                              |

## Version 0.3.0 — interface and independent review

### Interface

- Replaced the dense, always-monthly spreadsheet shell with a quiet Notion-inspired workspace: sidebar navigation, restrained typography, neutral surfaces and semantic issue colors.
- Added a readable seven-day default, full-month overview, week navigation, brand/person/pod/process views, focused filters and search.
- Separated coverage investigation, people, settings and demo scenarios rather than putting every control in the top toolbar.
- Added allocation inspection and eligible candidate panels; keyboard buttons, inert background, focus trapping/restoration, Escape dismissal and mobile navigation.
- Explicit local-save, memory-only, recovery and conflicting-tab states. Original corrupt data can be downloaded instead of being overwritten.

### Reviewer findings addressed

Three specialist subagents reviewed engineering integrity, service/UI QA and stress/edge cases. Their historical reports and follow-ups are in `docs/reviews/`. Findings were turned into ordinary regression tests, not expected-failure placeholders.

- Failed edits previously could mutate live data before validation; commands now clone, validate, commit or roll back atomically in memory.
- Detached public reads and command results; parsed copies of incoming periods prevent outside mutation of authoritative state.
- UUID eligibility IDs replace same-millisecond collisions.
- Historical allocations, timestamps and increasing unique publication versions are validated; export/import publication limits are aligned.
- No-op repair preserves published state and version. Effective changes reopen a draft.
- Overlapping explicit process bundles are rejected. Soft warnings survive revalidation and restore.
- Malformed fatigue limits fail fast, colon-containing IDs retain correct capacity diagnostics, and repair ranking includes supplied boundary history.
- Eligibility forms initialize from the selected existing authorization; unchanged save no longer demotes Primary to Backup.
- Cross-tab clear, remove, replace and changed-library-during-restore flows avoid knowingly overwriting newer data. This remains best-effort detection, not atomic shared storage.

## Verification performed

- Original supplied baseline: 15 tests. Previous improved release: 57 tests.
- Final version 0.3.0: **127 unit/integration tests across 9 files**, including **44 stress-review cases**, passed.
- **21 Chromium production-browser acceptance cases passed locally and again against the deployed VM through a private SSH tunnel.** Includes 390px/320px responsive checks, keyboard focus, corrupt/empty saves, quota failure, cross-tab deletion/replacement, async restore confirmation, rollback, eligibility and publication history.
- ESLint, TypeScript and optimized production build passed locally; `npm run check` also passed in the isolated VM candidate directory before deployment.
- Final desktop (1600px), mobile (390px/320px), settings, allocation inspector and coverage screenshots were individually inspected. No main-document horizontal overflow or uncaught page errors in these exercised paths.
- `npm audit` reported zero known vulnerabilities in the final point-in-time audit. This is not security certification.
- GitHub Actions configuration enforces lint, types, units, production build and production-browser acceptance when pushed; hosted CI execution is not claimed.
- See `docs/RELEASE_VERIFICATION.md` for deployed-runtime and public-access status.

## Still not complete

No connected central database, authenticated access, intraday-shift incompatibility checks, automatic month-boundary history loading, full catalogue CRUD or multi-party swap search. These are not hidden behind mock integrations or completion claims.
