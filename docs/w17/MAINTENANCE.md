# Maintenance plan (single-instance pilot)

Companion documents: `docs/w16/RUNBOOK.md` (operating procedures and alert thresholds), `docs/w17/KNOWN_LIMITATIONS.md`, `docs/w17/adr/`, `CONTRIBUTING.md`.

## 1. Roles
| Role | Responsibility |
|---|---|
| Service owner (course instructor or the unit that adopts the pilot) | Approves changes, accepts residual risks, owns the retention policy |
| Maintainer (the student developer, or a named successor) | Keeps the code, tests, specification and runbook current; does releases and rollbacks |
| Custodian (operations user) | Clears the manual queue, approves disposal, reports problems |
| Security contact (to be named) | Receives vulnerability and incident reports; decides on secret rotation |

Names and contact details are left blank on purpose and must be filled in by the service owner before the pilot starts.

## 2. Routine tasks
| When | Task | How | Done by |
|---|---|---|---|
| Continuously | Probe `/ready` and read `/api/metrics`; alert on the thresholds in the runbook (event-loop p99, CPU, 5xx rate, file size) | Monitoring tool or a script every 15-60 s | Maintainer |
| Daily | Clear the manual queue (failed notifications, disposal reviews); check no unexplained 429/403 spikes in logs | Manual queue screen; `GET /api/logs` | Custodian |
| Weekly | `npm audit --omit=dev`; read the Node.js and Flutter security announcements; apply patches through the normal release process | Command line | Maintainer |
| Weekly | Check free disk space and the data file size; archive closed reports if above 8 MB | File system | Maintainer |
| Monthly | **Restore test**: copy the off-machine backup to a scratch location and start the API against it; confirm reports load | Runbook section 5 | Maintainer |
| Monthly | Review accounts: remove leavers, check roles | Accounts source (seed file in the pilot; identity provider later) | Service owner |
| Monthly | Review the capacity figures: reports stored, p95 per route, CPU and event-loop alerts raised | `/api/metrics`, logs | Maintainer |
| Quarterly | Rotate `JWT_SECRET` (signs everyone out); renew the TLS certificate at least 30 days before expiry | Deployment environment, health-gated deploy | Maintainer |
| Quarterly | Review `KNOWN_LIMITATIONS.md`: close what is done, re-rate what changed | Document review | Maintainer and owner |
| Per release | Release checklist (section 4) | | Maintainer |
| Per Node/Flutter major version | Run the whole test suite and the performance suite on the new version before adopting it | `npm test`, `flutter test`, `perf/run-suite.js` | Maintainer |

## 3. Incident playbooks (first response)
| Symptom | First checks | Action |
|---|---|---|
| Service down (`/health` fails) | Process running? disk full? port in use? recent deploy? | Restart; if a recent deploy, roll back to the previous release; look at the last log lines |
| `/ready` is 503 `storage_unavailable` | Disk full or read-only? permissions? | Free space or fix the volume; the next successful write clears the signal. Reads still work meanwhile |
| Event-loop delay or CPU alert | Login burst? runaway client? data file very large? | Check `/api/metrics` routes and `/api/logs`; raise rate limits only if the traffic is legitimate; plan the database move if the file is large |
| Many failed logins or lockouts | Source IPs, targeted accounts (`auth.login_failed`, `auth.locked_out` logs) | Keep lockouts; consider blocking the source at the proxy; if a real user is locked out they wait 15 minutes or the maintainer restarts the service |
| Data file corrupt | Start-up log says so | The service recovers from `.bak` automatically and logs `store.recovered_from_backup`; check how many reports were lost; if both are bad restore the off-machine copy |
| Bad release | Gate failed or users report errors after a deploy | Roll back (stop, start previous release, gate); file a defect with a test |
| Suspected secret leak | Evidence of the secret in logs, repository or chat | Rotate `JWT_SECRET` immediately (all sessions end); review audit entries since the suspected time; tell the security contact |
| Notification failures piling up | Manual queue growing | Fix the cause (gateway, addresses), then use Re-send; see ADR-002 for the permanent remedy |

After any incident write a short note (what happened, how it was detected, what fixed it, what test or alert is added) and add the test.

## 4. Release process
1. Work on a short-lived branch; one change per branch.
2. Required before merging (all must be green): `npm test` (97 tests), `flutter analyze` and `flutter test` (37 tests), `node scripts/trace-check.js` (every test mapped, every requirement tested), contract tests (they fail if the OpenAPI document and the API differ), `npm audit --omit=dev` clean.
3. If an endpoint changed: update `api/openapi/spec.js`, run `node scripts/gen-openapi.js`, and re-run `node scripts/mutation-check-openapi.js` if the test approach changed.
4. Update `CHANGELOG.md` and bump the version in `api/package.json` and `info.version` of the spec.
5. Build the web app with the correct `API_BASE` and **without** `DEMO_TOOLS`.
6. Deploy with the health-gated procedure; keep the previous release directory until the next release.
7. Smoke check on the live site: sign in as each role, open Matches and Notifications.
8. If the gate fails, roll back first and investigate afterwards.

Emergency fixes follow the same checks; the only shortcut allowed is a smaller change.

## 5. Change control and versioning
- Semantic version in `api/package.json`; the API contract version is `info.version` in the OpenAPI document (ADR-006).
- Breaking API changes need a new path prefix and a one-release overlap. Additive changes do not.
- Every behaviour change needs a test; every defect fix needs a test that fails before the fix.
- Decisions that change the architecture get an ADR (`docs/w17/adr/`).

## 6. Data lifecycle (proposal, needs the service owner's approval)
| Data | Proposed retention | Reason |
|---|---|---|
| Closed or disposed reports and their matches | 12 months after closing, then deleted | Long enough for disputes; descriptions may contain personal details |
| Audit trail | 24 months | Accountability for releases |
| Logs | 30 days | Operational use only; they contain no report text or credentials |
| Backups | 30 days | Matches the report retention plus a grace period |
Deletion is not implemented yet (KNOWN_LIMITATIONS L-03, L-22): until it is, the maintainer archives manually.

## 7. Documentation upkeep
`README.md` (how to run), `CONTRIBUTING.md` (how to change), the runbook (how to operate), the OpenAPI document (how to call), ADRs (why), this plan (what to do regularly). When a command, threshold or default changes, change the document in the same release.

## 8. End of life
If the pilot ends: export reports and the audit trail to the service owner, delete the data file, backups and logs, remove the accounts, revoke the certificate and secret, and archive the repository.
