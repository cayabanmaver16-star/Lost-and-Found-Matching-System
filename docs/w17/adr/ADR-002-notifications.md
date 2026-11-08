# ADR-002: Notification delivery - in the request now, outbox and worker before real gateways

Status: Accepted for the pilot with a simulated channel. Must change before a real e-mail/SMS gateway is connected.

## Context
When a candidate match is found the owner must be told. Delivery can fail temporarily (timeout) or permanently (bad address). Failures must not be lost, and a person must be able to fix permanent ones.

## Options considered
| Option | Strengths | Weaknesses |
|---|---|---|
| A. Deliver inside the create-report request with bounded retries (current) | Simplest; failure handling is easy to test deterministically; the response says whether the notification succeeded | The request waits for delivery: up to 3 s of backoff on retries, plus the real gateway's latency; a slow gateway slows every report submission |
| B. Transactional outbox plus a background worker | The request returns immediately; retries and backoff happen out of band; survives restarts if the outbox is persisted with the data; easy to add rate limits to the gateway | More moving parts: a worker loop, outbox state, idempotency, monitoring of the backlog |
| C. Message broker (queue service) | Scales, decouples, standard tooling | Another service to run and secure; disproportionate for this scale |

## Decision
Keep option A for the pilot because the channel is simulated and instant, and because it made the retry and recovery behaviour easy to prove (3 attempts, 1 s then 2 s backoff, then the manual queue; staff re-send guarded against double delivery). Replace it with option B before any real gateway is connected; option C only if volume ever justifies it.

## Evidence
- Week 13 evidence: a transient failure recovered on attempt 3; a permanent failure reached the manual queue and was re-sent by staff (tests T06, T07, UAT-08, UAT-09).
- Week 15: re-send is refused with 409 unless the notification has finally failed (H15); retry timing is exactly 1000 ms then 2000 ms (H13).
- Week 16: the load tests used an instant channel; tests O05 and P06 show a 250 ms channel directly lengthens the request. The 1.8 s event-loop stall in the baseline was not caused by delivery (it was password hashing), but real gateway latency would add up to the same order per request.

## Consequences
- Pilot limitation: report-submission latency includes delivery time. Document it to testers.
- The manual queue and the retry policy carry over unchanged to option B: only where the work runs changes.
- The outbox needs a stable idempotency key (the notification id already exists) so a worker restart cannot send twice.

## Revisit when
A real gateway is connected, delivery latency exceeds about 300 ms on average, or message volume exceeds a few per second.
