# Changelog

Versions follow `api/package.json` (also `info.version` in the OpenAPI document).

## 0.18.0 - Week 18 (final examination)
Added
- Demo kit (`demo/`): one-command start with seeded history, preflight GO/NO-GO, narrated end-to-end fallback with segment selection. Evidence map and its checker, final delivery check, submission bundle builder with a clean-extract verification, viva guide, reflection template.
Fixed (found while preparing and verifying the submission)
- Static host: the first request for the 7 MB renderer took 35 s because maximum-quality brotli ran synchronously, blocking every other request. Now asynchronous, moderate quality, per requested encoding, and pre-compressed at start (`warm()`). Tests D05 and D06; D05 fails against the old behaviour.
- Test infrastructure: `npm test` now runs each test file as its own process with a hard timeout (`api/scripts/run-tests.js`) after the clean-copy verification saw `node --test` leave finished test processes spinning at 100% CPU (cause not identified; see KNOWN_LIMITATIONS L-24). Test clients no longer reuse keep-alive connections (a random "fetch failed" when a closed test server's port was reused). P07 no longer uses a ratio (it flaked); it takes the best of five batches. 0 failures in 20 consecutive full runs afterwards.
- Secrets scanner: a regex that let whitespace span a line break gave a false positive on the empty `JWT_SECRET=` example line; the scanner is proven to fire on a planted secret and key header.
Corrections to earlier reports
- Week 16 report (section 10) lists P07 as "< 12 ms mean per create at 10,000 reports"; Week 17 reports (SA9 section 6.3, AS3 section 11) say P07 was replaced by a ratio of cost at two data sizes. Both versions of that test later proved unreliable under machine noise, and P07 is now "best of five batches under 15 ms" (typically 3 ms). The test's earlier title and comment also claimed the pre-fix ratio was "about 30x"; that figure was never measured and has been removed. What is supported: creating a report at 10,000 stored reports cost about 30-60 ms before caching (Week 16 profile) and about 3 ms after.

## 0.17.0 - Week 17 (UAT, documentation, evaluation)
Changed (API contract)
- `POST /api/matches/{id}/verify` now requires a `note` of 5-200 characters (the proof checked, or the reason for refusing); the decision is rejected with 422 without it. **Breaking for any client that omitted the note** (the Flutter app was updated; there are no external consumers yet).
- `GET /api/matches` includes item summaries: staff get `lost` and `found` (with reporter ids); owners get only their own `lost` summary. Still no found-item id or details for owners.
- Notifications carry `createdAt`.
- Matching: a candidate now needs at least half of the shorter description present in the other (overlap rule). Generic shared words (a colour, "tag") no longer create candidates.
Added
- OpenAPI 3.0.3 description served at `GET /api/openapi.json`, exported to `docs/w17/openapi.yaml`; contract tests C01-C06; mutation check of those tests.
- Reference static host (`scripts/static-server.js`) with tests D01-D04.
- Architecture, data-flow and state-machine diagrams; six ADRs; maintenance plan; known-limitations register; contributing guide.
Fixed (UAT findings)
- F1 matches screen showed only ids: now shows both items side by side. F2 one-click verify with a canned note: now a dialog requiring the proof/reason and a release confirmation. F3 weak matches (see above). F4 internal ids and codes shown to users: plain language. F5 demo simulator visible to everyone: compiled in only with `--dart-define=DEMO_TOOLS=true`. F6 blank page on first load: loading screen. F7 confirmation messages vanished after 4 s: 8 s with a close button. F8 a decision could be silently dropped if the layout changed while a dialog was open. F9 static host cache policy served stale app code for up to an hour after a deploy.

## 0.16.0 - Week 16 (performance and deployment)
- Asynchronous password hashing; cached match tokens; group-commit storage with atomic writes; readiness probe; staff-only metrics; slow-request log; graceful shutdown; proxy-aware rate limiting.
- Measured: peak throughput 52 to 170 req/s, p95 1.3 s to 108 ms; 10,000 stored reports p95 5.5 s to 80 ms. Rehearsed crash recovery and rollback. Runbook added.

## 0.15.0 - Week 15 (testing and hardening)
- 16 defects found by failing tests and fixed (timezone-safe dates, real calendar dates, Unicode matching, double release, double re-send, atomic persistence, bounded in-memory tables, separation of duties, paging, and two UI bugs). Traceability gate.

## 0.14.0 - Week 14 (secure integration)
- Real authentication (scrypt, signed tokens), role and ownership checks, HTTPS, protected configuration, strict validation, safe logging, rate limits and lockout.

## 0.13.0 - Week 13 (automation foundation)
- Reports, duplicate control, candidate matching, notifications with bounded retries, manual queue, aging job, structured logs, Flutter Web screens.
