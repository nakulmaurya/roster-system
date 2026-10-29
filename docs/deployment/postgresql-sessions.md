# Central PostgreSQL persistence and sessions

This backend replaces browser autosave. PostgreSQL is required in all deployed environments; there is no SQLite, browser-only, memory-only, or unauthenticated-write fallback. The domain singleton is a **synchronous proposal/audit bridge only**: import the current database library, apply/export, clear it in `finally`, all without `await`. No request-specific workspace remains in the domain store across an asynchronous boundary. The connection pool does not cache state.

## Operator setup

1. Use Node 22.12+ and PostgreSQL 15+ (tested against PostgreSQL 17). Install locked dependencies with `npm ci`.
2. Create a dedicated database and restricted application role, not a PostgreSQL superuser. Give it access to its own schema only. Use a separately managed migration role in production where practical. Never expose PostgreSQL to the public internet. For remote databases use TLS with a verified server certificate (e.g. connection-string `sslmode=verify-full` and trusted CA). Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`.
3. Configure server-only `DATABASE_URL` and exact browser-facing `APP_ORIGIN` (scheme/host/port, **no trailing slash**). Neither may be `NEXT_PUBLIC_*`. The backend does not trust Host, forwarded Origin, X-Forwarded-For or proxy headers for authorization. A TLS reverse proxy must forward the original browser `Origin` header. Public deployment must use HTTPS.
4. Apply idempotent schema: `node scripts/roster-migrate.mjs`. Back up PostgreSQL before migrating. Schema contains `roster_workspaces`, hashed-token `roster_sessions`, append-only `roster_publications` and rate-event records. No mock connection is substituted on failure.
5. Optional real sign-in: set `ROSTER_ADMIN_USERNAME` + `ROSTER_ADMIN_PASSWORD_HASH`, and optionally `ROSTER_VIEWER_USERNAME` + `ROSTER_VIEWER_PASSWORD_HASH`. Use **different usernames**. Viewer and manager access the same configured real workspace. Omit all credentials for a demo-only deployment. Rotate credentials and revoke sessions when removing access; env credential rotation alone does not revoke already-issued sessions.
6. Generate a salted password hash with `node scripts/roster-password-hash.mjs`, feeding a 12–1024 character password on stdin, not argv. Hash format is `scrypt$<32 hex salt>$<128 hex derived key>`, Node scrypt defaults (N=16384,r=8,p=1). In shell env files single-quote hashes so `$` is not expanded. Keep env/secrets out of source control.
7. Build and start via existing package commands. The application does not run migrations implicitly on public requests. Operators perform infrastructure setup once; **public evaluators need no account, credentials, local database, or installation**. They click **Try demo** to obtain a freshly isolated fictional-data database workspace and scoped manager session.

Production cookies always have `HttpOnly; SameSite=Lax; Path=/; Secure`, even behind a proxy. No Domain attribute is set. Development localhost uses non-Secure cookies by default; `SESSION_COOKIE_SECURE=true` forces Secure. For production-build loopback E2E only, `ALLOW_INSECURE_LOCALHOST=true` permits non-Secure cookies **only if APP_ORIGIN is an explicit http://localhost or http://127.0.0.1 origin**. The flag cannot weaken cookies for a public hostname. Do not use it for public deployment. HTTP `localhost` and `127.0.0.1` are different origins: use the same configured origin in the browser/tests.

## Public demo protections

- Every fresh demo receives its own random UUID workspace, random 256-bit session token and random 256-bit CSRF token. No workspace ID supplied by the browser can choose/alter session scope. Demo credentials cannot access the real workspace.
- Database session stores only SHA-256 hashes of session tokens; cookie is a bearer secret. Session role and scope are fetched from PostgreSQL on every request. Real sessions expire after 8 hours, demos after the configured TTL. No sliding renewal. Logout deletes the session; login/switching from a real session rotates the old cookie token. Clicking Try demo with an unexpired demo reuses it without renewing TTL or allocating another workspace.
- Defaults: `DEMO_TTL_SECONDS=86400` (allowed 300–172800), `DEMO_MAX_WORKSPACES=200` (1–1000), `DEMO_RATE_PER_10_MIN=40` (1–200). Provisioning uses a global PostgreSQL advisory lock, global rate window, cap check, insert and session issuance in one transaction. This works across server processes and restarts and does not rely on spoofable proxy IPs.
- Global caps intentionally can produce HTTP 429 under abuse. This is not a complete anti-bot/WAF system; configure upstream request limits as appropriate. Sign-in attempts (including unknown users) are capped globally at 30 per 10 minutes and consume the same scrypt workload. Global rate limits trade availability under attack for a hard resource ceiling; no client-selectable bucket bypass.
- Provisioning incrementally deletes expired demo workspaces (25), sessions (200), old rate records (1000). Schedule `node scripts/roster-cleanup.mjs` regularly using the deployment's scheduler. It deletes up to 100 expired demo workspaces per run plus expired sessions and old rate records, never real workspaces. Cascading cleanup removes expired demo publications; histories cannot be deleted while their workspace exists.
- DB errors return 503 without leaking connection strings, SQL, passwords or stack traces. User state is not committed on audit failure or concurrency conflict.

## API contract

All responses are `Cache-Control: no-store`. No cross-origin CORS allowance is emitted. Every mutation requires an exact `Origin: APP_ORIGIN`; missing/foreign Origin and `Sec-Fetch-Site: cross-site` are rejected. Workspace writes and logout also require the session's `X-CSRF-Token`. Login/demo Origin checks prevent login CSRF. JSON is read incrementally with a **2,000,000-byte limit**, including bodies without Content-Length. Only application/json is accepted.

| Endpoint | Input / result |
|---|---|
| `GET /api/session` | `{authenticated:false}` or `{authenticated:true,role,kind,csrfToken,expiresAt}` |
| `POST /api/demo` | `{}`; creates/reuses an isolated demo; sets session cookie |
| `POST /api/session` | `{username,password}`; configured real manager/viewer login; sets rotated session cookie |
| `DELETE /api/session` | CSRF header, no body required; revokes cookie token and clears cookie |
| `GET /api/workspace` | `{revision,library,workspace,role,kind}`; library is the domain JSON export string, workspace is recalculated UI state |
| `POST /api/workspace` | `{type:'commit',revision,library,publish?:boolean}` or `{type:'publish',revision}` |

401 means missing/expired session or invalid credentials. 403 means viewer write, invalid CSRF or Origin. 409 means stale DB revision. 413 oversized request, 415 wrong media type, 400 malformed HTTP JSON, 422 invalid typed command/proposal or blocked publication, 429 rate/cap, 503 database/configuration unavailable. Mutation commands are strict discriminated unions; extra scope/role/workspace ID properties are rejected. Workspace IDs, roles, revisions, publication timestamps and publication authorization are not taken from proposed state.

`revision` is a database-wide library revision, independent of domain publication `version`. Workspace `SELECT ... FOR UPDATE`, session recheck, revision comparison, independent domain import/audit, publication insertion and revision increment run in a PostgreSQL transaction. Concurrent writers using the same revision get exactly one success and one 409. On conflict users explicitly reload; no automatic merge, retry, or silent overwrite. An acknowledged DB commit persists across browser/server/connection-pool restarts. A network loss after commit can be ambiguous; reload to discover the acknowledged DB state before retrying.

## Proposed-state compatibility bridge

The existing UI calls synchronous domain service closures. The hook retains `run(action,message)` but now returns **Promise<boolean>** and only reports success after server acknowledgement. All branching callers must `await run`. A closure builds a proposed library against the last acknowledged local read mirror, then the mirror is restored before HTTP awaits. Server rebuilds derived problems, coverage, violations and off-days. Client validation results are ignored. Viewer sessions cannot write, even when calling the HTTP endpoints manually.

Client `PUBLISHED`, version, timestamp and baseline claims never authorize publication. Existing history must be semantically identical to server history (JSONB key order is not significant); inserted, edited or removed snapshots are rejected. The hook recognizes a locally requested publication and strips its client-generated snapshot, passing only `publish:true`; the server runs a **fresh independent audit** and creates its own snapshot/time/version. Blocked publication rolls back the entire proposed commit. The SQL publication ledger rejects UPDATE/DELETE while the owning workspace exists. Ordinary draft edits, reset and backup import cannot replace past publications. Existing months omitted by a replacement are preserved, not deleted.

The server supports up to 24 month documents, 300 employees, 150 requirements, 6000 eligibility assignments, 12000 allocations per month and 100 publications per month, subject to the smaller whole-body import limit. Limits intentionally bound assessment compute/storage; this is not an unbounded enterprise import API. Demo configuration resets/imports remain fictional-data sandbox actions. Approved real data must use a properly secured deployment and retention policy.

## Hook / UI integration

Existing fields remain: `workspace,run,saveState,notice,setNotice,restore,reset,acceptExternal,backup,recoveryBackup`. New fields: `loading,busy,authenticated,role,sessionKind,authError,tryDemo(),signIn(username,password),signOut(),migrateLocalBackup()`.

Before a workspace exists, render loading or explicit Try demo / real sign-in controls. Disable mutations for viewer sessions and during `busy` (server enforces both auth role and concurrency regardless of UI). `saveState='saved'` now means the database acknowledged the operation; `conflict` requires explicit `acceptExternal()`. Legacy union values are retained for compatibility but no memory-only autosave is provided. Errors appear in `notice` / `authError`.

No localStorage autosave, automatic legacy import, storage-event overwrites, or unauthenticated demo state. `migrateLocalBackup()` is an explicit consent flow only; it reads the old `datastraw-workspaces-v1` key and proposes drafts to the authenticated DB workspace. The original local key is never removed/overwritten. Backup restore and reset preserve server publication history; backup history is not imported as trusted publication. JSON/CSV export remains user-triggered. Diff/replacement getters read the last server-hydrated domain mirror.

## Validation

Real DB integration suite: `TEST_DATABASE_URL=<dedicated disposable database> npx vitest run src/server/backend.test.ts`. **This suite truncates all roster tables in that dedicated test database. Never point it at production.** Without TEST_DATABASE_URL it is explicitly skipped, not reported as real DB coverage. Migration runs before tests. Tests cover missing auth, viewer writes, Origin/CSRF, streamed body bounds, DB CAS and concurrent writers, independent demos/real scope isolation, malicious publication flags/history, independent blocked-publication rollback, immutable SQL ledger, JSONB-order no-op stability, pool reconnection persistence, expiry/logout and demo reuse/caps/rates.

Connection-pool recreation verifies DB persistence, not a claim of a full machine reboot. Run process-restart smoke checks separately against a deployed/test server. Hosted deployment, public routing, backups, secret injection, cron installation and service restarts are operator responsibilities; these scripts do not deploy or alter system services.

Application-process restart probe (against a running HTTP test server): set `ROSTER_PROBE_ORIGIN` to its exact origin, run `node scripts/roster-persistence-probe.mjs write /private/probe.json`, stop/restart only the test application process, then run `... read /private/probe.json`. The private 0600 fixture contains a scoped demo bearer cookie; never commit it. The script verifies the same session, revision and sentinel value after restart without printing the cookie.
