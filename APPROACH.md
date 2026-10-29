# Approach and engineering decisions

## Goal and delivery model

The DATASTRAW operations problem is the first adapter on a reusable resource/service scheduling engine. The application prioritizes accurate coverage, explicit eligibility, explainable conflicts and safe human edits over an “AI optimizer” claim.

## Data and persistence

Employees, brands, processes, pods/leads, calendars, requirements, eligibility, availability and dated allocations are separate domain records with reference validation. Compatible processes may share one explicit work bundle; separate calendars or incompatible hours require separate services. A requirement carries distinct staffing, daily workload, operating rules and optional actual shift interval.

The running application uses PostgreSQL, not browser storage. Canonical month/workspace documents are JSONB aggregates with revision-controlled updates. Sessions and immutable publication snapshots are independent SQL records. This fits the assessment's small configurable team and keeps the domain engine portable. It trades relational per-entity queryability for a simpler aggregate transaction; normalize/index further only when real reporting/query needs justify it. The unused legacy ORM schema was removed rather than pretending those tables were connected.

## Authority and safe changes

Only server-issued sessions identify workspace and role. Real manager/viewer credentials use scrypt hashes; public reviewers explicitly provision isolated, expiring fictional demo workspaces. Request body workspace identifiers cannot select another workspace. HTTPOnly cookies, exact Origin and CSRF checks protect mutation routes; server-side role checks reject viewer writes.

Every update locks the PostgreSQL workspace row and checks the supplied revision. Competing writes at one revision have one winner; the loser reloads rather than merging or overwriting. Client calculations are proposals, never publication authority. The domain module is used through a synchronous import/action/export/finally-clear bridge with no await; no user workspace survives across a server async boundary. Independent request-isolation tests cover this seam.

Domain commands use copy-on-write, canonical validation, detached inputs/results and rollback. Catalog removal is reference-restricted, never a hidden cascade deleting pins, baseline work or history. Catalog changes apply to the open month and preserve other months/snapshots; this scope is stated in the UI.

## Scheduling and validation

Expand operating calendars/holidays/date-specific overrides, load recorded prior-month work, validate configuration and preserve locks. Order demand by initial scarcity/priority and greedily score currently valid resources using preferences. No backtracking, optimality or infeasibility proof is claimed.

A separate audit checks references, real dates, availability, eligibility, positive workload, daily capacity, distinct coverage, configured fatigue/rest and actual shift overlap. Fractional capacity does not make simultaneous duties compatible. IANA wall times are converted to real instants; overnight and adjacent intervals are handled explicitly. Ambiguous/nonexistent DST boundaries fail closed. Legacy no-shift records mean a full-day Asia/Kolkata interval; configure hours for time-sharing services.

Previous-month recorded assignments supply both work dates and intervals. Earlier edits re-audit dependent months and reopen impacted publications for review. Missing history is unknown, not fabricated proof of compliance. Minimum rest is an operating policy, not comprehensive labor-law validation.

## Human decisions and publication

Managers configure authorization, staffing, calendars, shifts and policy; record approved leave/comp-off; inspect candidates; edit/pin; resolve exceptions; then publish. Approved leave removes affected unlocked work, while invalid pins remain visible blockers. Direct gap repair considers valid candidates incrementally but does not perform arbitrary multi-person swaps.

Publication reruns the authoritative server audit and creates its own timestamp/version/snapshot. Existing server history is compared semantically, preserved across reset/import, protected by SQL update/delete triggers, and never adopted from client flags. Effective later changes reopen drafts; no-op repair preserves publication. Explicit deployment limits reject new work before commit rather than silently dropping history.

## Interface and operations

The Notion-inspired shell separates browsing, coverage investigation, management and changes. A readable week is default; full month and all stakeholder views remain available. Focus-trapped dialogs, focus restoration, labelled controls, mobile navigation and contained table scrolling are browser-tested; no full accessibility certification is implied.

Deploy validated releases separately, retain previous service configuration, migrate before switching, and verify runtime plus external HTTPS independently. PostgreSQL is loopback-only with separate restricted application/test roles. Secrets are private configuration, never source. A temporary Quick Tunnel solves evaluator access without changing unrelated VM services, but stable production hosting needs a named tunnel/domain and an operational owner.

## Verification and next production work

CI provisions PostgreSQL and tests lint, types, units, real DB/API behavior, production build and browser workflows. Dedicated test databases are explicitly named and destructive reset is guarded. Independent specialist reviews and a requirement-by-requirement matrix remain separate from implementation claims. Final execution records and unresolved submission assets are in the release/compliance documents.

For real operational use, prioritize stable hosting, restore drills/offsite backups, monitoring, richer account administration, load/security testing and agreed client/jurisdiction policy. Optional notification/approval integrations and stronger solver search follow measured needs. None of those optional improvements is silently presented as already implemented.
