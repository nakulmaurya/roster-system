# Release verification — 0.3.0

## Validated scope

Fictional-data, browser-local scheduling demo. The independent engineering reviewer approved this bounded demo scope, not use as a production personnel platform. Historical findings and follow-ups are preserved in `reviews/`; some earlier entries intentionally describe pre-fix failures. Final ordinary regression tests are the executable acceptance contract.

## Reproduce

```bash
npm ci
npm run check
npm start -- --hostname 127.0.0.1 --port 3000
# In a separate terminal, with Chromium installed:
npm run test:e2e
```

The local exact-release checks passed: lint, types, 127 unit/integration tests, optimized build, and 21 production-browser cases. `verification/` contains execution logs and point-in-time dependency audit. Browser screenshots at 1600, 390 and 320px, settings, coverage and assignment inspection were visually inspected; no full accessibility certification is claimed.

## VM deployment

The candidate was built and checked in an isolated release directory before changing the dedicated `datastraw-roster` systemd service. The prior application directory and service configuration were retained for rollback. No unrelated services were stopped or reconfigured. A health check after the switch returned HTTP 200 on VM localhost port 3000, with release version 0.3.0. All 21 browser acceptance cases passed again against that deployed service through a private SSH tunnel. SHA-256 checks confirmed all listed runtime source, test and configuration files match the validated local revision. See `verification/deployed-browser.log` and `verification/deployed-checksums.log`.

External reachability is separate: the public-IP port-3000 probe did not return an HTTP response. Do not call the submission URL publicly working until the cloud firewall/routing is configured and independently checked. SSH access and a private tunnel can work even when the application port is not publicly reachable.

## Remaining release restrictions

- No connected central DB, authentication, cross-device synchronization or tamper-proof approval.
- Daily capacity only; no intraday shift incompatibility or comprehensive labor-rule compliance.
- Previous-month work history is not loaded automatically.
- Greedy generation is neither optimality nor infeasibility proof; preprocessing is not strictly time-interruptible.
- Local-storage conflict detection is best effort, not atomic multi-tab transaction/merge.
- Use fictional data and JSON backups. See README for other management-workflow gaps.
