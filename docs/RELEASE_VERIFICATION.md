# Release verification — 0.4.0

## Decision and tested scope

The core assessment implementation passed the final source, real-database, public-HTTPS browser and recovery checks listed below. This is an assessment-ready fictional-data application, **not enterprise, security, accessibility or labor-law certification**. Full applicant submission is incomplete until the GitHub repository and LinkedIn links are supplied; stable review-period hosting still needs an operator-owned endpoint.

Public application at verification time: https://thank-consumption-motivation-seniors.trycloudflare.com

Choose **Try the interactive demo**. No account is required for an isolated, temporary PostgreSQL workspace. The hostname is a Cloudflare Quick Tunnel: it works externally but can change if the tunnel is recreated and has no uptime guarantee.

## Executed gates

| Gate                                                               | Result                                                                                                             | Evidence                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Lint, TypeScript, unit/domain/real-PG integration, optimized build | Passed; **213 tests / 14 files**, no skips                                                                         | `verification/v0.4/check.log`                                      |
| Public production browser suite                                    | **27/27 passed** over external HTTPS                                                                               | `verification/v0.4/public-browser.log`                             |
| Actual 30-person roster publication                                | Passed explicit backup authorization → resolve coverage → publish full realistic demand → edit → immutable history | Final public-browser case; no demand removal or staffing reduction |
| Auth/session/isolation/CAS                                         | Unauthenticated401, viewer403, bad origin/CSRF403, stale409, forged publication refusal, actual session isolation  | Independent assessment browser cases + real-PG tests               |
| Configurable working intervals/history                             | Overnight, adjacency, DST rejection, rest and recorded cross-month history                                         | Engine/service tests; shift UI persistence browser case            |
| CRUD                                                               | People, brands, processes, pods/leads, reference restrictions and rollback                                         | Management40 tests + public catalog browser scenario               |
| Responsive layouts                                                 | Public browser390px/320px plus fresh screenshot inspection                                                         | Public browser log; `screenshots/v0.4/`                            |
| Actual application process restart                                 | Saved session, revision and fictional sentinel survived                                                            | `verification/v0.4/restart.log`                                    |
| Actual PostgreSQL cluster restart                                  | Application PID survived; reconnect restored same saved session/revision/data                                      | Same restart log; pool-recovery regression                         |
| Private backup and disposable restore                              | Daily timer enabled; mode0600 custom dump restored into separate probe DB with29 workspaces; probe DB removed      | `verification/v0.4/backup-restore.log`                             |
| Deployed source parity                                             | All runtime, script, migration, test and listed config SHA-256 checks matched                                      | `verification/v0.4/deployed-checksums.log`, `runtime-sha256.txt`   |
| Dependency audit                                                   | Zero reported vulnerabilities at this point in time                                                                | `verification/v0.4/dependency-audit.json`                          |

## Deployment boundary

The dedicated roster app runs as unprivileged `rosterapp`, not the VM administrator, from a root-owned read-only `/opt/roster/releases/v0.4.0`. Node24 and PostgreSQL17 are used. App3400 and PostgreSQL5432 bind loopback only. A separate unprivileged tunnel process provides HTTPS; production cookies are Secure. Private credentials/environment/backup data are outside the repository. Only dedicated roster services and the newly provisioned roster PostgreSQL cluster were restarted.

Server-side authority is PostgreSQL revision/row-lock transactions, fresh publication audit and immutable SQL history, not localStorage or client status. New sessions get scoped workspace authority. The synchronous bridge clears its temporary module state before yielding. Limits are explicit, including2MB requests,24 monthly documents,300 employees,150 services and100 server publications per period.

## Reproduction and honest limitations

Follow README and `deployment/postgresql-sessions.md` with a dedicated test database; tests that need PostgreSQL must actually be enabled. The default test timeout is20seconds because the101-publication full audit roundtrip takes roughly10seconds; this is a performance disclosure, not a weaker functional assertion. The final public browser suite was serialized after a ready production service; earlier race/selector/artifact collisions are not credited as passes.

The solver is greedy and audited, not an optimality/infeasibility proof. Shift-level seats use configured intervals, not arbitrary interval-by-interval demand within a shift. Missing historical work remains unknown. Rest policies are configurable, not legal advice. Configured manager/viewer credentials are limited account administration, not MFA/SSO. Daily backups currently share the VM; encrypted offsite copies, alerts, load/security acceptance and stable hosting remain operational follow-ups.

The assessment source is published without a GitHub Actions workflow. Earlier CI configuration was retained only in the original local history; no hosted CI execution is claimed. No application email/social submission was sent. Historical v0.3 evidence remains labeled in `verification/` and is not current deployment proof.

## Walkthrough artifact

`public/walkthrough.mp4` is a3minute56second captioned recording of the actual public app using fictional demo data. It demonstrates generation, month/calendar views, person/pod/process views, eligibility/service/catalog settings, a sole-primary leave change, coverage blockers, candidate inspection and honest unresolved repair. It is not an applicant voiceover or a simulated UI. All 15 scene screenshots and representative encoded caption frames were inspected; full MP4 decoding completed without errors. Public download/hash verification is retained alongside release evidence.

## Narration-only follow-up

Kokoro CPU narration was added after the functional release gates above. No app/engine/API dependencies or code changed. The original captioned video remains available; `public/walkthrough-narrated.mp4` adds an AAC audio track and preserves the exact original H.264 video stream. All 15 passages fit their scene windows without speedup or cutting. Final AAC measured -16.48LUFS integrated and -1.30dBTP; full decoding completed without errors. Public download matched release bytes; browser playback and the saved-data restart probe passed.

The narrator is the preset `af_heart`, not the applicant or a cloned identity. Alternative auditions are supplied for subjective review. No independent human listening/quality ranking is claimed. The earlier 213/27 functional test counts are not a new test run or subjective TTS evaluation; see separate narration evidence.
