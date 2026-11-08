# Traceability matrix (requirements to tests)

| Requirement | Statement | Tests | Count |
|---|---|---|---|
| FR-01 | Users can submit lost and found reports; the server validates every field (type, category, text length, real calendar date within the allowed window). | H01, H02, H03, H04, H05, P03, T01, T02 | 8 |
| FR-02 | Duplicate reports by the same reporter are rejected, without falsely rejecting different items. | H12, H14, T03 | 3 |
| FR-03 | Lost and found reports are matched automatically into candidate matches using category, description, location and date. | A01, H06, H11, H23, T04, T05 | 6 |
| FR-04 | Candidate-match notifications are delivered with bounded retries, backoff and recovery; permanent failures are routed to staff. | H13, H23, T04, T06, T07 | 5 |
| FR-05 | Ownership is verified manually and release follows a strict state machine that cannot hand an item over twice or skip verification. | A03, A04, H16, H22, H23, T08, U29, U30 | 8 |
| FR-06 | Unclaimed found items trigger one aging reminder (30 days) and one disposal review (90 days). | A06, H24, H25, T10 | 4 |
| FR-07 | Staff handle failed notifications and disposal reviews through a manual queue (re-send, resolve, dispose). | H15, H25, T07 | 3 |
| FR-08 | Every state change is audited and system events are logged in structured form. | A03, A04, H23 | 3 |
| SR-01 | Users authenticate with credentials; sessions use signed, expiring, revocable tokens; brute force is limited. | C04, H10, H21, S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S14, S27 | 15 |
| SR-02 | Access is authorised on the server by role and by object ownership. | C06, H22, O03, S10, S11, S12, S13, T09, U14, U18 | 10 |
| SR-03 | Data is protected in transit (HTTPS) and responses carry security headers; CORS is restricted. | H09, O06, S22, S23, S28 | 5 |
| SR-04 | Secrets and environment settings are protected; production fails fast on unsafe configuration. | S25, S26 | 2 |
| SR-05 | All input is validated and malformed or hostile input is rejected safely. | A03, H08, H20, S16, S17, S18, S19, T02, T11 | 9 |
| SR-06 | Logs never contain credentials, tokens or report text. | H19, O04, S08, S20, S21 | 5 |
| SR-07 | API responses expose only the data each role needs. | A05, S13, S15, T12, U32 | 5 |
| NF-01 | The system is reliable: errors are generic, state stays consistent, writes are atomic and concurrency is safe. | H13, H14, H15, H16, H17, H18, H19, H20, T11, U36 | 10 |
| NF-02 | The API interoperates with standard clients: content types, CORS preflight, authorization scheme case, Unicode text. | C03, H08, H09, H10, H11, H12, S23 | 7 |
| NF-03 | Resource use is bounded: rate limits, body size, paging, in-memory tracking tables. | C04, D05, H07, H21, O06, S04, S17, S24 | 8 |
| UI-01 | Sign-in and session handling in the Flutter app, including failure, lockout and expiry states. | U07, U08, U09, W01, W02, W05 | 6 |
| UI-02 | Report submission shows validation, loading, success, duplicate and error states. | U20, U21, U22, U23, U24, W03 | 6 |
| UI-03 | Match review and manual queue controls are role-appropriate and update the list after each action. | U14, U15, U16, U17, U19 | 5 |
| UI-04 | Every list or screen has loading, empty, network, authorization and server-error states with correct retry behaviour. | U10, U11, U12, U13, U18, U24, W04, W05, W06, W07 | 10 |
| UI-05 | The layout adapts between phone and desktop widths. | U09, U25, U26 | 3 |
| NF-04 | Operability: liveness and readiness probes, staff-only metrics (latency percentiles, errors, process and event-loop health) and slow-request logging allow problems to be detected. | O01, O02, O03, O04, O05, P04, P05 | 7 |
| NF-05 | Performance and capacity: stated response-time and error targets are met under ordinary and peak load, and the cost of a request does not grow with the amount of stored data. | D06, P01, P02, P07 | 4 |
| NF-06 | Recoverability: acknowledged writes survive crashes, shutdown is graceful, corrupt storage recovers from backup, and a bad release can be rolled back. | O02, P02, P03, P04, P05, P06, P08 | 7 |
| UI-06 | Staff can see both items side by side when deciding a match and must record the proof checked or the reason for refusing; irreversible steps ask for confirmation. | A05, U27, U28, U29, U30, U31, U36 | 7 |
| UI-07 | Users see plain-language messages (status, notifications, confirmations) instead of internal ids and codes, and messages stay visible long enough to read. | A06, U32, U33, U35 | 4 |
| UI-08 | Production builds expose no developer or demonstration tools. | U34 | 1 |
| FR-09 | Matching precision: generic shared words do not create candidates, while brief lost descriptions still match detailed found items. | A01, A02 | 2 |
| DOC-01 | The API is documented in OpenAPI 3 and the document is exactly accurate: same routes, response codes, schemas, security and roles as the running server. | C01, C02, C03, C04, C05, C06 | 6 |
| DEP-01 | The static host serves the Flutter app compressed, always revalidates non-fingerprinted files (no stale app code after a deploy) and sends baseline security headers. | D01, D02, D03, D04, D05, D06 | 6 |

## Test catalogue

| ID | Suite | Test | Requirements |
|---|---|---|---|
| A01 | API acceptance (UAT fixes) | [F3] one or two generic shared words are not enough for a candidate; brief lost descriptions still match | FR-03, FR-09 |
| A02 | API acceptance (UAT fixes) | [F3] scoring unit: overlap rule boundary (shorter description must be at least 50% covered) | FR-09 |
| A03 | API acceptance (UAT fixes) | [F2] verifying or rejecting requires a note recording the proof checked / reason (audit trail) | FR-05, FR-08, SR-05 |
| A04 | API acceptance (UAT fixes) | [F2] a refusal needs a reason too, and the match is then rejected with that reason on record | FR-05, FR-08 |
| A05 | API acceptance (UAT fixes) | [F1] staff matches carry both item summaries; claimants get only their own report; others get nothing | SR-07, UI-06 |
| A06 | API acceptance (UAT fixes) | [F4] notifications carry a creation time so they can be shown in plain language | UI-07, FR-06 |
| C01 | API contract (OpenAPI) | the OpenAPI document is valid OpenAPI 3 with resolvable references | DOC-01 |
| C02 | API contract (OpenAPI) | documented operations and real routes are exactly the same set, and the document is served at /api/openapi.json | DOC-01 |
| C03 | API contract (OpenAPI) | real responses match the documented schemas across the whole workflow (success and error paths) | DOC-01, NF-02 |
| C04 | API contract (OpenAPI) | lockout and rate limiting (429) responses match the documented error schema | DOC-01, SR-01, NF-03 |
| C05 | API contract (OpenAPI) | every documented status code of every operation was exercised, except a short, justified allow-list | DOC-01 |
| C06 | API contract (OpenAPI) | documented security and roles match the server: every operation but the public ones requires a bearer token, and staff-only operations refuse a student with 403 | DOC-01, SR-02 |
| D01 | Static host (deployment) | [F9] non-fingerprinted app files are always revalidated (no max-age), renderer files cache for a day | DEP-01 |
| D02 | Static host (deployment) | an unchanged file is answered 304 via its ETag; a changed file is served again | DEP-01 |
| D03 | Static host (deployment) | content is compressed when the browser accepts it (brotli preferred, then gzip) and is identical after decoding | DEP-01 |
| D04 | Static host (deployment) | safety: security headers on every response, path traversal refused, only GET/HEAD, unknown paths fall back to the app | DEP-01 |
| D05 | Static host (deployment) | [Week 18] compressing a large binary never blocks other requests and returns correct bytes (max-quality sync brotli took 35 s for the 7 MB renderer) | DEP-01, NF-03 |
| D06 | Static host (deployment) | [Week 18] warm() pre-compresses the first-visit files so the first real request is served at once | DEP-01, NF-05 |
| H01 | API hardening / integration | description boundaries: 4 rejected, 5 accepted, 300 accepted, 301 rejected, whitespace-only rejected | FR-01 |
| H02 | API hardening / integration | location boundaries: 1 rejected, 2 accepted, 100 accepted, 101 rejected | FR-01 |
| H03 | API hardening / integration | [D1] a user in UTC+8 may report an item lost "today" even while UTC is still the previous day | FR-01 |
| H04 | API hardening / integration | [D9] event date older than 730 days is rejected; exactly 730 days accepted | FR-01 |
| H05 | API hardening / integration | [D12] impossible calendar dates (Feb 30, month 13, day 00) are rejected | FR-01 |
| H06 | API hardening / integration | [D11] matching threshold: same category + same day with NO shared words is not a candidate | FR-03 |
| H07 | API hardening / integration | list limit parameter: default, bounds and junk values never break the API | NF-03 |
| H08 | API hardening / integration | content-type handling: charset parameter OK; wrong or missing body yields 422, never 500 | NF-02, SR-05 |
| H09 | API hardening / integration | CORS preflight: allowed origin gets methods/headers; disallowed origin gets none | NF-02, SR-03 |
| H10 | API hardening / integration | [D5] Authorization scheme is case-insensitive; query-string tokens and sloppy headers are not accepted | NF-02, SR-01 |
| H11 | API hardening / integration | [D2] accents and case are ignored when matching (Cafe vs Café, nino vs niño) | FR-03, NF-02 |
| H12 | API hardening / integration | [D2] non-Latin descriptions are stored intact and different texts are NOT flagged as duplicates | FR-02, NF-02 |
| H13 | API hardening / integration | retry policy: exactly 3 attempts with 1000 ms then 2000 ms backoff, then manual queue | FR-04, NF-01 |
| H14 | API hardening / integration | identical concurrent submissions create exactly one report (duplicate control is race-free) | FR-02, NF-01 |
| H15 | API hardening / integration | [D4] double-clicking Re-send does not deliver twice | FR-07, NF-01 |
| H16 | API hardening / integration | [D3] a found item cannot be released to two different claimants | FR-05, NF-01 |
| H17 | API hardening / integration | [D6] persistence is atomic: a failed write leaves the previous data file intact | NF-01 |
| H18 | API hardening / integration | [D6] persistence round-trip keeps ids monotonic; corrupt file falls back to last good backup or fails with a clear message | NF-01 |
| H19 | API hardening / integration | error path: an unexpected failure returns a generic 500, leaks nothing, and the server stays up | NF-01, SR-06 |
| H20 | API hardening / integration | robustness sweep: 60 hostile requests never cause a 5xx and the server stays healthy | NF-01, SR-05 |
| H21 | API hardening / integration | [D7] login-failure tracking and token revocation lists are bounded (no memory growth under attack) | NF-03, SR-01 |
| H22 | API hardening / integration | [D8] separation of duties: staff cannot verify or release a match for their own report | FR-05, SR-02 |
| H23 | API hardening / integration | end-to-end across roles: lost -> found -> notify -> verify -> release -> closed, with audit trail | FR-03, FR-04, FR-05, FR-08 |
| H24 | API hardening / integration | aging job is idempotent and ignores closed/disposed reports | FR-06 |
| H25 | API hardening / integration | disposal review flow: aging flags -> custodian disposes -> report disposed; double-resolve 409; unknown id 404 | FR-07, FR-06 |
| O01 | API operability | liveness and readiness: /health and /ready are public, minimal and report ready on a healthy server | NF-04 |
| O02 | API operability | readiness turns 503 when a storage write really fails and recovers after the next successful write | NF-04, NF-06 |
| O03 | API operability | /api/metrics is staff-only and reports counts, latency percentiles, process and event-loop figures | NF-04, SR-02 |
| O04 | API operability | metrics expose no tokens, passwords or report text | NF-04, SR-06 |
| O05 | API operability | requests slower than SLOW_REQUEST_MS are logged as warnings with route and duration | NF-04 |
| O06 | API operability | rate limiting: X-Forwarded-For is ignored unless TRUST_PROXY is set (cannot be spoofed); with a proxy, clients get separate buckets | NF-03, SR-03 |
| P01 | API performance / lifecycle | password verification uses asynchronous scrypt: the blocking call is never used on the login path | NF-05 |
| P02 | API performance / lifecycle | group commit: 40 concurrent writes are all acknowledged, all on disk, and share a small number of file writes | NF-05, NF-06 |
| P03 | API performance / lifecycle | durability gate: when a 201 is returned the report is already in the data file | NF-06, FR-01 |
| P04 | API performance / lifecycle | a failed batch write fails every request in the batch (500), then a later write succeeds | NF-06, NF-04 |
| P05 | API performance / lifecycle | readiness reports shutting_down once shutdown has begun; liveness is unaffected | NF-04, NF-06 |
| P06 | API performance / lifecycle | graceful shutdown: in-flight request completes and is persisted, new connections refused, exit 0, idempotent | NF-06 |
| P07 | API performance / lifecycle | speed guard: at 10,000 stored reports the best of 5 batches costs under 15 ms per create (typically about 3 ms; about 30-60 ms before caching) | NF-05 |
| P08 | API performance / lifecycle | a stale temp file left by a crash mid-write is ignored and removed at startup | NF-06 |
| S01 | API security | no token -> 401 with WWW-Authenticate | SR-01 |
| S02 | API security | valid login returns a signed token and /me reflects the server-side role | SR-01 |
| S03 | API security | wrong password and unknown user give identical 401 (no user enumeration) | SR-01 |
| S04 | API security | account locks after 5 failures; correct password is then refused (429) | SR-01, NF-03 |
| S05 | API security | altered token (role escalated, original signature) -> 401 | SR-01 |
| S06 | API security | token signed with a different secret -> 401 | SR-01 |
| S07 | API security | "alg: none" unsigned token -> 401 | SR-01 |
| S08 | API security | expired token -> 401 (and logged as expired) | SR-01, SR-06 |
| S09 | API security | token with wrong audience/issuer -> 401 | SR-01 |
| S10 | API security | token for a user whose role no longer matches the server record -> 401 | SR-01, SR-02 |
| S11 | API security | legacy X-Role / X-User-Id headers grant nothing | SR-02 |
| S12 | API security | students get 403 on every staff endpoint | SR-02 |
| S13 | API security | object-level access: another student cannot read, list or match-view someone else\ | SR-02, SR-07 |
| S14 | API security | logout revokes the token | SR-01 |
| S15 | API security | data minimisation: claimant match/notification views hide found id, verifier, notes and internals | SR-07 |
| S16 | API security | input validation: type confusion, control characters, bad dates -> 422 | SR-05 |
| S17 | API security | oversized body -> 413; malformed identifiers -> 404 | SR-05, NF-03 |
| S18 | API security | hostile text is stored inert and returned as data (no execution, no crash) | SR-05 |
| S19 | API security | mass assignment: client-supplied id/status/reporterId are ignored | SR-05 |
| S20 | API security | logs never contain passwords, tokens or report text | SR-06 |
| S21 | API security | logger redacts sensitive keys and JWT-looking strings even if a caller slips | SR-06 |
| S22 | API security | security headers present and x-powered-by removed | SR-03 |
| S23 | API security | CORS: only configured origins are allowed | SR-03, NF-02 |
| S24 | API security | global rate limit returns 429 | NF-03 |
| S25 | API security | configuration: production refuses missing/weak secret and missing TLS | SR-04 |
| S26 | API security | production disables test hooks (simulated delivery, clock override) | SR-04 |
| S27 | API security | passwords are stored only as salted scrypt hashes | SR-01 |
| S28 | API security | HTTPS: API is reachable over TLS with the dev certificate and rejects plain HTTP | SR-03 |
| T01 | API functional | valid lost report is created (201) | FR-01 |
| T02 | API functional | invalid report is rejected with field errors (422) | FR-01, SR-05 |
| T03 | API functional | duplicate report by same reporter is blocked (409) | FR-02 |
| T04 | API functional | matching lost+found creates candidate and delivers notification | FR-03, FR-04 |
| T05 | API functional | different category never matches | FR-03 |
| T06 | API functional | transient failure is retried and delivered on attempt 3 (recovered) | FR-04 |
| T07 | API functional | permanent failure is routed to manual queue after bounded attempts | FR-04, FR-07 |
| T08 | API functional | verification then release closes both reports | FR-05 |
| T09 | API functional | students cannot verify matches (403); anonymous gets 401 | SR-02 |
| T10 | API functional | aging job: reminder at 30 days, disposal review at 90 days, each only once | FR-06 |
| T11 | API functional | malformed JSON returns 400 with no stack trace | NF-01, SR-05 |
| T12 | API functional | claimants cannot see found-item link in their matches | SR-07 |
| U07 | Flutter UI state | sign-in failure shows the server message and stays on the sign-in screen | UI-01 |
| U08 | Flutter UI state | account lockout (429) shows a wait message, not a raw error | UI-01 |
| U09 | Flutter UI state | successful sign-in opens the home shell; student has no Manual queue destination | UI-01, UI-05 |
| U10 | Flutter UI state | reports list shows a loading indicator first, then the data | UI-04 |
| U11 | Flutter UI state | server error (500) shows "Server error" and Try again recovers | UI-04 |
| U12 | Flutter UI state | [D15] a non-JSON gateway error page (502 HTML) is shown as a server error, not a crash | UI-04 |
| U13 | Flutter UI state | network failure while loading shows Network problem with retry | UI-04 |
| U14 | Flutter UI state | students never see Verify/Reject/Release controls | UI-03, SR-02 |
| U15 | Flutter UI state | staff see Verify/Reject on a candidate and Release on a verified match | UI-03 |
| U16 | Flutter UI state | verifying a match (with the required note) posts to the right endpoint and refreshes the list | UI-03 |
| U17 | Flutter UI state | conflict of interest (403) on Verify is shown to the user and the list is unchanged | UI-03 |
| U18 | Flutter UI state | manual queue returns 403 for a student: "Not authorized" and no retry button | UI-04, SR-02 |
| U19 | Flutter UI state | manual queue lists a failed notification with a Re-send action | UI-03 |
| U20 | Flutter UI state | report form shows server-side field errors under the fields (422) | UI-02 |
| U21 | Flutter UI state | duplicate report (409) is explained to the user | UI-02 |
| U22 | Flutter UI state | successful submit shows the match count and clears the form | UI-02 |
| U23 | Flutter UI state | submit button is disabled with a progress indicator while the request is in flight | UI-02 |
| U24 | Flutter UI state | network failure on submit shows an error message and re-enables the button | UI-02, UI-04 |
| U25 | Flutter UI state | responsive layout (wide, 1000 px): navigation rail; staff get the Manual queue tab | UI-05 |
| U26 | Flutter UI state | responsive layout (phone, 400 px): bottom bar, no overflow on the report form | UI-05 |
| U27 | Flutter UI state | [F1] staff see both items (description, location, reporter) on the match card | UI-06 |
| U28 | Flutter UI state | [F2] Verify opens a dialog showing both items; an empty note is refused and nothing is posted; Cancel posts nothing | UI-06 |
| U29 | Flutter UI state | [F2] Verify with a note posts ownershipConfirmed:true and the note, then refreshes | UI-06, FR-05 |
| U30 | Flutter UI state | [F2] Reject needs a reason and posts ownershipConfirmed:false | UI-06, FR-05 |
| U31 | Flutter UI state | [F2] Release asks for confirmation naming the claimant; Cancel posts nothing; Release posts | UI-06 |
| U32 | Flutter UI state | [F1][F4] a student sees plain-language status and only their own item, no staff controls and no found item | UI-07, SR-07 |
| U33 | Flutter UI state | [F4] notifications read as plain language with a time; staff additionally see references and delivery detail | UI-07 |
| U34 | Flutter UI state | [F5] the delivery simulator is hidden in normal builds and never sent to the server | UI-08 |
| U35 | Flutter UI state | [F7] confirmation messages stay visible long enough to read and can be dismissed | UI-07 |
| U36 | Flutter UI state | [F8] a decision is still sent and reported when the layout changes (rotation / window resize) while the dialog is open | UI-06, NF-01 |
| W01 | Flutter widget | sign-in validates empty user id and password | UI-01 |
| W02 | Flutter widget | password field is obscured by default | UI-01 |
| W03 | Flutter widget | report form shows validation errors before calling API | UI-02 |
| W04 | Flutter widget | network failure shows error state with retry | UI-04 |
| W05 | Flutter widget | expired session (401) offers sign in again, no retry | UI-01, UI-04 |
| W06 | Flutter widget | authorization error hides retry | UI-04 |
| W07 | Flutter widget | empty list shows empty state | UI-04 |
