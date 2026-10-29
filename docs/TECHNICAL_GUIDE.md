# Technical guide

Implementation details for the assessment release. Start with [the main README](../README.md) for the reviewer walkthrough.

## Run

Node 24 LTS and PostgreSQL 17 are the validated combination.

```bash
npm ci
cp .env.example .env.local
# Set DATABASE_URL to your PostgreSQL database and APP_ORIGIN to the exact browser origin.
# Export the same values for the migration command; do not put credentials in source control.
node --env-file=.env.local scripts/roster-migrate.mjs
npm run dev
# Open APP_ORIGIN, then select “Try the interactive demo”.
```

Production:

```bash
npm run check
# Run migration with the private production configuration before switching releases.
npm start -- --hostname 127.0.0.1 --port 3000
```

Use HTTPS and exact `APP_ORIGIN` in production. Production cookies are Secure; `ALLOW_INSECURE_LOCALHOST=true` is accepted only for explicit HTTP loopback testing, never a public origin. Next.js reads `.env.local`; systemd uses a private `EnvironmentFile`. See `docs/deployment/postgresql-sessions.md`.

## Evaluate without setting up an account

The entry page provides an explicit **Try the interactive demo** action. It creates an isolated, temporary **database-backed** fictional workspace and issues a scoped manager session. Other reviewers' demos and the managed real workspace are separate. Refresh retains the same session and central data; expired demos are cleaned up. Default demo lifetime is 24 hours.

Managed manager and viewer accounts use configured usernames and scrypt password hashes. They share the configured real workspace across devices. Viewer writes and publication are rejected by the server. Never expose real personnel data in public demo workspaces.

The verified deployed URL and final execution results are recorded in `docs/RELEASE_VERIFICATION.md`. A temporary Quick Tunnel is not stable production hosting; its hostname changes if the tunnel is recreated.

## Assessment capabilities

- 30 fictional employees, 20 brands, three operational pods with leads.
- 16 single-primary and four multi-resource brands, including separate and overlapping process eligibility, distinct two-person demand and explicitly authorized relief.
- Per-brand/process calendars: all days, public holidays off, Sundays/public holidays off; date-specific operating and staffing overrides.
- Employee availability, preferred weekly off, approved planned/sick leave, comp-offs and cancellation. Mandatory rest/availability is distinct from soft preferences.
- Dynamic monthly generation, leap years, locks, manual edits, independent conflict audit and ranked eligible gap fills.
- Company, pod, brand, process and employee views; readable weekly default plus full month, filters/search, coverage investigation and change comparison.
- Configurable actual shift intervals, including overnight duties and IANA timezone conversion. Incompatible overlaps and configured between-shift rest are checked independently of daily workload. A compatible bundle is one shared duty; fractional capacity alone never makes simultaneous duties compatible.
- Recorded previous-month assignments automatically supply trailing work-day and interval history. Changes re-audit dependent months and reopen affected publications for review.
- Employee, brand, process and pod/lead management; explicit eligibility and service configuration. Safe removals explain references that must first be resolved—no silent cascade deleting work/history.
- Fresh server-side publication audit, server timestamp and immutable database publication ledger. Later changes reopen drafts; no-op repair does not change publication state.
- PostgreSQL transactions and revision compare-and-swap prevent stale writers overwriting another manager's changes.
- CSV export and validated JSON draft import/export. Restoring/resetting cannot replace authenticated server publication history. Legacy browser backups are imported only explicitly and remain untouched locally.
- HTTPOnly sessions, server role enforcement, CSRF token plus exact Origin checks, body/configuration bounds, scoped demo expiry and anti-abuse caps.

## Architecture

```text
React workspace UI and focused dialogs
  -> persistence hook (acknowledged server state; local mirror only for display/proposals)
  -> authenticated Next.js API / Origin + CSRF / manager role
  -> PostgreSQL row transaction + revision compare-and-swap
  -> synchronous isolated domain bridge: import -> validate/apply -> export -> clear
  -> domain service / adapter -> reusable pure TypeScript engine
```

PostgreSQL stores canonical workspace libraries as JSONB, revisions, hashed sessions, immutable publication rows and bounded rate events. This is an intentional aggregate repository, not a pretend connection to unused employee tables. The old unused Drizzle schema/dependency was removed to avoid two conflicting sources of truth. Entity relationships and references are validated at the domain boundary; publication and revision constraints additionally live in SQL.

The server never keeps a workspace across an asynchronous boundary. The module-global domain store is used only inside a synchronous, non-awaiting import/action/export/finally-clear bridge. Database isolation and request-scope tests cover this seam.

Core contracts are resources, services, dated demand slots, allocations, availability, shift intervals and constraints. A volunteer-shift fixture exercises a second domain without D2C terminology. Other domains may need additional explicit constraints—not just renamed labels.

## Constraints and result meanings

Hard checks include reference integrity, real dates, authorization, availability, positive workload, daily capacity, distinct staffing, shift compatibility and configured consecutive-day/rest rules. Preferences rank otherwise valid choices: preferred off-day, primary continuity, equity and pod affinity.

Generation uses deterministic initial-scarcity ordering and greedy scoring, not backtracking. `FEASIBLE` means mandatory audit passed, not optimal. `PARTIAL`/`TIMEOUT_PARTIAL` means unresolved requirements, not proof that no solution exists. Invalid configuration or schedules are separate statuses. Invalid pins remain visible until a manager resolves them.

Legacy requirements without explicit shift metadata use a full-day Asia/Kolkata interval. Equal start/end times mean 24 hours; end earlier than start is overnight. Ambiguous/nonexistent DST boundaries fail closed. Configure real hours for services whose duties can share a day. Minimum rest defaults to zero unless explicitly configured; max consecutive working days defaults to six.

## Important boundaries

1. **Not legal/compliance certification.** Rest and weekly-off rules are configured operating policies, not a complete jurisdictional labor entitlement model.
2. **History must exist.** Previous-month recorded work is loaded automatically; missing earlier records do not prove past rest compliance. No fabricated history is inferred.
3. **Daily workload plus shift intervals.** There is no minute-by-minute coverage requirement, travel-time/dependency model, payroll or attendance integration.
4. **Greedy search.** May miss a feasible arrangement; preprocessing/audit are not a strictly interruptible optimization job. Direct gap fill does not perform multi-person swap search.
5. **Month-scoped catalogs.** Edits affect the open month; new months inherit its configuration. Other-month catalogs and publication snapshots are retained. This is explicit, not an invisible global HR migration.
6. **Restricted removal.** Current/baseline work, eligibility, leave and leadership references must be safely resolved before deletion. No convenience button silently erases them.
7. **Assessment deployment bounds.** Request bodies are capped at 2 MB (JSON imports 1.8 MB), 24 month documents, 300 employees, 150 services, 6,000 eligibilities, 12,000 allocations per document and 100 server publications per month. Exceeding a limit is rejected before commit; existing history remains intact. Core portable backups support a larger history bound, so oversized imports may be refused by this deployment.
8. **Public demo protection is bounded, not a complete WAF.** Provisioning/sign-in have global caps and expiry; abuse can reduce availability. Stable hosting, monitoring, offsite backup/restore operations, richer identity management and load/security review remain production work.
9. **No notification or formal approval chain.** Those were optional assessment extensions. “Publish” means a server-authorized validated snapshot, not a multi-stage approval workflow.

## Verification and CI

```bash
npm run lint
npm run typecheck
npm test
npm run build
# Browser tests need a ready server and Chromium:
npx playwright install chromium
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

For actual database integration tests, set `TEST_DATABASE_URL` to a **dedicated disposable test database** whose name explicitly contains `test` or `ci`. These tests truncate their tables. Never point it at a managed/demo production database. Without this variable, DB integration cases are visibly skipped, not claimed verified. Real viewer browser checks require private `ASSESSMENT_VIEWER_USERNAME`/`ASSESSMENT_VIEWER_PASSWORD` fixtures matching the server.

Hosted GitHub Actions is not enabled in the published assessment repository. Reproduce migration, lint/types/units/build and production-browser checks with the documented commands; the historical local/deployed results remain separate. Test workers are bounded to avoid oversubscription; the deliberate 101-publication portable-history regression takes about ten seconds and has an explicit overall test budget. Timing observations are not performance guarantees.

`docs/ASSESSMENT_COMPLIANCE.md` is the independent requirement matrix. `docs/reviews/v0.4/v040-*` contains specialist findings; `docs/RELEASE_VERIFICATION.md` is the final release evidence. Older v0.3 evidence is historical, not proof of this release. See `THIRD_PARTY_NOTICES.md` for licenses and provenance.

## Tell Us How You Think

### 1. Employees, brands, processes, pods and relationships?

Employees belong to pods; pods have existing employee leads. Brands belong to pods. A brand/process requirement defines calendar, distinct staffing, workload and shift; compatible processes can share an explicit bundle. Eligibility authorizes employees as primary, backup or relief; actual dated allocations are separate. Central PostgreSQL persists the canonical aggregate and independently immutable publication ledger.

### 2. Generation and constraint satisfaction?

Expand calendars/holidays/overrides to dated demand, load recorded previous-month history, validate configuration and pins, order seats by initial candidate scarcity, then greedily rank eligible candidates. Independently audit the result and again on server publication. Partial output is explained, not mislabeled optimal or infeasible.

### 3. Single-resource versus multi-resource brands?

Single-primary bundles consume one configured workload and one shared shift; relief must be explicitly eligible. Multi-resource brands have distinct service requirements, including overlapping eligibility and queues requiring two distinct people. Staffing labels never override actual required counts.

### 4. Sole primary unavailable?

Approved leave removes affected unlocked work and exposes all resulting service gaps. Locked work is retained as a blocker. Eligible available capacity-compatible candidates are shown; if none can cover, the gap stays visible and publication is blocked.

### 5. Conflicting requirements or insufficient staffing?

Expose rule-specific blockers with affected date/person/service. Check both aggregate capacity and actual shift compatibility. Managers review staffing, authorization, leave or the client's requirement; the system never invents staff, removes leave or silently relaxes mandatory coverage.

### 6. Automated versus human-controlled?

Calendar/history expansion, generation, audit, coverage and ranked direct replacements are automated. Managers authorize duties, configure policies, record approved time off, inspect/pin/edit, resolve exceptions and publish. Server permissions, fresh validation and revision checks enforce those boundaries.

### 7. Doubling team and brands?

Benchmark the real workload first. The aggregate repository already provides transactions and stale-write protection. Profile repeated audit/index work, move expensive scheduling to bounded background jobs if needed, and normalize/index individual entities when query and reporting patterns justify it. Introduce a stronger solver only if measured schedule quality requires it; do not assert linear scaling or guaranteed optimality.

### 8. One additional week?

Prioritize stable domain/HTTPS hosting, offsite backup and restore drills, monitoring, stronger identity/account administration and realistic multi-user/load/security acceptance. Then improve interval-level coverage, deeper history integration, solver quality/swap search and any client-specific rest entitlements.
