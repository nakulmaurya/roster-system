# Engine stress review — final demo-release handoff

**Disposition: all three findings addressed and covered by passing ordinary regressions.** No unresolved defect from this focused review remains. This is not a production-compliance certification.

Scope: README.md and `src/core/engine`; Node 24.22.1, Vitest 5.0.5. This reviewer added/updated only `src/core/engine/__tests__/stress-review.test.ts` in the project. Production fixes were made by the parent implementer. This finalization changed only this report; no source/test changes or new test runs.

## Ranked findings and resolution

### 1. Medium — malformed fatigue limit disabled the mandatory rule — ADDRESSED
- **Current fix:** `src/core/engine/constraints.ts:359–362` validates the constructor argument as a positive integer (`Number.isInteger` also rejects NaN and infinities), otherwise throwing `RangeError`.
- **Expected:** reject malformed fatigue configuration before scheduling or auditing.
- **Originally reproduced:** NaN made both streak comparisons false; one employee received seven consecutive one-unit daily allocations with `FEASIBLE` and no violations.
- **Current verification:** ordinary F1 generation-path regression and parameterized constructor rejection for NaN, ±Infinity, zero, negative and fractional limits all pass in the final check.
- **Exact regression:** `./node_modules/.bin/vitest run src/core/engine/__tests__/stress-review.test.ts -t 'F1'`; fixture/assertions at test lines 109–113 and 131–133.

### 2. Medium — colon-containing resource IDs corrupted capacity diagnostic targets — ADDRESSED
- **Current fix:** `src/core/engine/constraints.ts:117,125–145` stores original `resourceId` and `date` in the aggregation entry and reads those fields instead of splitting the composite key.
- **Expected:** an overload for `team:r` on `2026-11-01` identifies that exact resource/date.
- **Originally reproduced:** two one-unit allocations against capacity 1 generated resource `team` and date `r`; the overload blocked correctly but its diagnostic target was wrong.
- **Current verification:** ordinary F2 regression asserts the complete resource ID and correct date and passes in the final check.
- **Exact regression:** `./node_modules/.bin/vitest run src/core/engine/__tests__/stress-review.test.ts -t 'F2'`; minimal reproduction at test lines 114–120.

### 3. Low — repair advisor understated candidate fatigue — ADDRESSED
- **Current fix:** `src/core/engine/repair-advisor.ts:104–122` includes trailing history and walks both backward and forward through work dates.
- **Expected:** the candidate fatigue metric represents the full consecutive run around the proposed date, consistent with the hard rule.
- **Originally reproduced:** five prior-month workdays plus November 1 reported 1 rather than 6; November 2–4 pinned work plus November 1 reported 1 rather than 4.
- **Current verification:** ordinary F3 and F4 regressions assert 6 and 4 respectively and pass in the final check.
- **Exact regressions:** `./node_modules/.bin/vitest run src/core/engine/__tests__/stress-review.test.ts -t 'F3|F4'`; minimal reproductions at test lines 121–130.
- **Scope:** the original issue affected metadata/tie-break ranking, not the standard hard constraint's acceptance checks.

## Final verification evidence

Inspected `/data/roster-final-check.log`: `npm run check` progressed successfully through lint, TypeScript, tests and production build; **127 tests passed across nine files**, including **44 ordinary stress-review tests**. There are no `it.fails` cases in the stress file. The four initial expected-failure tests were converted to ordinary assertions, and the obsolete assertion expecting seven days FEASIBLE was replaced with malformed-limit rejection cases.

The parent reports **21 production browser tests passing**. That browser result was not independently rerun or verified from a browser log by this reviewer; the supplied final-check log covers lint/typecheck/unit-integration tests/build.

Historical initial evidence remains at `/data/stress-review-test-output.txt` and `/data/stress-review-suite-output.txt` (35 ordinary + 4 expected failures focused; 92 ordinary + 4 expected failures full suite). Those logs describe the pre-fix state, not the release state.

### Boundaries exercised

Malformed dates/horizons/IDs/staffing/workload/timeouts; malformed locks preserved and blocked; duplicate allocation IDs; fractional daily capacity; distinct-person staffing; leave/sick leave/comp-off/blocked exclusions; pinned overload coverage; six-vs-seven-day fatigue; bridging past/future assignments; trailing-date deduplication and rest gaps; independent pinned-run audit; deterministic allocations for repeat/reversed inputs; no observed input mutation; zero-budget pin retention and audit.

### Larger synthetic workloads

All employees eligible for all services, 30-day horizon, unit workloads, one seat/service/day, six-day fatigue rule, 5000 ms budget. Results below are from the **final supplied check log**, not performance guarantees:

| Resources | Services | Slots / allocations | Wall time | Reported status | Timed out |
|---:|---:|---:|---:|---|---|
| 30 | 10 | 300 / 300 | 83.1 ms | FEASIBLE | false |
| 60 | 20 | 600 / 600 | 253.0 ms | FEASIBLE | false |
| 120 | 40 | 1200 / 1200 | 891.3 ms | FEASIBLE | false |

The benchmark assertions found no audit violations or duplicate generated IDs. These are simple synthetic cases, not evidence of general solution quality or worst-case runtime.

## Remaining solver/time-budget limitations — retain in demo messaging

- **Greedy, initial MRV ordering; no backtracking or automatic swap search.** A partial result means unresolved demand, not that no valid arrangement exists. No optimality or infeasibility claims follow from these tests.
- **Budget is not strict wall-clock cancellation.** Candidate preprocessing runs even with `timeoutMs: 0`; checks occur at seat boundaries, not inside all preprocessing, candidate scans or post-generation validation. The zero-budget regression verifies no new work, preserved pins and an independent audit—not a hard runtime deadline. Larger or difficult inputs can exceed the requested budget.
- **Invalid pins can require manager action.** They remain visible and blocking rather than being silently removed; generation/repair is not a general conflict-resolution search.
- **Month-boundary fatigue needs supplied history.** `trailingContext` is exercised, but the current roster adapter does not automatically load prior-month work. Without that history, the demo is not an established cross-month labor-entitlement audit.
- **Daily aggregate capacity, not hourly shifts/travel/dependencies.** Coverage and passed tests do not establish compatible time-of-day scheduling or production workforce compliance.

These limitations are documented in README.md and remain relevant despite the fixes. Demo handoff should describe the engine as a validated daily-capacity heuristic with explicit unresolved-demand/blocker reporting.

## Re-run

```bash
cd /data/roster-improvement
./node_modules/.bin/vitest run src/core/engine/__tests__/stress-review.test.ts
npm run check
```
