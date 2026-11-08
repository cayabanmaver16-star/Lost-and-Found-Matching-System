# Contributing and repository guide

## Repository map
```
lostfound/
  api/            Node.js 20 + Express API (src/, openapi/, seed/, test/)
  app/            Flutter Web client (lib/, test/, web/)
  docs/           Reports per week (w13..w17 evidence), traceability.json, runbook, ADRs, OpenAPI export
  perf/           Load tests, profiling, rehearsals (recovery, rollback), monitoring and bundle probes
  uat/            Scripted user acceptance scenarios (run against a live server)
  scripts/        Gates and generators: trace-check, gen-openapi, mutation-check-openapi, gen-diagrams, static-server
```
Generated or local-only folders are ignored (see `.gitignore`): `node_modules`, `build`, `.env`, `certs`, `api/data`, `perf/work`, `uat/work`.

## Prerequisites
Node.js 20 LTS, npm, Flutter stable with web enabled. OpenSSL (Git for Windows includes it) for the development certificate.

## First-time setup
```
cd api && npm install
sh scripts/gen-dev-cert.sh            # self-signed localhost certificate (git-ignored)
copy .env.example .env                # set JWT_SECRET to 48+ random characters; never commit .env
cd ../app && flutter pub get
```

## Everyday commands
| Task | Command |
|---|---|
| Run the API | `cd api && npm start` |
| Run the web app | `cd app && flutter run -d chrome --dart-define=API_BASE=https://localhost:3000` |
| Backend tests (97) | `cd api && npm test` |
| Flutter checks (37 tests) | `cd app && flutter analyze && flutter test` |
| Traceability gate | `node scripts/trace-check.js` |
| Regenerate the OpenAPI export | `node scripts/gen-openapi.js` |
| Prove the contract tests catch drift | `node scripts/mutation-check-openapi.js` |
| Scripted UAT against a live server | `node uat/run-uat.js <label>` |
| Load and performance suite | `NODE_EXTRA_CA_CERTS=api/certs/dev-cert.pem node perf/run-suite.js --label x --env dev-http` |
| Static host for the built app | `node scripts/static-server.js 8080` |

Test runner note: `npm test` runs `api/scripts/run-tests.js`, which starts every `test/*.test.js` as its own process (in parallel) with a hard per-file timeout (180 s, `TEST_FILE_TIMEOUT_MS`) and prints TAP-style totals. It replaced plain `node --test` after the clean-copy verification in Week 18 saw finished test processes occasionally spin at 100% CPU in that runner mode and never exit (3 times in about 35 runs, never in 72 direct runs; cause not identified). `npm run test:node` still runs the old mode if you want to compare. Test clients must not reuse keep-alive connections between servers (see `test/helpers.js`).

## Quality gates (a change is not done until all pass)
1. `npm test`, `flutter analyze`, `flutter test` are green.
2. `node scripts/trace-check.js` passes: every test maps to a requirement in `docs/traceability.json` and every requirement has a test. Name tests with an id (`T01`, `S12`, `H07`, `O03`, `P04`, `A02`, `C05`, `D01` for the API; `W03`, `U12` for Flutter) and map the id.
3. Contract tests pass: the OpenAPI document equals the real routes, status codes, schemas, security and roles.
4. `npm audit --omit=dev` shows no known vulnerabilities.
5. A defect fix includes a test that failed before the fix. Show it (run it against the old behaviour once).

## How to add or change an endpoint (checklist)
1. Route in `api/src/app.js` with `need(...roles)` and, where relevant, an ownership check.
2. Validation in `api/src/workflow.js` (types, lengths, formats; reject control characters; build records from whitelisted fields).
3. State changes call `store.changed()` and write an audit entry; the durability gate then sends the response only after the data is on disk.
4. Never log credentials, tokens or report text (the logger redacts as a safety net, not as a licence).
5. Return errors through `HttpError` with a stable `code`; never leak stack traces.
6. Document it in `api/openapi/spec.js`; run the contract tests; run `node scripts/gen-openapi.js`.
7. Add tests: success, validation, authentication (401), authorisation (403), ownership (404), state conflicts (409).
8. Map the tests in `docs/traceability.json`; add a requirement if the behaviour is new.
9. Update `CHANGELOG.md`.

## Coding standards
- API: CommonJS with `'use strict'`; small modules (matching, notifier, workflow, store, auth, app); no new runtime dependency without `npm audit` and a reason; async I/O only on request paths (no synchronous crypto or file calls: they block every other user, which Week 16 measured).
- Flutter: `flutter analyze` clean; state classes handle loading, empty, network, authorisation and server-error states; user-facing text is plain language (no internal ids or codes for students); do not use a `BuildContext` after an `await` for anything that must still happen; no secrets or tokens in storage (the token is in memory only).
- Both: validate on the server whatever the client validates.

## Secrets and data
- Secrets come from environment variables. `.env`, certificates and data files are never committed. `api/seed/demo-users.json` holds fictional test-only accounts and must never exist in production.
- Use fictional or anonymised data in tests, screenshots and reports.

## Commits and branches
Short-lived branches, one change each. Commit messages: a short imperative summary line, then a paragraph on why. Reference test ids and finding ids (for example `F3`, `D7`) where they apply. Do not commit generated build output.

## Release
See `docs/w17/MAINTENANCE.md` section 4. Version in `api/package.json` and in the OpenAPI `info.version`; update `CHANGELOG.md`.

## Where to find things
- Why a decision was made: `docs/w17/adr/`.
- What is not done or not safe yet: `docs/w17/KNOWN_LIMITATIONS.md`.
- How to operate and recover: `docs/w16/RUNBOOK.md`.
- Evidence and reports for each assessment: `docs/w13` to `docs/w17` and the Word documents in `docs/`.
