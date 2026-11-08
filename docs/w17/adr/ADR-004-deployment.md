# ADR-004: Deployment topology - one instance with a health-gated deploy

Status: Accepted for the pilot.

## Context
The service must be deployable and recoverable by one person. Week 16 rehearsed crashes, corruption and bad releases.

## Options considered
| Option | Strengths | Weaknesses |
|---|---|---|
| A. One instance, stop-start deploy with a health and smoke gate and automatic rollback (chosen) | Simple; matches the single-writer file store and in-memory lockout, revocation and rate counters; rollback rehearsed at about 2 s | About one second of downtime per deploy; no redundancy: a host failure is an outage until restart |
| B. Two or more instances behind a load balancer, rolling deploy | Zero-downtime deploys, tolerates one failure | Requires a shared database and shared counters (ADR-001, ADR-003), sticky or shared sessions for revocation, a load balancer to run and secure |
| C. Containers on an orchestrator | Standard tooling, easy scaling | Disproportionate for a pilot; adds a platform to learn and secure |

## Decision
Option A. Run one process; keep the previous release directory; deploy with: stop (graceful) -> start candidate on the same data file -> gate (`/ready` within 10 s, then log in and read reports) -> on failure restart the previous release. Put a TLS-terminating proxy or a CA certificate in front (`TRUST_PROXY`, `TRUST_PROXY_TLS`). Serve the Flutter files from a static host with the behaviour defined and tested in `scripts/static-server.js` (D01-D04): compression, always-revalidate for non-fingerprinted files, security headers.

## Evidence
Rehearsals (docs/w16): code regression and a missing production secret both rolled back in 2.0 s and 1.7 s with data intact; a good release deployed with 1.0 s downtime; hard-kill recovery in 0.9 s. Environment comparison: HTTP, HTTPS and production mode were within run-to-run variation. Week 17 retest found that a one-hour cache on the app script served stale app code after a deploy; fixed and tested (D01).

## Consequences
- A deploy is not invisible to users: schedule it outside busy hours or accept a one-second blip.
- Never run two instances against one data file.
- The gate must include an authenticated read, not only `/ready`, because a code regression passed readiness but failed the smoke read in the rehearsal.

## Revisit when
Availability targets above about 99%, a database replaces the file (ADR-001), or the shared-state items in KNOWN_LIMITATIONS are done.
