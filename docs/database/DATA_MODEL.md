# Data model

One JSON document with these top-level keys (from `backend/src/store.js`):

| Key | Content |
|---|---|
| `seq` | counter used to create ids such as `R-0001` |
| `reports` | lost and found reports (type, item description, date, location, owner, status) |
| `matches` | candidate pairs of one lost and one found report, with score and state: candidate, verified, released, rejected, withdrawn |
| `notifications` | notification attempts and outcomes (3 attempts with backoff) |
| `manualQueue` | notifications that failed all attempts and need staff action |
| `audit` | append-only record of who did what and when |

Users are not stored in this file: the seeded demo accounts come from `seed/demo-users.json` (passwords are hashed with scrypt at start-up).
Rules for each field are in the API contract, `docs/w17/openapi.yaml`.
