# ADR-006: API contract - one OpenAPI source of truth, enforced both ways

Status: Accepted.

## Context
Documentation that is written once drifts. The API has 20 operations, two response shapes for matches depending on role, and a deliberate rule that errors never leak internals.

## Options considered
| Option | Strengths | Weaknesses |
|---|---|---|
| A. Hand-maintained document with no checks | Cheap | Drifts silently; nobody notices until a client breaks |
| B. Generate the document from the code (decorators or schema libraries) | Always matches the routes | Needs a framework change; schemas describe what the code intends, not what it returns; hard to express role-dependent shapes |
| C. Spec module as the source of truth plus contract tests in both directions (chosen) | The document is readable and reviewable; tests fail when the routes, status codes, response bodies, security or roles differ from it; works with the existing Express code | The spec is written by hand (but is kept honest by the tests) |

## Decision
Option C. `api/openapi/spec.js` is served at `GET /api/openapi.json` and exported to `docs/w17/openapi.yaml`. `test/contract.test.js` checks: the document is valid OpenAPI 3; the set of documented operations equals the set of real routes; real responses (success and error) validate against the documented schemas through a full workflow; every documented status code was produced by a test; documented security and roles equal the enforced ones, in both directions.

## Evidence
A mutation check (`scripts/mutation-check-openapi.js`) applies eight deliberate documentation errors one at a time (wrong enum, wrong type, wrong required field, an invented route, a removed status code, a role documented too widely) and every one is detected. The check also found two gaps in my own first version of the tests (a status value that never appeared in any response; roles checked in only one direction), which were fixed.

## Versioning and change policy
- `info.version` follows the release (0.17.0 now). Additive changes (new optional fields, new endpoints) keep the version line; removing or renaming a field, changing a type, or tightening validation of existing input is a breaking change.
- Breaking changes need a new path prefix (`/api/v2/...`) with the old one kept for one release cycle and announced in CHANGELOG.md. Week 17 itself made one tightening (verify/reject now require a `note`); that is acceptable only because the API has no external consumers yet, and it is recorded in the changelog.
- Every endpoint change must update the spec and pass the contract tests in the same change (see CONTRIBUTING.md).

## Revisit when
There is an external consumer, or generating client code from the document becomes useful.
