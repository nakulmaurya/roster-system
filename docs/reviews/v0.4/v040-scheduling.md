# v040 assessment scheduling completeness

## Implemented surface

Owned files only: `src/core/engine/**`, `src/domain/roster/{service.ts,adapter.ts,validation.ts,seed-data.ts}`, and domain/engine regression tests. No schema.ts, UI, hook, backend, package, Git, remote, or VM changes. No external algorithm or package introduced; no external algorithm licensing needed.

### Requirement interval contract

`brandProcesses[].shift?: { startMinute: number; endMinute: number; timezone: string }` is retained and validated by canonical dataset/backup schemas, including published snapshot datasets. Domain adapter and demand expander carry it to `DemandSlot.shift`.

- Start is integer 0..1439; end integer 0..1440. End <= start crosses midnight. Equal endpoints mean a 24-hour shift, not a zero-duration duty.
- Intervals are half-open: an exact end/start adjacency does not overlap.
- Explicit IANA timezone per shift. Domain planning calendar/leave dates remain explicitly Asia/Kolkata; pure engine horizon may use another valid timezone. Cross-zone shifts are compared using actual UTC epoch milliseconds, not wall-clock labels.
- Intl-derived offsets resolve local times to unique exact instants. Nonexistent spring-forward and ambiguous fall-back boundary times are rejected, not silently guessed. An ordinary midnight-to-midnight DST transition day can be 23/25 elapsed hours.
- Old datasets/backups with no shift remain accepted. They mean a conservative **full local day, 00:00 to 24:00 Asia/Kolkata** in the roster adapter (pure-engine omitted shifts use its horizon timezone). Old backups are not silently upgraded to an invented eight-hour pattern. Consequently, simultaneous old full-day half-capacity duties are incompatible; intentional compatible duties must be bundled or receive explicit nonoverlapping shifts.
- One requirement can cover `coveredProcessIds` with exactly one calendar, staffing demand and shared shift. Different schedules require separate nonoverlapping process-ownership requirements; no per-process interval inside one bundle.

### Hard enforcement and honest rest

Mandatory shift checks run during greedy candidate filtering, replacement filtering, final solver audit, and standalone validation even if callers omit optional constraint plugins. `H7_SHIFT_OVERLAP` rejects simultaneous incompatible duties across dates/timezones and previous-month history. `H8_MINIMUM_REST` rejects a configured insufficient gap. Coverage excludes resources with shift conflicts rather than reporting 100% covered on invalid duties. Daily workload capacity remains a separate constraint, accounted on the allocation start date.

`SolverCustomConfig.minimumRestMinutes?` / engine `problem.minimumRestMinutes?` are bounded nonnegative integer minute policies (0..10080), default 0. The public scheduler factory forwards this policy for generation, validation and suggestions without mutating caller problems. This is a configurable **operational rule**, not labor-law compliance certification. Full-day legacy shifts plus positive rest are deliberately conservative and may require explicit real shift configuration.

Consecutive-day and off-day handling use calendar dates actually touched in the planning timezone, not just a shift's start label. Overnight work cannot create a fake next-day off record. End-at-midnight does not occupy the next day. Leave/comp-off/blocking on any touched planning date excludes that candidate; pinned work remains visible and independently fails audit.

The solver remains deterministic greedy/static-MRV plus soft ranking. No backtracking, proof of optimality, or proof of infeasibility was added or claimed.

### Automatic previous-month dependency policy

The service derives history automatically from the same workspace family's adjacent archived month (`<workspace>:YYYY-MM`). If that prior month is active, its current recorded allocations take precedence over its stale archived copy. It does not reuse unrelated months or unrelated workspace families.

History means **recorded roster assignments**, not verified attendance/payroll clock-ins; the application has no clock-in model. Recorded work counts even if currently ineligible or on leave. A removed/unknown requirement with a valid prior-month allocation date is conservatively counted as a full-day interval instead of erasing work. Out-of-period invalid allocation dates remain invalid in their own schedule rather than masquerading as adjacent-month work.

Service/HTTP shape is JSON-safe:

```ts
trailingContext: {
  resourceTrailingWorkDays: Record<string, string[]>;
  resourceWorkIntervals: Record<string, { date: string; startMs: number; endMs: number }[]>;
}
```

The pure engine still accepts the former Map for existing in-process callers/tests; service output never depends on Map JSON serialization. Interval and date cache outputs are detached, and published snapshots pin the exact JSON history used for their audit.

Generation, repair and publication rebuild against automatic history. Every successful service transaction rebuilds and independently audits **all stored periods**, including archives; this is not limited to the selected month. A changed previous-month history demotes a dependent `PUBLISHED` period to `DRAFT` and advances its draft version even when its existing assignments still pass. Blockers also prevent keeping publication. Old snapshots are preserved; the historical snapshot is audited against its captured history, while current status is compared against current history. Republish uses a new version.

Import is atomic and two-pass: construct the entire library first, then derive history and audit every current period and historical publication. Imported current publication cannot retain PUBLISHED when captured history differs. Legacy snapshots without captured history are audited against available archives. Malformed historical publications reject restore. Backend and CRUD workers were told about additive shift/rest/snapshot fields and the JSON transport; CRUD's whole-library canonical restore preserves them.

### Performance/safety notes

Timezone/date caches contain immutable scalar-derived interval/date results only and return detached values. Fresh coverage indexes are constructed per audit/measurement, so caller edits cannot reuse stale cached schedule coverage. Candidate lookups reuse a per-solve demand index. Changing to a new month now generates directly from its workspace catalog, instead of solving an unrelated demo roster before replacing it.

## Verification actually executed

- `npm test -- src/core/engine/__tests__/assessment-qa.test.ts src/domain/roster/__tests__/scheduling-history.test.ts`: **28/28 passed** (21 independent engine boundary cases plus 7 new history/service cases), log `/data/scheduling-focused.log`. This pass preceded the final fresh-coverage-index performance-only change.
- New history cases cover JSON transport, automatic sixth/seventh-day boundary generation and repair, imported invalid pin publication blocking, active prior-month edit invalidating an archived publication, imported history changes invalidating current publication even if still feasible, pinned history + shift roundtrip, invalid shift atomic rollback, legacy defaults, and unrelated-month exclusion.
- Existing fractional-capacity stress fixture now supplies explicit adjacent eight-hour shifts; old no-shift simultaneous duties no longer falsely pass overlap checks. Legacy Map test mutation adjusted to reconstruct a Map-valued context under the backward-compatible Map-or-record type.
- Owned-file ESLint command: **clean**, `/data/scheduling-lint-final.log`.
- `npm run typecheck`: **passed**, `/data/scheduling-typecheck-final.log`.
- Two initial full engine/domain attempts were stopped rather than presented as passing; CPU contention from several concurrent agent test runners caused wall-clock timeouts. The earlier full attempt observed existing QA-08 (101 publication/backup cycles) exceeding its 5-second default; no functional assertion failure was observed before stopping. Logs `/data/scheduling-tests-first.log`, `/data/scheduling-all.log`.
- Bounded `vitest run src/domain/roster/__tests__/qa-review.test.ts -t QA-08 --maxWorkers=1` also hit its 5-second test timeout under remaining QA/full-suite contention (46.91s total); it is **not a passing result**. `/data/scheduling-qa08.log`.
- Parent was asked to run one final serialized full suite after source freeze. No build or browser/VM claim from this worker.
