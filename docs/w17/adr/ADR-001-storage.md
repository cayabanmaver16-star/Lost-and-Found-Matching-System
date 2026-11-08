# ADR-001: Storage - JSON file now, database before production

Status: Accepted for the pilot. Revisit when any trigger below fires.

## Context
The API keeps reports, matches, notifications, the manual queue and the audit trail in memory and persists them to one JSON file. Week 16 measured how this behaves as data grows, and rehearsed crash and corruption recovery.

## Options considered
| Option | Strengths | Weaknesses |
|---|---|---|
| A. JSON file with group commit (chosen for the pilot) | No dependency or service to run; whole state inspectable; easy to back up and to test; atomic temp-file-and-rename writes; survived a hard kill with zero lost acknowledged writes | Every write serialises the whole data set, so cost grows with data; single writer (one instance only); no queries or indexes; no encryption at rest; audit trail grows without bound |
| B. SQLite | One file, transactions, indexes, WAL; small migration from option A; still no separate server | Still single-writer; native module (build/prebuilt binary issues on Windows); another dependency to patch |
| C. PostgreSQL (or other server database) | Multiple instances, indexes, point-in-time recovery, encryption at rest, role-based DB access | Operational cost (a service to run, secure and back up) that a one-student prototype and a pilot do not need |

## Decision
Keep option A for the supervised single-instance pilot, behind the small `Store` class, with group commit so concurrent writes share one asynchronous atomic write. Move to option C (or B as a stepping stone) before general production use.

## Evidence
- Create-report 95th percentile (docs/w16): 16 ms empty, 39 ms at 2,000 reports, 94 ms at 10,000, 258 ms at 25,000. The cost is the whole-file serialisation and still grows with data; before the Week 16 fixes it was 5.5 s at 10,000 reports.
- Crash rehearsal: killed during 601 acknowledged writes; file valid, none missing, restart in about 0.9 s (RPO 0 for acknowledged writes).
- Corruption rehearsal: recovered from `.bak`, losing up to the backup interval (20 reports in the rehearsal); refuses to start with a clear message when both files are bad.
- Tests: H17, H18, P02-P04, P08, O02.

## Consequences
- Supported comfort zone: about 10,000 stored reports and one instance; the runbook alerts at an 8 MB file.
- Closed reports and the audit trail should be archived or trimmed; this is not automated yet.
- Because storage sits behind `Store` (`changed()`, `commit()`, `save()`), swapping the implementation changes one file and its tests.

## Revisit when
The data file exceeds 8 MB; stored reports pass about 10,000; a second instance is needed; encryption at rest or point-in-time recovery becomes a requirement; or a user-visible search/filter feature needs queries.
