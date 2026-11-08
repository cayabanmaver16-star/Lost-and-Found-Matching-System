# ADR-003: Authentication and session design

Status: Accepted for the pilot with controlled test accounts. Production must use the institution's identity provider.

## Context
Four roles (student, employee, security, custodian) with different rights, enforced on the server. The data is moderately sensitive (descriptions that help prove ownership, who lost what). The browser client is a Flutter Web single-page app on a different origin from the API.

## Options considered
| Option | Strengths | Weaknesses |
|---|---|---|
| A. Local accounts, scrypt hashes, self-issued HS256 token, kept in memory by the client (chosen for the pilot) | Self-contained and testable; no cross-origin cookies, so ambient-credential CSRF does not apply; short life (15 minutes) and logout revocation; token never written to browser storage | Passwords are managed by us (no MFA, no recovery flow); shared secret with no rotation; revocation list and lockout counters live in process memory; users re-enter credentials after 15 minutes or a page reload |
| B. Cookie sessions | Familiar; can be HttpOnly | Needs CSRF protection and cross-site cookie settings between two origins; server-side session store |
| C. OpenID Connect with the institution's identity provider | No passwords stored by us; MFA and account lifecycle come from the institution; roles from groups | Needs an IdP client registration and integration work; not available in the prototype environment |

## Decision
Option A for the pilot, with the controls tested in Weeks 14-15: scrypt (salted, per user, async), pinned HS256 with issuer and audience, 15-minute expiry, jti revocation on logout, per-account lockout (5 failures, 15 minutes), per-IP login and global rate limits, identical errors for unknown user and wrong password, role taken only from the verified token, ownership checks (404 rather than 403 for other people's reports). Move to option C for production; the role-based checks and the token verification middleware are the only parts that change.

## Evidence
28 security tests (S01-S28), live HTTPS adversarial run (docs/w14), H10, H21, H22, contract test C06 (documented roles equal enforced roles), UAT-01, UAT-07, UAT-14.

## Consequences
- Residual risks accepted for the pilot (see KNOWN_LIMITATIONS L-05 to L-08): no MFA, shared signing secret without rotation, in-memory revocation and lockout, a lockout can be used to annoy one user.
- The demo accounts file is test-only fictional data and must not exist in production.
- Short sessions are a usability cost (UAT finding F12, deferred): staff mid-task see "Sign in again". A refresh-token flow is the planned remedy under option C.

## Revisit when
A second instance is needed (move revocation and lockout to a shared store), the institution offers SSO/MFA, or real users replace the test accounts.
