# Individual technical viva: preparation guide

**How to use this.** The viva is individual: you will be asked to explain and defend decisions, and possibly to open code and change something. Reading these answers is not enough. For every question: say the answer aloud in your own words, then open the file named under "Show me" and point at the lines. If you cannot explain a sentence here, open the code or test it refers to until you can; if something here does not match what you find in the repository, trust the repository and fix this document.

## 1. Summaries to be able to say without notes
**30 seconds.** "It is a campus lost-and-found system. Owners and staff report items through a Flutter Web app; a Node API validates them, finds likely matches automatically, notifies the owner with bounded retries, and routes ownership verification through a staff member who must record the proof. Security, tests, performance and acceptance testing were done and measured. My verdict is a supervised single-instance pilot, not unrestricted production."

**2 minutes.** Add: the pipeline every request passes (metrics, headers and CORS, rate limits, JSON limit, authentication, durability gate, routes with role checks); the data file with group commit and atomic writes; matching by category, word overlap, place and date, with a floor so generic words do not match; three tiers of failure handling (retry, manual queue, rollback); and that every claim has a file in the evidence map.

## 2. Numbers to remember (all from files in the repository)
| Fact | Value | Where |
|---|---|---|
| Automated tests | 134 (97 API, 37 Flutter), all pass | docs/w18/FINAL_DELIVERY_CHECK.md |
| Requirements | 32, every one has tests; every test maps to a requirement | docs/traceability.json, scripts/trace-check.js |
| Week 15 defects found by failing tests | 16 | docs/Project18_Week15_IA6_Hardening_Report.docx |
| Peak throughput | 52 to 170 requests/s; p95 1,283 ms to 108 ms | docs/w16/results-*.json |
| Health check during a 40-login burst | 1,802 ms to about 4 ms | same |
| Create-report p95 at 10,000 stored reports | 5.5 s to 94 ms (overall p95 80 ms) | same |
| Estimated demand vs capacity | about 6 req/s busy-hour burst (an estimate) vs about 250 req/s | W16 report section 3 |
| Hard-kill test | 601 acknowledged writes, 0 lost, restart 0.9 s | docs/w16/rehearsal-results.json |
| Bad-release rollback | 2.0 s (code regression), 1.7 s (missing secret), data intact | same |
| Acceptance scenarios | 14 of 14, 41 steps; before the fixes 13 of 14 | docs/w17/uat-results-*.md |
| UAT findings | 13: 9 fixed and retested, 4 deferred | SA9 report section 5 |
| OpenAPI | 20 operations; contract tests; 8 of 8 deliberate documentation errors caught | docs/w17/contract-mutation-check.txt |
| Architecture decisions | 6 ADRs | docs/w17/adr/ |
| Known limitations | 24 | docs/w17/KNOWN_LIMITATIONS.md |

## 3. Questions by area
Each answer is the short version. "Show me" is where you point. "Follow-up" is where examiners usually go next.

### Technology
**Why Flutter Web and Express?** Flutter Web is required by the course; Express is small, well known and enough: one core handles about 250 requests/s here. Security middleware (helmet, rate limiting, JWT) is mature. *Show me:* api/package.json, app/pubspec.yaml. *Follow-up:* "What limits Node?" One thread: any synchronous work blocks every user (Week 16 found synchronous password hashing doing exactly that).

**Why a JSON file instead of a database?** For a one-student pilot it is simple, inspectable and testable; it sits behind one class so it can be replaced. It has a ceiling: every write serialises the whole file (create p95 94 ms at 10,000 reports, 258 ms at 25,000), single writer, no encryption. So: database before production. *Show me:* api/src/store.js, ADR-001. *Follow-up:* "Why not SQLite?" Still single-writer; native module; it would be the stepping stone.

**Why JWT with HS256 and local accounts?** One service issues and verifies tokens, so a shared-secret MAC is enough; tokens last 15 minutes, are revocable on logout and live only in memory in the browser. Production should use the institution's single sign-on. *Show me:* api/src/auth.js, ADR-003. *Follow-up:* "What if the secret leaks?" Anyone could mint any role: rotate it (signs everyone out); that is limitation L-06.

### Architecture
**Walk me through a request.** Metrics, headers and CORS, rate limits, JSON parser (10 KB), authentication (verify the token, check the user and role still match), durability gate, route with `need(...roles)`, workflow function, response. *Show me:* api/src/app.js from the top, docs/w17/diagrams/architecture.png.

**What is the durability gate and group commit?** For a state-changing request the response is sent only after the change is on disk; concurrent requests share one asynchronous atomic write (temp file then rename). So an acknowledged write survives a crash, and the event loop is not blocked by disk I/O. *Show me:* the `res.json` wrapper in app.js; `commit()` and `_flushLoop()` in store.js; tests P02, P03, P04. *Follow-up:* "What happens if the write fails?" Every request in that batch gets 500, `/ready` turns 503, the next successful write clears it.

**Why a state machine for matches?** To make illegal sequences impossible: release only after verification, never twice, never for an item already released. *Show me:* `guardMatchActionable`, `verifyMatch`, `releaseMatch` in workflow.js; diagram state-machines.png; tests H16, H22. *Follow-up:* "Two claimants for one item?" Releasing one withdraws the other (candidate or verified).

**Why one instance?** The file has one writer and lockout, revocation and rate counters are in memory. Two instances would break all three. Needs a database and shared counters first (ADR-004).

### Security
**How do you know a student cannot verify a match?** The role comes only from the verified token; `need('security','custodian')` rejects with 403; test S12 and contract test C06 check every staff operation. *Show me:* app.js `need`, tests S11/S12. *Follow-up:* "What about changing the role in the token?" The signature fails: 401 (S05, live demo).

**Why 404 instead of 403 for someone else's report?** So existence cannot be probed (test S13).

**How are passwords stored and checked?** scrypt with a per-user salt, compared in constant time; verification runs on the thread pool so a login burst cannot freeze the server; unknown users also run one hash so timing does not reveal them. *Show me:* auth.js `verifyPasswordAsync`, `login`; test P01.

**What is not protected?** No multi-factor authentication, a shared signing secret, in-memory counters that reset on restart, logs that are not tamper-evident. These are in the limitations register with plans. *Show me:* docs/w17/KNOWN_LIMITATIONS.md L-05 to L-08, L-18.

**XSS and CSRF?** Responses are JSON and the client renders text, not HTML; the token is sent in an Authorization header (not a cookie) and kept in memory, so ambient-cookie CSRF does not apply; helmet sends security headers.

**What goes in the logs?** Ids, counts and reasons. A redactor removes sensitive keys and token-shaped strings as a safety net. Tests S20, S21. *Show me:* api/src/logger.js.

### Automation
**What triggers what?** Event-driven: matching and notification when a report is created. Scheduled: the aging job (hourly, plus on demand), which raises one reminder at 30 days and one disposal review at 90. *Show me:* server.js, workflow.js `runAging`, tests T10, H24.

**What is the retry policy?** Three attempts, 1 s then 2 s backoff for temporary failures; permanent failures stop at once; then a manual-queue item; staff can re-send, and a second re-send is refused. *Show me:* notifier.js `POLICY`, `deliver`; tests T06, T07, H13, H15. *Follow-up:* "What is the weakness?" Delivery runs inside the request, so a slow real gateway slows users: outbox and worker before a real gateway (ADR-002). I measured 3 s on a transient failure.

### Testing
**How do you know your tests can fail?** Three ways: Week 15 tests were written first and I kept the failing output; fixes were proven by tests that fail on the old code (U36 and D05 against the old behaviour); and the OpenAPI mutation check applies eight deliberate documentation errors and every one is caught. *Show me:* docs/w15/evidence-before-fix.txt, docs/w17/evidence-u36-before-fix.txt, docs/w17/contract-mutation-check.txt.

**What does the traceability gate do?** Fails if a test has no requirement, a mapping points to a missing test, or a requirement has no test. *Show me:* scripts/trace-check.js; docs/w15/traceability-matrix.md.

**Tell me about a test that was wrong.** P01 and P07 used wall-clock thresholds and failed intermittently when several test files ran in parallel. P01 became a deterministic check (counting calls to the blocking hash). My first replacement for P07, a ratio of cost at two data sizes, also flaked (the small size is so fast that noise dominates it: the ratio swung from 8 to 18 against a limit of 14), so it now takes the best of five short batches against an absolute limit; and the claim I had made that the old ratio was "about 30x" turned out not to be supportable, so I removed it. Also: my first contract tests accepted a wrong document because no response ever contained the wrong value.

**What did the final verification find, and what is still unexplained?** I extracted the submission bundle into a clean folder and ran its tests from scratch. Twice `npm test` never returned: every test had passed and then the finished test process spun at 100% CPU. It happened 3 times in about 35 runs in `node --test` mode and never in 72 direct runs. I could not find the cause. I changed `npm test` to run each file as its own process with a hard timeout, so it fails loudly instead of hanging, and recorded it as limitation L-24. The same investigation found a random "fetch failed" (a pooled keep-alive connection to a closed test server whose port number was reused), which I fixed, and a speed guard of mine that was itself unreliable. *Show me:* api/scripts/run-tests.js, docs/w17/KNOWN_LIMITATIONS.md L-24, CHANGELOG.md 0.18.0. *Follow-up:* "Could the same spin happen in the real server?" Nothing like it was seen in the running API, the load runs or the rehearsals, and the spin occurred only in the test process after all tests had passed, but I cannot prove it is impossible, which is why it is on the register.

**What do the tests not cover?** Real-browser end to end, real notification gateways, long soak runs, real users, accessibility. Flutter tests use a mocked HTTP client. Limitations L-16, L-17, L-21.

### Deployment and performance
**How do you deploy and roll back?** Stop gracefully, start the candidate on the same data file, gate: `/ready` within 10 s then log in and read reports; if the gate fails restart the previous release. Rehearsed: 2 s. *Show me:* perf/rehearse.js, docs/w16/RUNBOOK.md section 4, ADR-004.

**What did performance testing find?** Three causes: synchronous password hashing blocking the event loop, re-tokenising every report on every request, whole-file synchronous writes. Fixed by async hashing, cached tokens, and group commit. Then peak went from 52 to 170 requests/s. *Show me:* docs/w16/results-baseline-dev-http.json vs results-optimised-dev-http.json; perf/profile.js.

**Why does request latency under-report overload?** Requests wait in the blocked event loop before the server starts timing them; the baseline logged no slow requests while users waited over a second. So alert on event-loop delay and CPU as well. *Show me:* api/src/metrics.js, runbook section 3.

**What was the static host bug?** First a one-hour cache on non-fingerprinted app files (users could run old code against a new API after a deploy), then maximum-quality synchronous brotli took 35 s on the first request and blocked everyone. Fixed: always revalidate with ETag, asynchronous moderate compression, pre-compress at start. Tests D01 to D06.

### Maintenance
**What happens after the pilot starts?** Maintenance plan: continuous probes and alerts; daily manual queue; weekly dependency audit; monthly restore test; quarterly secret rotation and certificate renewal. Eight incident playbooks. *Show me:* docs/w17/MAINTENANCE.md.

**How much data can you lose?** Acknowledged writes: none. A corrupt file recovers from the backup, losing up to the backup interval (60 s by default, the setting is `BACKUP_INTERVAL_MS`); a disk loss loses everything unless there is an off-machine copy, which the plan requires.

**Data retention?** Proposed in the maintenance plan (reports 12 months after closing, audit 24 months, logs 30 days) but not approved or automated: limitation L-22.

### Process and acceptance
**What did user acceptance testing change?** The custodian could not see the items they were verifying, and one click verified with an invented note: now both items are side by side, and a proof note is required in the UI and the API. Also weak matches from generic shared words (new overlap rule), plain-language messages, no demo tools in production builds, a loading screen.

**What was found in the retest?** Two things only real use revealed: a decision silently lost if the layout changed while a dialog was open (U36), and stale app code after a deploy (D01).

**What would you do with two more weeks?** Real-user acceptance with the sign-off sheet; database and outbox; browser end-to-end test; accessibility audit.

## 4. Where to point in the code (practise this)
| Topic | File and name |
|---|---|
| Role checks, paging, durability gate, OpenAPI route | api/src/app.js: `need`, `page`, the `res.json` wrapper |
| Validation rules and the match state machine | api/src/workflow.js: `validateReport`, `parseDay`, `guardMatchActionable`, `verifyMatch`, `releaseMatch`, `runAging` |
| Matching score | api/src/matching.js: `normalise`, `tokens`, `score`, `MIN_DESCRIPTION_OVERLAP` |
| Retry and recovery | api/src/notifier.js: `POLICY`, `deliver` |
| Group commit, atomic write, recovery from backup | api/src/store.js: `changed`, `commit`, `_flushLoop`, `_writeAtomic`, constructor |
| Tokens, scrypt, lockout, revocation | api/src/auth.js: `verifyPasswordAsync`, `createAuth` |
| Secrets and production refusal | api/src/config.js: `loadConfig` |
| Probes, metrics, shutdown | api/src/metrics.js; api/src/lifecycle.js; `/ready` in app.js |
| API contract | api/openapi/spec.js; api/test/contract.test.js |
| Flutter review screen and dialogs | app/lib/main.dart: `MatchesScreen`, `DecisionDialog`, `_act` |
| Static host | scripts/static-server.js |
| Demo and fallback | demo/start-demo.js, demo/rehearse.js |

## 5. Things an examiner may ask you to do
1. **Trace `POST /api/reports` end to end** from the Flutter submit button to the file on disk, naming each function. (api.dart `post`, app.js route, `createReport`, `runMatching`, `deliver`, `store.changed`, durability gate, `commit`.)
2. **Change the match threshold or overlap floor** (matching.js constants). Say which tests would fail (A01, A02, H06) and why.
3. **Add a new category** (for example "umbrella"). Where must it change? (`CATEGORIES` in matching.js, the enum in the OpenAPI schemas, the `categories` list in main.dart.) Which test catches a missed place? Honestly: only a test that uses the new value, so the right answer is to add one (a report with that category through the API, checked against the documented schema by the contract test pattern).
4. **Make sessions 30 minutes.** `TOKEN_TTL_SEC` in the environment; no code change; mention the security trade-off.
5. **Break something on purpose and show the test that fails** (for example remove the note requirement in `verifyMatch`: A03 and A04 fail; the Flutter dialog test U28 would still pass because it checks the client rule, which is why the rule is enforced in both places).
6. **Explain why a given test exists** (pick any ID in docs/traceability.json and say which requirement and what failure it prevents).

## 6. Hard questions: honest answers
- **Is it production-ready?** No. It is ready for a supervised pilot. The "before production" list is explicit: database, outbox, shared state, institutional sign-in, retention policy.
- **What is the weakest part?** The storage and the in-request notification delivery: both are fine at pilot scale and both would fail first at real scale.
- **Did real users test it?** No. Acceptance testing was done by playing the roles. The SA9 report says so and includes a blank sign-off sheet for the people who must accept it.
- **Which decision are you least sure about?** Pick one and justify it from the ADR "revisit when" line (for example the overlap floor of 0.5: it removed false candidates in UAT but could miss matches with very different wording).
- **If you do not know:** say what you do know, say where you would look (the file or the test), and do not guess.

## 7. Before the viva
- [ ] Run `node scripts/final-check.js` and read the report.
- [ ] Run the whole demo once, in order, aloud, with the clock.
- [ ] Open each file in section 4 and say what it does in one sentence.
- [ ] Complete REFLECTION_TEMPLATE.md in your own words.
