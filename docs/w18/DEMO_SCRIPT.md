# Demonstration script (15 minutes) - Campus Lost-and-Found, Project 18

Every step says what to do, what to say, and what you should see. If something goes wrong, jump to the fallback level named in the step (see FALLBACK_PLAN.md). All accounts and data are fictional.

## Before you start
| When | Do | Expect |
|---|---|---|
| T-60 min | `node demo/preflight.js` | `GO: 12 of 12 checks passed` (it also runs the narrated rehearsal) |
| T-10 min | `node demo/start-demo.js --seed` in a terminal you can show | Banner with URLs and accounts; "History seeded" |
| T-5 min | Open **three browser tabs** on http://localhost:8080 and sign in: tab 1 `stu1` (student), tab 2 `sec1` (security), tab 3 `cust1` (custodian). Passwords are printed in the banner | Tokens live in memory, so three tabs = three independent sessions; no re-login needed during the talk |
| T-2 min | Open `docs/w17/diagrams/architecture.png` and `docs/w18/EVIDENCE_MAP.md` in other windows; browser zoom 100%, window wide enough that the left navigation rail shows | |

Tips: the first click after a page load can be ignored by Flutter, so click twice on a field if it does not focus. Success banners last 8 seconds: say what happened while it is visible.

## Timeline
| Time | Segment | Fallback if it fails |
|---|---|---|
| 0:00-1:00 | Problem and scope | none needed |
| 1:00-2:30 | Architecture and the three decisions I defend | L3 (open the PNG) |
| 2:30-8:00 | Live walkthrough: lost, found, match, verify, release | L1 then L2 |
| 8:00-10:00 | Resilience: failed notification, retry, crash durability | L2 (`--from 7 --to 8`, `--from 11 --to 11`) |
| 10:00-12:00 | Security | L2 (`--from 9 --to 9`) |
| 12:00-14:00 | Evidence map: tests, contract, performance, UAT, maintenance | L3 |
| 14:00-15:00 | Recommendation and limits, then questions | none needed |

## 0:00 Problem and scope (say)
"A campus needs a controlled way to match reported lost items with found items, verify ownership, and release them. Students and staff report; the system proposes matches and notifies the owner; a person always makes the ownership decision and writes down the proof. It is a Flutter Web client over a Node API, built and assessed over six weeks with tests, security, performance and acceptance evidence."

## 1:00 Architecture (show architecture.png; point to each thing as you say it)
- "Every request passes the same pipeline: metrics, headers and CORS, rate limits, a size-limited JSON parser, authentication, a durability gate, then routes with role checks."
- "Three trust boundaries: the browser, the data file, the notification channel."
- "I will defend three decisions: a JSON file store behind one class for the pilot (ADR-001), notification delivery inside the request for now (ADR-002), and human verification with explainable matching (ADR-005)."

## 2:30 Live walkthrough
| # | Tab | Do | Say | Expect |
|---|---|---|---|---|
| 1 | Student | **Report** tab. Press *Submit report* with the form empty | "The client shows field messages, but the server validates everything again." | Red messages under Description and Where |
| 2 | Student | Category *wallet*, type *I lost something*, Description `black leather wallet with student card and a red sticker`, Where `library second floor`, Submit | "A real calendar date inside the allowed window is required; the same report twice would be refused as a duplicate." | Banner "Report R-00xx submitted. No candidate match yet." |
| 3 | Security | **Report** tab, choose *I found something*, wallet, Description `black leather wallet, student card inside, red sticker on back`, Where `library 2nd floor study desk`, Submit | "Matching runs the moment this arrives." | Banner says 1 candidate match found |
| 4 | Student | **Notifications**, then **Matches** | "The owner is told in plain language. They see their own item and the status, never the finder or the found item: data minimisation." | "Possible match found for your lost item"; match shows only *Your lost item* |
| 5 | Custodian | **Matches** | "The person deciding sees both items side by side. This was a User Acceptance Testing finding: before, they saw only ids." | Two boxes: lost (claimant stu1) and found (sec1); status *Needs verification* |
| 6 | Custodian | *Verify ownership*, press *Confirm* with the box empty | "A decision without a recorded proof is not accepted; the API enforces it too (422)." | "Write at least 5 characters" |
| 7 | Custodian | Type `Student ID matched; described the red sticker on the back`, *Confirm* | "That sentence is in the audit trail." | Banner "Ownership verified"; status becomes *ready to release* |
| 8 | Custodian | *Release item* then confirm *Release* | "Release asks for confirmation, closes both reports, and withdraws any competing claim. An item cannot go to two people." | "Item released" |
| 9 | Student | Matches, then Reports | "The owner sees the outcome; their report is closed." | "Your item was released to you."; report status *closed* |

Fallback: if a screen misbehaves, reload the tab and sign in again (tokens are in memory only). If the server is stuck: Ctrl+C the start-demo terminal, run it again with `--keep`, reload (L1). If the UI is unusable: `node demo/rehearse.js --pace 2500 --from 3 --to 6` (L2).

## 8:00 Resilience (seed data required)
| # | Do | Say | Expect |
|---|---|---|---|
| 10 | Custodian tab -> **Manual queue** | "A notification could not be delivered after three attempts, so it came to a human instead of being lost." | One item "notification_failure ... Recipient mailbox unavailable" |
| 11 | Press *Re-send* | "Re-sending is guarded: a second click is refused so nothing is delivered twice." | Banner "Notification re-sent"; item disappears or shows resolved |
| 12 | Security tab -> Report form (demo build shows *Demo: simulate notification delivery*): choose *Transient failure*, submit a found report that matches an open lost report (use the seeded stu2 keys: category *keys*, `silver house keys blue tag`, `gym lockers`) | "Temporary failures are retried with a 1 s then 2 s backoff, with no human involved." | Submit takes about 3 seconds, then a match banner; notification shows delivered. Then say the lesson: "this wait is why delivery moves out of the request before a real gateway - ADR-002." |
| 13 | Terminal: Ctrl+C the demo, then `node demo/start-demo.js --keep` (optional, 30 s) | "A response is only sent after the data is on disk, so a crash cannot lose what a user was told succeeded." | Restarts in about 2 s; reload a tab, sign in, the reports are all still there |

## 10:00 Security (use the narrated run for the attacks)
Terminal: `node demo/rehearse.js --from 9 --to 9`
- "A token whose role was edited to custodian is refused (401); no token (401); a student on a staff endpoint (403); five wrong passwords lock the account even for the right password (429); a signed-out token is revoked."
- Mention without running: HTTPS with HSTS, scrypt hashes, role only from the signed token, strict validation, logs that never hold credentials, 28 security tests and a live adversarial run in Week 14.

## 12:00 Evidence map (show docs/w18/EVIDENCE_MAP.md, scroll the table)
- "Every claim has a file you can open. 134 tests are mapped to 32 requirements by a gate that fails if any test or requirement is orphaned."
- "The OpenAPI document is proven equal to the API in both directions; I deliberately broke it eight ways and the tests caught all eight."
- "Performance was measured, not assumed: peak throughput went from 52 to 170 requests per second after I found three bottlenecks by profiling; the last test run also found a 35-second first-load stall in my own static server."
- "Acceptance testing found 13 issues; 9 fixed and retested, 4 deferred with reasons."
- "Maintenance plan, runbook, limitations register: what happens after today."

## 14:00 Recommendation
"Conditional go for a supervised single-instance pilot with controlled data. Not for unrestricted production until: a database replaces the file, notification delivery moves to an outbox, shared state replaces in-memory counters, identity comes from the institution, and a retention policy is approved. The limitations register lists all 24 items with how each will be resolved."

## Commands cheat-sheet
```
node demo/preflight.js                       # GO / NO-GO
node demo/start-demo.js --seed               # start everything (Ctrl+C to stop)
node demo/start-demo.js --keep               # restart without wiping data
node demo/rehearse.js --pace 2500            # narrated fallback, 2.5 s per step
node demo/rehearse.js --from 9 --to 9        # one segment only
node scripts/final-check.js                  # all quality gates and the deliverables check
```
