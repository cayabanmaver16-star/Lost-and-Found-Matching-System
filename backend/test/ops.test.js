'use strict';
// Week 16: operability tests - health/readiness, metrics, slow-request logging, proxy-aware rate limiting,
// graceful shutdown, event-loop protection and a performance smoke guard.
const test = require('node:test');
const assert = require('node:assert');
const { start } = require('./helpers');
const log = require('../src/logger');

const rep = (n, extra = {}) => ({ type: 'lost', category: 'other', description: `operability test item number ${n}`, location: 'library', eventDate: new Date().toISOString().slice(0, 10), ...extra });

test('O01 liveness and readiness: /health and /ready are public, minimal and report ready on a healthy server', async () => {
  const s = await start();
  const h = await s.call('GET', '/health', null, null); const r = await s.call('GET', '/ready', null, null);
  assert.equal(h.status, 200); assert.deepEqual(h.body, { status: 'ok' });
  assert.equal(r.status, 200); assert.deepEqual(r.body, { status: 'ready' }); s.close();
});
test('O02 readiness turns 503 when a storage write really fails and recovers after the next successful write', async () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-ready-'));
  const blocker = path.join(dir, 'blocker'); fs.writeFileSync(blocker, 'a file where a directory is needed');
  const s = await start();
  s.store.file = path.join(blocker, 'sub', 'db.json');            // parent is a regular file: mkdir/write cannot succeed
  const failed = await s.call('POST', '/api/reports', rep(1));
  assert.equal(failed.status, 500); assert.equal(failed.body.error.message, 'Internal server error');
  const notReady = await s.call('GET', '/ready', null, null);
  assert.equal(notReady.status, 503); assert.equal(notReady.body.reason, 'storage_unavailable');
  assert.equal((await s.call('GET', '/health', null, null)).status, 200, 'liveness stays up while degraded');
  s.store.file = path.join(dir, 'db.json');                       // storage is back
  assert.equal((await s.call('POST', '/api/reports', rep(2, { description: 'second write after recovery' }))).status, 201);
  assert.equal((await s.call('GET', '/ready', null, null)).status, 200, 'ready again after a successful write');
  s.close(); fs.rmSync(dir, { recursive: true, force: true });
});
test('O03 /api/metrics is staff-only and reports counts, latency percentiles, process and event-loop figures', async () => {
  const s = await start();
  assert.equal((await s.call('GET', '/api/metrics', null, null)).status, 401);
  assert.equal((await s.call('GET', '/api/metrics', null, 'stu1')).status, 403);
  const created = await s.call('POST', '/api/reports', rep(3), 'stu1');
  for (let i = 0; i < 5; i++) await s.call('GET', '/api/reports', null, 'stu1');
  await s.call('GET', `/api/reports/${created.body.report.id}`, null, 'stu1');
  await s.call('GET', '/definitely/unknown', null, 'stu1');
  const m = (await s.call('GET', '/api/metrics', null, 'cust1')).body;
  const byRoute = Object.fromEntries(m.routes.map((r) => [r.route, r]));
  assert.ok(byRoute['GET /api/reports'].count >= 5); assert.ok(byRoute['GET /api/reports'].p95Ms >= 0);
  assert.ok(byRoute['GET /api/reports/:id'], 'routes are labelled by pattern, not by concrete id (bounded cardinality)');
  assert.ok(byRoute['GET unmatched'], 'unknown paths collapse into one label');
  assert.ok(!m.routes.some((r) => /R-\d{4}/.test(r.route)));
  assert.ok(m.requests.total >= 8 && m.requests.byStatus['2xx'] >= 6 && m.requests.byStatus['4xx'] >= 3);
  assert.ok(m.process.rssMB > 0 && m.process.heapUsedMB > 0 && m.eventLoop.p99Ms >= 0 && m.uptimeSec >= 0); s.close();
});
test('O04 metrics expose no tokens, passwords or report text', async () => {
  const s = await start();
  const tok = await s.tokenFor('stu1');
  await s.call('POST', '/api/reports', rep(4, { description: 'secret wallet description text' }), 'stu1');
  const dump = JSON.stringify((await s.call('GET', '/api/metrics', null, 'cust1')).body);
  assert.ok(!dump.includes(tok) && !dump.includes('secret wallet') && !dump.toLowerCase().includes('password')); s.close();
});
test('O05 requests slower than SLOW_REQUEST_MS are logged as warnings with route and duration', async () => {
  const s = await start({ env: { SLOW_REQUEST_MS: '15' }, delivery: { sleep: async () => {}, channel: async () => { await new Promise((r) => setTimeout(r, 40)); return {}; } } });
  await s.call('POST', '/api/reports', rep(5, { type: 'lost', category: 'wallet', description: 'black leather wallet student card' }), 'stu1');
  await s.tokenFor('sec1');                    // log in first: scrypt itself is slower than the 15 ms threshold
  log.clear();
  await s.call('POST', '/api/reports', { ...rep(6), type: 'found', category: 'wallet', description: 'black leather wallet student card inside' }, 'sec1');
  const slow = log.recent().find((l) => l.event === 'http.slow_request');
  assert.ok(slow, 'slow request must be logged'); assert.equal(slow.route, '/api/reports'); assert.ok(slow.ms >= 15 && slow.status === 201); s.close();
});
test('O06 rate limiting: X-Forwarded-For is ignored unless TRUST_PROXY is set (cannot be spoofed); with a proxy, clients get separate buckets', async () => {
  const hit = (s, ip) => s.raw('GET', '/health', { headers: { 'x-forwarded-for': ip } });
  const spoof = await start({ env: { RATE_LIMIT_PER_MIN: '4' } });
  let blocked = 0; for (let i = 0; i < 8; i++) if ((await hit(spoof, `10.0.0.${i}`)).status === 429) blocked += 1;
  assert.ok(blocked > 0, 'rotating the header must not bypass the limit without a trusted proxy'); spoof.close();
  const proxied = await start({ env: { RATE_LIMIT_PER_MIN: '4', TRUST_PROXY: '1' } });
  let any429 = false; for (let i = 0; i < 8; i++) if ((await hit(proxied, `10.0.1.${i}`)).status === 429) any429 = true;
  assert.equal(any429, false, 'distinct client IPs behind a trusted proxy have separate buckets');
  let same = 0; for (let i = 0; i < 8; i++) if ((await hit(proxied, '10.0.9.9')).status === 429) same += 1;
  assert.ok(same > 0, 'the same client IP is still limited'); proxied.close();
});
