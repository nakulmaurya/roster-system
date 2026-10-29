# Backend delivery / tested results

## Implemented files / ownership
- New `src/server/**` and `src/app/api/{session,demo,workspace}/route.ts`.
- Replaced only `src/hooks/useRosterWorkspace.ts` (no domain/engine/adapter/validation/UI edits).
- New `migrations/001_central_workspace.sql`, `scripts/roster-{migrate,password-hash,cleanup,persistence-probe}.mjs`, `docs/deployment/postgresql-sessions.md`; updated `.env.example`.
- `package.json` / lock additions only: pg8.23.1 and @types/pg8.23.1. No other dependency or script changes made by backend worker.

## Actual completed checks
- Migration applied successfully to parent-provisioned PostgreSQL17 via dedicated SSH tunnel / test DB.
- Real DB `src/server/backend.test.ts`: **17 tests passed**, 73.74s (15 integration + 2 policy tests). Log `/data/reviews/v040-server-tests.txt`.
- Includes unauthenticated read/write rejection, manager/viewer auth and viewer-write rejection, Origin+CSRF, HttpOnly/SameSite/Secure policy, stream bounds, CAS+concurrent writer stale revision, isolated demos vs real workspace, client publication flag ignored, fresh independent publication failure rollback, history tamper/removal rejection, SQL immutable snapshot trigger, semantic JSONB ordering, connection-pool restart persistence, logout+expiry, demo cap/rate/reuse, expired published demo FK cleanup without touching real workspace, 100-publication cap preflight.
- Earlier run was12 pass/2 default5s timeout; explicit30s integration timeout fixed tunnel/CPU-contention timeout (not a product functional failure).
- Final TypeScript and backend-targeted ESLint were clean at16:37 shared workspace snapshot; logs `/data/reviews/v040-typecheck-current.txt`, `/data/reviews/v040-lint.txt`.

## Small post-test changes requiring final serialized gate
After17-pass run, optimized hydration to avoid redundant import/audits; batched publication-ledger lookup/inserts (no query per snapshot) and verify no ledger entries disappear; added cap check against **independently hydrated** status and an additional assertion inside existing cap test. Final static checks passed before the last one-line cap-status refinement. Parent should rerun bounded backend suite with TEST_DATABASE_URL as part of final gates. No full-suite process started by backend worker.

## Integration / limitations
- Hook `run` is Promise<boolean>, success only after DB ack; parent UI integrates auth/loading and awaits branching handlers.
- Initial unauthenticated workspace is null; explicit Try demo or configured signin required. No automatic unauthenticated write path and no localStorage autosave.
- Origin exact match. Public production always Secure. Explicit ALLOW_INSECURE_LOCALHOST only permits insecure cookie on http://localhost or127.0.0.1 for production-build local tests; cannot weaken public host cookies.
- Existing publication history cannot be overwritten by reset/backup restore. Legacy local migration is explicit and imports drafts, preserving DB history; old local key unchanged.
- Hard assessment limits and global anti-abuse caps documented; rate exhaustion can reduce availability under attack. This is not a complete WAF.
- Actual process restart is **not yet claimed** by backend worker; parent will run `scripts/roster-persistence-probe.mjs` write/restart/read. Pool reconnect durability passed.
- No deployment, SSH actions, Git operations or unrelated service changes by backend worker.
