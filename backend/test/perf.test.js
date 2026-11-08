'use strict';
// Week 16: performance and lifecycle tests (event-loop protection, group commit, durability, graceful shutdown, speed guard).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { start, SEED, SECRET, passwordOf } = require('./helpers');
const { Store } = require('../src/store');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { buildUserTable } = require('../src/auth');
const { createShutdown } = require('../src/lifecycle');
const wf = require('../src/workflow');

const today = () => new Date().toISOString().slice(0, 10);
const rep = (n, extra = {}) => ({ type: 'lost', category: 'other', description: `performance test item number ${n}`, location: 'library', eventDate: today(), ...extra });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lf-perf-'));

test('P01 password verification uses asynchronous scrypt: the blocking call is never used on the login path', async () => {
  // Deterministic guard (a wall-clock threshold flakes under CPU contention): count calls to both scrypt variants during 8 logins.
  const crypto = require('node:crypto');
  const realSync = crypto.scryptSync; const realAsync = crypto.scrypt; let syncCalls = 0; let asyncCalls = 0;
  const s = await start();
  crypto.scryptSync = (...a) => { syncCalls += 1; return realSync(...a); };
  crypto.scrypt = (...a) => { asyncCalls += 1; return realAsync(...a); };
  try {
    const ids = ['stu1', 'stu2', 'emp1', 'sec1', 'cust1', 'stu1', 'stu2', 'emp1'];
    const rs = await Promise.all(ids.map((id) => s.raw('POST', '/api/auth/login', { body: { userId: id, password: passwordOf(id) } })));
    assert.ok(rs.every((r) => r.status === 200), 'all logins succeed');
    const bad = await s.raw('POST', '/api/auth/login', { body: { userId: 'nobody', password: 'x' } });   // unknown user also hashes (timing equalisation)
    assert.equal(bad.status, 401);
  } finally { crypto.scryptSync = realSync; crypto.scrypt = realAsync; }
  assert.equal(syncCalls, 0, 'synchronous scrypt blocks the event loop (~50 ms per login) and must not be used for requests');
  assert.equal(asyncCalls, 9, 'every login (including an unknown user) performs exactly one asynchronous hash');
  s.close();
});

test('P02 group commit: 40 concurrent writes are all acknowledged, all on disk, and share a small number of file writes', async () => {
  const dir = tmp(); const file = path.join(dir, 'db.json'); const store = new Store(file);
  const s = await start({ store });
  await s.tokenFor('stu1');
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => s.call('POST', '/api/reports', rep(100 + i, { description: `group commit item ${i} code${i * 13}` }))));
  assert.ok(rs.every((r) => r.status === 201), 'every request acknowledged');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).reports.length, 40, 'every acknowledged report is already on disk');
  assert.ok(store.stats.writes < 20, `expected batching, got ${store.stats.writes} file writes for 40 requests`);
  s.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('P03 durability gate: when a 201 is returned the report is already in the data file', async () => {
  const dir = tmp(); const file = path.join(dir, 'db.json'); const s = await start({ store: new Store(file) });
  for (let i = 0; i < 8; i++) {
    const r = await s.call('POST', '/api/reports', rep(200 + i, { description: `durable item ${i} unique${i * 7}` }));
    assert.equal(r.status, 201);
    assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).reports.some((x) => x.id === r.body.report.id), 'acknowledged but not persisted');
  }
  s.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('P04 a failed batch write fails every request in the batch (500), then a later write succeeds', async () => {
  const dir = tmp(); const blocker = path.join(dir, 'blocker'); fs.writeFileSync(blocker, 'x');
  const store = new Store(path.join(blocker, 'sub', 'db.json')); const s = await start({ store });
  const rs = await Promise.all([1, 2, 3, 4].map((i) => s.call('POST', '/api/reports', rep(300 + i, { description: `doomed batch item ${i} zz${i}` }))));
  assert.ok(rs.every((r) => r.status === 500), 'no request may be acknowledged if the write failed');
  assert.equal((await s.call('GET', '/ready', null, null)).status, 503);
  store.file = path.join(dir, 'db.json');
  assert.equal((await s.call('POST', '/api/reports', rep(310, { description: 'recovered write item' }))).status, 201);
  assert.equal((await s.call('GET', '/ready', null, null)).status, 200);
  s.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('P05 readiness reports shutting_down once shutdown has begun; liveness is unaffected', async () => {
  const s = await start(); s.app.locals.shuttingDown = true;
  const r = await s.call('GET', '/ready', null, null);
  assert.equal(r.status, 503); assert.equal(r.body.reason, 'shutting_down');
  assert.equal((await s.call('GET', '/health', null, null)).status, 200); s.close();
});

test('P06 graceful shutdown: in-flight request completes and is persisted, new connections refused, exit 0, idempotent', async () => {
  const dir = tmp(); const file = path.join(dir, 'db.json'); const store = new Store(file);
  const config = loadConfig({ JWT_SECRET: SECRET, LOGIN_IP_MAX: '1000' }, () => {});
  const delivery = { sleep: async () => {}, channel: async () => { await new Promise((r) => setTimeout(r, 250)); return {}; } };
  const app = createApp(store, { config, users: buildUserTable(SEED), delivery });
  const server = http.createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (id) => fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify({ userId: id, password: passwordOf(id) }) }).then((r) => r.json());
  const [stu, sec] = [(await login('stu1')).token, (await login('sec1')).token];
  const post = (tok, body) => fetch(base + '/api/reports', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok, connection: 'close' }, body: JSON.stringify(body) });
  await post(stu, rep(400, { category: 'wallet', description: 'black leather wallet student card' }));
  let exitCode = null; const shutdown = createShutdown({ server, app, store, timeoutMs: 5000, exit: (c) => { exitCode = c; } });
  const slow = post(sec, { ...rep(401), type: 'found', category: 'wallet', description: 'black leather wallet student card inside' }); // ~250 ms delivery
  await new Promise((r) => setTimeout(r, 80));
  const p1 = shutdown('test'); const p2 = shutdown('again'); assert.strictEqual(p1, p2, 'idempotent');
  assert.equal(app.locals.shuttingDown, true);
  await new Promise((r) => setTimeout(r, 20));
  const refused = await fetch(base + '/health', { signal: AbortSignal.timeout(2000) }).then(() => 'answered', () => 'refused');
  assert.equal(refused, 'refused', 'no new connections once draining');
  const res = await slow; assert.equal(res.status, 201, 'in-flight request completes');
  assert.equal(await p1, 0); assert.equal(exitCode, 0);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).reports.length, 2, 'both reports persisted before exit');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('P07 speed guard: at 10,000 stored reports the best of 5 batches costs under 15 ms per create (typically about 3 ms; about 30-60 ms before caching)', async () => {
  // Wall-clock tests flake under CPU contention and a ratio between two sizes flakes too (the small size is so fast that noise and
  // JIT warm-up dominate it). The BEST of several short batches filters out contention, so it measures the code, not the machine.
  const lib = require('./support/perf-lib');
  const actor = { id: 'stu1', role: 'student' }; const opts = { delivery: { sleep: async () => {} } };
  const store = new Store(null); store.data = lib.makeDb(10000);
  const mk = (i) => ({ type: i % 2 ? 'lost' : 'found', category: lib.pick(lib.CATEGORIES), description: lib.words(4) + ' perf' + i, location: lib.pick(lib.PLACES), eventDate: today() });
  for (let i = 0; i < 10; i++) await wf.createReport(store, actor, mk(i), opts);          // warm-up: fills the token cache
  let best = Infinity; let n = 100;
  for (let batch = 0; batch < 5; batch++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 20; i++) await wf.createReport(store, actor, mk(n++), opts);
    best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e6 / 20);
  }
  assert.ok(best < 15, `best batch: ${best.toFixed(2)} ms per createReport at 10,000 reports (limit 15; typical 3)`);
});

test('P08 a stale temp file left by a crash mid-write is ignored and removed at startup', () => {
  const dir = tmp(); const file = path.join(dir, 'db.json');
  const first = new Store(file); first.nextId('R'); first.save();
  fs.writeFileSync(file + '.tmp', '{"seq": 99, "reports": [');           // half-written temp file from a killed process
  const second = new Store(file);
  assert.equal(second.data.seq, 1, 'the committed file is used, not the temp file');
  assert.equal(fs.existsSync(file + '.tmp'), false, 'stale temp file removed');
  fs.rmSync(dir, { recursive: true, force: true });
});
