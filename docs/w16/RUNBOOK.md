# Lost-and-Found API - Operations Runbook (Week 16)

Scope: single-instance pilot deployment. Controlled data only.

## 1. Configuration (environment variables)
| Variable | Purpose | Pilot value |
|---|---|---|
| `NODE_ENV=production` | Fail-fast config, test hooks off | required |
| `JWT_SECRET` | Token signing, 32+ random chars | from secret store, never in git |
| `TLS_KEY_FILE`, `TLS_CERT_FILE` | HTTPS (or `TRUST_PROXY_TLS=1` behind a TLS proxy) | CA-issued cert |
| `TRUST_PROXY` | Number of reverse-proxy hops, so rate limits use the real client IP | 1 behind one proxy |
| `RATE_LIMIT_PER_MIN` | Global per-IP limit (default 300). Raise for campus NAT/shared IPs | 3000 |
| `CORS_ORIGINS` | Allowed web origin(s) | the Flutter site |
| `DATA_FILE` | Data file path (keep on a backed-up volume) | e.g. `/var/lib/lostfound/db.json` |
| `BACKUP_INTERVAL_MS` | Minimum gap between `.bak` rotations (default 60000) | 5000 |
| `SLOW_REQUEST_MS` | Slow-request warning threshold (default 1000) | 500 |
| `UV_THREADPOOL_SIZE` | Threads for password hashing and file I/O (default 4) | leave default; all measurements used 4. Raising it is untested |

## 2. Start, stop, health
- Start: `node src/server.js`. Wait for `GET /ready` = 200 before sending traffic.
- Stop: send SIGTERM (or Ctrl+C). The server answers `/ready` 503 `shutting_down`, finishes in-flight requests, flushes the data file, exits 0 (hard deadline 10 s). Windows: use a service wrapper that sends Ctrl+C; a hard kill is also safe (see section 5) but skips the drain.
- Probes: `GET /health` = process alive (public). `GET /ready` = can accept work: 503 `storage_unavailable` after a failed disk write, 503 `shutting_down` while draining.

## 3. Monitoring (poll every 15-60 s)
`GET /api/metrics` (security or custodian token) returns request counts, per-route p50/p95/p99, 4xx/5xx counts, process memory and CPU, and event-loop delay. Alert on:
| Signal | Warn | Page |
|---|---|---|
| `/ready` not 200 | 1 check | 2 consecutive |
| `eventLoop.p99Ms` | > 100 ms | > 500 ms for 2 min (saturation: requests are queuing) |
| `process.cpuPercentSinceLast` | > 80% for 5 min | > 100% for 5 min (one core saturated) |
| any route `serverErrors` increasing | any | rate > 1% |
| `http.slow_request` log lines | > 5 / min | > 30 / min |
| `process.rssMB` | > 400 | > 800 |
| data file size | > 8 MB (~20,000 reports) | > 15 MB: migrate to a database |
Note: slow-request logs and route latency are measured once the server starts handling a request, so they UNDER-report queueing. Event-loop delay and CPU are the saturation signals.

## 4. Deploy and roll back (health-gated)
1. Keep the previous release directory untouched (`releases/vN-1`).
2. Stop current (graceful), start candidate against the same `DATA_FILE`.
3. Gate: `/ready` 200 within 10 s, then login + `GET /api/reports?limit=5` = 200.
4. Gate fails: kill candidate, restart previous release, repeat gate. Rehearsal (`node perf/rehearse.js`): rollback completes in about 2 s; data unchanged.
5. Never run two instances against one data file (single-writer file store).

## 5. Recovery
- Process crash / power loss: restart. Writes are acknowledged only after an atomic file replace, so no acknowledged report is lost; a stale `db.json.tmp` is removed at startup.
- Corrupt `db.json`: startup uses `db.json.bak` automatically (log `store.recovered_from_backup`). Data written since the last `.bak` rotation (up to `BACKUP_INTERVAL_MS`) is lost. If both files are corrupt the server refuses to start with a clear message: restore from the off-machine backup.
- Off-machine backup: copy `db.json` every 15 minutes to separate storage (not provided by the app).
- Storage full / read-only: `/ready` goes 503 and writes return 500 until space is freed; reads continue.

## 6. Capacity (measured on an 8-thread laptop, load generator on the same machine)
- Comfortable: up to ~250 requests/s with p95 under 300 ms, one instance.
- Data volume: p95 of a write stays under 100 ms up to ~10,000 stored reports; ~260 ms at 25,000. Archive closed reports or move to a database before that.
