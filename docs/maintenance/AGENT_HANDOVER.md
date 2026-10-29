# Agent handover — Roster Studio 0.4

Read README, APPROACH and docs/ASSESSMENT_COMPLIANCE.md first. Do not repeat old browser-local-only, connected-Drizzle, optimality or comprehensive labor-compliance claims.

## Ownership map

- `src/core/engine/`: domain-independent scheduling, integrity, coverage, calendar/demand expansion, interval/timezone conversion, constraints, repair and solver.
- `src/domain/roster/`: D2C records/seed, validation, adapter, transactional domain commands and safe catalog management.
- `src/server/`: PostgreSQL repository, hashed sessions/roles, bounded HTTP handling, canonical comparison and synchronous domain bridge. No per-user global async cache.
- `src/app/api/{session,demo,workspace}/`: server authority and workspace scope; all writes must pass Origin/CSRF/role checks.
- `src/hooks/useRosterWorkspace.ts`: acknowledged database snapshot, session/loading/error handling, local proposal mirror, revision conflict/reload, explicit draft import. `run` is async; branching callers MUST await.
- `src/components/RosterDashboard.tsx`: workspace shell; `roster/` contains access gate, table, inspector, dialogs and management; OperationsSettings handles eligibility, time off, service/shift/calendar and holiday forms.
- `migrations/001_central_workspace.sql`: actual SQL schema and immutable history trigger. The old unused ORM schema was removed.
- `scripts/`: migration, scrypt password hashing, demo cleanup, private backups and process-restart probe.
- `e2e/`: UI workflows plus independent adversarial API/assessment tests.
- Hosted GitHub CI is not enabled in the published assessment branch. Original workflow/history is preserved locally on `archive/with-ci`; manual verification commands remain in README.

## Invariants

1. New people/brands never silently receive eligibility or demand.
2. Hard constraints cannot be downgraded to preferences or bypassed by claimed client metrics/status.
3. Same person cannot satisfy two distinct seats; fractional capacity does not authorize incompatible overlapping duties.
4. Invalid pins are retained and flagged, not erased to manufacture feasibility.
5. Every mutation commits valid canonical state or leaves the full domain library/DB transaction unchanged.
6. Public return values and incoming objects never alias authoritative state.
7. A domain bridge cannot await; always clear per-request state in finally.
8. Server session determines workspace/role; request body cannot change scope.
9. Revision comparison and row lock are mandatory for every server mutation.
10. Publication audits server-loaded state; client history cannot be inserted/modified/deleted. Reset/import preserve the ledger.
11. History dependencies and shift checks apply in generation, edit, repair, import and publish—not only the initial solve.
12. Catalog edits are explicitly active-month scoped. No hidden cascade destroys baseline/pinned work.
13. Never use production DATABASE_URL as TEST_DATABASE_URL. Integration tests truncate data and require a test/ci database name.
14. Demo/login limits, body/configuration bounds and expiry are safety boundaries; do not silently remove them for a green test.
15. All interactive controls need labels, keyboard operation, mobile containment and dialog focus restoration.

## Verification

Run `npm run check` with a dedicated TEST_DATABASE_URL for actual DB cases; otherwise those cases are visibly skipped. Start a production server with matching APP_ORIGIN before `npm run test:e2e`. Supply private viewer fixtures to avoid skipping real viewer checks. Use separate artifact output directories if any independent browser run is necessary; prefer serial full runs. Avoid simultaneous broad test suites on the shared machine.

The historical 101-publication core roundtrip intentionally audits substantial history; measured near ten seconds and covered by the explicit test budget. Server publications have a smaller explicit cap and a separate preflight regression.

## Deployment and secrets

Only alter dedicated roster services. The VM runs unrelated processes. PostgreSQL listens only on loopback; private app/test roles and credentials are separate. Keep EnvironmentFile, initial credentials and probe fixtures mode0600 outside the repository. Never print passwords, session cookies or connection strings into tool logs/source/ZIPs.

A Quick Tunnel URL is temporary, not stable production DNS or an uptime promise. Recreating it changes hostname and requires matching APP_ORIGIN; do not silently disable Origin checks to fix deployment. Retain old release/config rollback; take DB backups before future migrations. See final release evidence for the validated deployed revision and outstanding applicant-owned submission links.
