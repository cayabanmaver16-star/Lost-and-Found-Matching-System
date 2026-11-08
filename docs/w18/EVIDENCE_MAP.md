# Evidence map

Every row says what is claimed, where the proof is, which automated tests back it, which decision record explains it, and where it appears in the 15-minute demonstration (see DEMO_SCRIPT.md). This file is generated from `evidence-map.json` by `node scripts/check-evidence-map.js`, which also fails if any file, test id or ADR it names does not exist.


## SA7 (Week 13)

| ID | Claim | Proof (files) | Tests | Decision | Demo |
|---|---|---|---|---|---|
| SA7-1 | A bounded workflow with clear boundary, roles and state model | [docs/Project18_Week13_SA7_Evidence.docx](../../docs/Project18_Week13_SA7_Evidence.docx)<br>[docs/w17/diagrams/state-machines.png](../../docs/w17/diagrams/state-machines.png)<br>[docs/w17/diagrams/data-flow.png](../../docs/w17/diagrams/data-flow.png) | T01, T08 | - | 2:30 Live walkthrough |
| SA7-2 | Justified triggers: event-driven matching and notification, scheduled aging job | [docs/Project18_Week13_SA7_Evidence.docx](../../docs/Project18_Week13_SA7_Evidence.docx)<br>[api/src/workflow.js](../../api/src/workflow.js)<br>[api/src/server.js](../../api/src/server.js) | T04, T10, H24 | ADR-002 | 2:30 Live walkthrough |
| SA7-3 | Flutter Web screen flow with loading, empty, validation, authorisation, network and server-error states | [app/lib/main.dart](../../app/lib/main.dart)<br>[app/test/ui_state_test.dart](../../app/test/ui_state_test.dart)<br>[docs/w17/screens/UAT-02a-validation-errors.png](../../docs/w17/screens/UAT-02a-validation-errors.png) | U10, U11, U12, U13, U18, U20 | - | 2:30 Live walkthrough |
| SA7-4 | Bounded retries, recovery and manual handling of permanent failure | [api/src/notifier.js](../../api/src/notifier.js)<br>[docs/evidence-demo-run.txt](../../docs/evidence-demo-run.txt)<br>[docs/evidence-structured-logs.json](../../docs/evidence-structured-logs.json)<br>[docs/w18/fallback-transcript.txt](../../docs/w18/fallback-transcript.txt) | T06, T07, H13, H15 | ADR-002 | 8:00 Resilience |
| SA7-5 | Structured logs that never contain credentials, tokens or report text | [api/src/logger.js](../../api/src/logger.js)<br>[docs/evidence-structured-logs.json](../../docs/evidence-structured-logs.json) | S20, S21 | - | 10:00 Security |
| SA7-6 | Maintainable structure: small modules, injectable delivery and clock, documented decisions | [CONTRIBUTING.md](../../CONTRIBUTING.md)<br>[docs/w17/MAINTENANCE.md](../../docs/w17/MAINTENANCE.md)<br>[api/src](../../api/src) | P07 | - | 12:00 Evidence map |

## SA8 / IA5 (Week 14)

| ID | Claim | Proof (files) | Tests | Decision | Demo |
|---|---|---|---|---|---|
| SA8-1 | Protected configuration: secrets only from the environment, production refuses unsafe settings | [api/src/config.js](../../api/src/config.js)<br>[api/.env.example](../../api/.env.example)<br>[docs/Project18_Week14_SA8_IA5_Evidence.docx](../../docs/Project18_Week14_SA8_IA5_Evidence.docx) | S25, S26 | ADR-003 | 10:00 Security |
| SA8-2 | HTTPS (TLS 1.2+) with HSTS and security headers; strict CORS | [api/src/server.js](../../api/src/server.js)<br>[api/scripts/gen-dev-cert.sh](../../api/scripts/gen-dev-cert.sh)<br>[docs/evidence-w14-security-run.txt](../../docs/evidence-w14-security-run.txt) | S22, S23, S28 | ADR-004 | 10:00 Security |
| SA8-3 | Authentication and access control: signed expiring revocable tokens, roles only from the token, ownership checks | [api/src/auth.js](../../api/src/auth.js)<br>[api/src/app.js](../../api/src/app.js)<br>[docs/evidence-w14-security-logs.json](../../docs/evidence-w14-security-logs.json) | S01, S05, S06, S07, S08, S11, S12, S13, S14, H22 | ADR-003 | 10:00 Security |
| SA8-4 | Cryptography only where justified: scrypt for passwords, HMAC-signed tokens, TLS in transit; no field encryption (reasoned) | [docs/Project18_Week14_SA8_IA5_Evidence.docx](../../docs/Project18_Week14_SA8_IA5_Evidence.docx)<br>[api/src/auth.js](../../api/src/auth.js) | S27, P01 | ADR-003 | 10:00 Security |
| SA8-5 | Adverse tests: altered, expired, invalid and unauthorised behaviour demonstrated live and in 28 automated tests | [api/test/security.test.js](../../api/test/security.test.js)<br>[docs/evidence-w14-security-run.txt](../../docs/evidence-w14-security-run.txt)<br>[api/demo-security.js](../../api/demo-security.js) | S05, S06, S07, S08, S09, S10, S16, S17, S18 | - | 10:00 Security |
| SA8-6 | Residual risk documented and kept up to date | [docs/Project18_Week14_SA8_IA5_Evidence.docx](../../docs/Project18_Week14_SA8_IA5_Evidence.docx)<br>[docs/w17/KNOWN_LIMITATIONS.md](../../docs/w17/KNOWN_LIMITATIONS.md) | - | - | 14:00 Recommendation |

## IA6 (Week 15)

| ID | Claim | Proof (files) | Tests | Decision | Demo |
|---|---|---|---|---|---|
| IA6-1 | Requirements-to-tests traceability, machine-checked | [docs/traceability.json](../../docs/traceability.json)<br>[scripts/trace-check.js](../../scripts/trace-check.js)<br>[docs/w15/traceability-matrix.md](../../docs/w15/traceability-matrix.md)<br>[docs/w15/traceability-summary.json](../../docs/w15/traceability-summary.json) | - | - | 12:00 Evidence map |
| IA6-2 | Functional, invalid-input, boundary, interoperability, authentication, authorisation, reliability and security tests, API and Flutter | [api/test/workflow.test.js](../../api/test/workflow.test.js)<br>[api/test/security.test.js](../../api/test/security.test.js)<br>[api/test/hardening.test.js](../../api/test/hardening.test.js)<br>[app/test/ui_state_test.dart](../../app/test/ui_state_test.dart)<br>[app/test/widget_test.dart](../../app/test/widget_test.dart) | T01, S01, H01, H08, H13, H16, W01, U07 | - | 12:00 Evidence map |
| IA6-3 | Defects found by failing tests first, fixed, and the original failures re-run | [docs/Project18_Week15_IA6_Hardening_Report.docx](../../docs/Project18_Week15_IA6_Hardening_Report.docx)<br>[docs/w15/evidence-before-fix.txt](../../docs/w15/evidence-before-fix.txt)<br>[docs/w15/evidence-after-fix.txt](../../docs/w15/evidence-after-fix.txt)<br>[docs/w15/evidence-flutter-before-fix.txt](../../docs/w15/evidence-flutter-before-fix.txt)<br>[docs/w15/evidence-flutter-after-fix.txt](../../docs/w15/evidence-flutter-after-fix.txt) | H03, H05, H16, H17, U12, U16 | - | 12:00 Evidence map |
| IA6-4 | Regression evidence preserved and a hardening report written | [docs/w15/evidence-regression-run.txt](../../docs/w15/evidence-regression-run.txt)<br>[docs/Project18_Week15_IA6_Hardening_Report.docx](../../docs/Project18_Week15_IA6_Hardening_Report.docx) | - | - | 12:00 Evidence map |

## Week 16 evaluation

| ID | Claim | Proof (files) | Tests | Decision | Demo |
|---|---|---|---|---|---|
| W16-1 | Ordinary, peak, login-burst, data-growth and stress workload models with targets set in advance | [docs/Project18_Week16_Performance_Deployment_Evaluation.docx](../../docs/Project18_Week16_Performance_Deployment_Evaluation.docx)<br>[perf/run-suite.js](../../perf/run-suite.js)<br>[perf/lib.js](../../perf/lib.js) | - | - | 12:00 Evidence map |
| W16-2 | Response-time, throughput, error and resource evidence before and after fixes (peak 52 to 170 req/s) | [docs/w16/results-baseline-dev-http.json](../../docs/w16/results-baseline-dev-http.json)<br>[docs/w16/results-optimised-dev-http.json](../../docs/w16/results-optimised-dev-http.json)<br>[perf/profile.js](../../perf/profile.js) | P01, P02, P07 | ADR-001 | 12:00 Evidence map |
| W16-3 | Monitoring and health signals: liveness, readiness, staff-only metrics, slow-request log, graceful shutdown | [api/src/metrics.js](../../api/src/metrics.js)<br>[api/src/lifecycle.js](../../api/src/lifecycle.js)<br>[docs/w16/sample-monitoring.json](../../docs/w16/sample-monitoring.json) | O01, O02, O03, O04, O05, P05, P06 | - | 10:00 Security |
| W16-4 | Environment comparison: HTTP, HTTPS and production mode; front-end bundle size | [docs/w16/results-optimised-dev-https.json](../../docs/w16/results-optimised-dev-https.json)<br>[docs/w16/results-optimised-prod-https.json](../../docs/w16/results-optimised-prod-https.json)<br>[docs/w16/frontend-bundle.json](../../docs/w16/frontend-bundle.json) | D01, D03, D05, D06 | ADR-004 | 12:00 Evidence map |
| W16-5 | Rollback and recovery rehearsed: hard-kill durability, corruption recovery, bad-release rollback | [perf/rehearse.js](../../perf/rehearse.js)<br>[docs/w16/rehearsal-results.json](../../docs/w16/rehearsal-results.json)<br>[docs/w16/console-rehearsal.txt](../../docs/w16/console-rehearsal.txt)<br>[docs/w16/RUNBOOK.md](../../docs/w16/RUNBOOK.md) | P03, P04, P08, H17, H18 | ADR-001, ADR-004 | 8:00 Resilience |
| W16-6 | Conditional readiness recommendation with limitations | [docs/Project18_Week16_Performance_Deployment_Evaluation.docx](../../docs/Project18_Week16_Performance_Deployment_Evaluation.docx)<br>[docs/w17/KNOWN_LIMITATIONS.md](../../docs/w17/KNOWN_LIMITATIONS.md) | - | - | 14:00 Recommendation |

## SA9 (Week 17)

| ID | Claim | Proof (files) | Tests | Decision | Demo |
|---|---|---|---|---|---|
| SA9-1 | UAT with representative controlled scenarios; findings and dispositions; fixes retested | [docs/Project18_Week17_SA9_UAT_and_Evaluation.docx](../../docs/Project18_Week17_SA9_UAT_and_Evaluation.docx)<br>[uat/run-uat.js](../../uat/run-uat.js)<br>[docs/w17/uat-results-before-fixes.md](../../docs/w17/uat-results-before-fixes.md)<br>[docs/w17/uat-results-after-fixes.md](../../docs/w17/uat-results-after-fixes.md)<br>[docs/w17/screens](../../docs/w17/screens) | A01, A03, A05, U27, U28, U29, U31, U36 | ADR-005 | 2:30 Live walkthrough |
| SA9-2 | OpenAPI documentation proven equal to the running API in both directions | [api/openapi/spec.js](../../api/openapi/spec.js)<br>[docs/w17/openapi.yaml](../../docs/w17/openapi.yaml)<br>[docs/w17/openapi.json](../../docs/w17/openapi.json)<br>[docs/w17/contract-mutation-check.txt](../../docs/w17/contract-mutation-check.txt)<br>[scripts/mutation-check-openapi.js](../../scripts/mutation-check-openapi.js) | C01, C02, C03, C04, C05, C06 | ADR-006 | 12:00 Evidence map |

## AS3 (Week 17)

| ID | Claim | Proof (files) | Tests | Decision | Demo |
|---|---|---|---|---|---|
| AS3-1 | Final architecture, data flow and state machines with trust boundaries | [docs/w17/diagrams/architecture.png](../../docs/w17/diagrams/architecture.png)<br>[docs/w17/diagrams/data-flow.png](../../docs/w17/diagrams/data-flow.png)<br>[docs/w17/diagrams/state-machines.png](../../docs/w17/diagrams/state-machines.png)<br>[scripts/gen-diagrams.js](../../scripts/gen-diagrams.js) | - | - | 1:00 Architecture |
| AS3-2 | Alternatives evaluated and decisions recorded | [docs/w17/adr/ADR-001-storage.md](../../docs/w17/adr/ADR-001-storage.md)<br>[docs/w17/adr/ADR-002-notifications.md](../../docs/w17/adr/ADR-002-notifications.md)<br>[docs/w17/adr/ADR-003-authentication.md](../../docs/w17/adr/ADR-003-authentication.md)<br>[docs/w17/adr/ADR-004-deployment.md](../../docs/w17/adr/ADR-004-deployment.md)<br>[docs/w17/adr/ADR-005-matching.md](../../docs/w17/adr/ADR-005-matching.md)<br>[docs/w17/adr/ADR-006-api-contract.md](../../docs/w17/adr/ADR-006-api-contract.md) | - | ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006 | 1:00 Architecture |
| AS3-3 | Repository guidance, known limitations, maintenance plan, final recommendation | [README.md](../../README.md)<br>[CONTRIBUTING.md](../../CONTRIBUTING.md)<br>[CHANGELOG.md](../../CHANGELOG.md)<br>[docs/w17/KNOWN_LIMITATIONS.md](../../docs/w17/KNOWN_LIMITATIONS.md)<br>[docs/w17/MAINTENANCE.md](../../docs/w17/MAINTENANCE.md)<br>[docs/Project18_Week17_AS3_Advanced_Technical_Report.docx](../../docs/Project18_Week17_AS3_Advanced_Technical_Report.docx) | - | - | 14:00 Recommendation |

## E3 (Week 18)

| ID | Claim | Proof (files) | Tests | Decision | Demo |
|---|---|---|---|---|---|
| E3-1 | Final solution that runs from a clean checkout with documented commands | [README.md](../../README.md)<br>[api/package.json](../../api/package.json)<br>[app/pubspec.yaml](../../app/pubspec.yaml) | T01, S01, U09 | - | 2:30 Live walkthrough |
| E3-2 | Demonstration of the complete workflow with controlled data | [docs/w18/DEMO_SCRIPT.md](../../docs/w18/DEMO_SCRIPT.md)<br>[demo/start-demo.js](../../demo/start-demo.js)<br>[demo/seed.js](../../demo/seed.js)<br>[demo/preflight.js](../../demo/preflight.js) | - | - | 2:30 Live walkthrough |
| E3-3 | Prepared fallback at four levels, rehearsed | [docs/w18/FALLBACK_PLAN.md](../../docs/w18/FALLBACK_PLAN.md)<br>[demo/rehearse.js](../../demo/rehearse.js)<br>[docs/w18/fallback-transcript.txt](../../docs/w18/fallback-transcript.txt) | - | - | 2:30 Live walkthrough |
| E3-4 | Evidence map, portfolio and delivery check | [docs/w18/EVIDENCE_MAP.md](../../docs/w18/EVIDENCE_MAP.md)<br>[docs/w18/evidence-map.json](../../docs/w18/evidence-map.json)<br>[scripts/check-evidence-map.js](../../scripts/check-evidence-map.js)<br>[scripts/final-check.js](../../scripts/final-check.js)<br>[docs/w18/FINAL_DELIVERY_CHECK.md](../../docs/w18/FINAL_DELIVERY_CHECK.md)<br>[api/scripts/run-tests.js](../../api/scripts/run-tests.js)<br>[scripts/make-bundle.js](../../scripts/make-bundle.js) | - | - | 12:00 Evidence map |
| E3-5 | Individual technical viva preparation and contribution reflection (to be completed by the student in their own words) | [docs/w18/VIVA_PREP.md](../../docs/w18/VIVA_PREP.md)<br>[docs/w18/REFLECTION_TEMPLATE.md](../../docs/w18/REFLECTION_TEMPLATE.md) | - | - | 14:00 Recommendation |

## Minimum final deliverables

| ID | Claim | Proof (files) | Tests | Decision | Demo |
|---|---|---|---|---|---|
| MD-1 | Flutter Web source and responsive workflow evidence | [app/lib/main.dart](../../app/lib/main.dart)<br>[app/lib/api.dart](../../app/lib/api.dart)<br>[app/test/ui_state_test.dart](../../app/test/ui_state_test.dart)<br>[docs/w17/screens](../../docs/w17/screens) | U25, U26 | - | 2:30 Live walkthrough |
| MD-2 | Backend API source, configuration example without secrets, OpenAPI documentation | [api/src](../../api/src)<br>[api/.env.example](../../api/.env.example)<br>[api/openapi/spec.js](../../api/openapi/spec.js)<br>[docs/w17/openapi.yaml](../../docs/w17/openapi.yaml) | C01, C02 | - | 12:00 Evidence map |
| MD-3 | Architecture and data-flow diagrams with decision records | [docs/w17/diagrams](../../docs/w17/diagrams)<br>[docs/w17/adr](../../docs/w17/adr) | - | - | 1:00 Architecture |
| MD-4 | Automation, security, testing, performance, deployment, UAT and recovery evidence | [docs/Project18_Week13_SA7_Evidence.docx](../../docs/Project18_Week13_SA7_Evidence.docx)<br>[docs/Project18_Week14_SA8_IA5_Evidence.docx](../../docs/Project18_Week14_SA8_IA5_Evidence.docx)<br>[docs/Project18_Week15_IA6_Hardening_Report.docx](../../docs/Project18_Week15_IA6_Hardening_Report.docx)<br>[docs/Project18_Week16_Performance_Deployment_Evaluation.docx](../../docs/Project18_Week16_Performance_Deployment_Evaluation.docx)<br>[docs/Project18_Week17_SA9_UAT_and_Evaluation.docx](../../docs/Project18_Week17_SA9_UAT_and_Evaluation.docx)<br>[docs/Project18_Week17_AS3_Advanced_Technical_Report.docx](../../docs/Project18_Week17_AS3_Advanced_Technical_Report.docx) | - | - | 12:00 Evidence map |
| MD-5 | README, known limitations, residual risks, maintenance plan and individual contribution records | [README.md](../../README.md)<br>[docs/w17/KNOWN_LIMITATIONS.md](../../docs/w17/KNOWN_LIMITATIONS.md)<br>[docs/w17/MAINTENANCE.md](../../docs/w17/MAINTENANCE.md)<br>[docs/w18/REFLECTION_TEMPLATE.md](../../docs/w18/REFLECTION_TEMPLATE.md) | - | - | 14:00 Recommendation |

---
37 claims, 97 distinct artifacts, 82 distinct test ids cited. Problems found: 0.
