'use strict';
// Week 14 adverse-case tests (SA8 / IA5): altered, expired, invalid and unauthorized behaviour.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const jwt = require('jsonwebtoken');
const { start, SECRET, passwordOf } = require('./helpers');
const log = require('../src/logger');
const { loadConfig } = require('../src/config');
const { verifyPassword, hashPassword } = require('../src/auth');
const { Store } = require('../src/store');
const { createApp } = require('../src/app');
const { buildUserTable } = require('../src/auth');

const report = { type: 'lost', category: 'wallet', description: 'black leather wallet with student card', location: 'library 2nd floor', eventDate: '2026-11-01' };
const found = { ...report, type: 'found', description: 'black leather wallet student card inside', location: 'library second floor', eventDate: '2026-11-02' };
const claims = (o = {}) => ({ sub: 'stu1', role: 'student', iss: 'lostfound-api', aud: 'lostfound-web', ...o });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

test('S01 no token -> 401 with WWW-Authenticate', async () => {
  const s = await start();
  const r = await s.call('GET', '/api/reports', null, null);
  assert.equal(r.status, 401); assert.equal(r.headers.get('www-authenticate'), 'Bearer'); s.close();
});
test('S02 valid login returns a signed token and /me reflects the server-side role', async () => {
  const s = await start();
  const r = await s.raw('POST', '/api/auth/login', { body: { userId: 'sec1', password: passwordOf('sec1') } });
  assert.equal(r.status, 200); assert.equal(r.body.user.role, 'security');
  const me = await s.call('GET', '/api/auth/me', null, { token: r.body.token });
  assert.equal(me.body.role, 'security'); assert.equal(r.body.passwordHash, undefined); s.close();
});
test('S03 wrong password and unknown user give identical 401 (no user enumeration)', async () => {
  const s = await start();
  const a = await s.raw('POST', '/api/auth/login', { body: { userId: 'stu1', password: 'wrong-password' } });
  const b = await s.raw('POST', '/api/auth/login', { body: { userId: 'nobody', password: 'wrong-password' } });
  assert.equal(a.status, 401); assert.equal(b.status, 401); assert.deepEqual(a.body, b.body); s.close();
});
test('S04 account locks after 5 failures; correct password is then refused (429)', async () => {
  const s = await start();
  for (let i = 0; i < 5; i++) await s.raw('POST', '/api/auth/login', { body: { userId: 'stu2', password: 'bad' + i } });
  const r = await s.raw('POST', '/api/auth/login', { body: { userId: 'stu2', password: passwordOf('stu2') } });
  assert.equal(r.status, 429); assert.equal(r.body.error.code, 'ACCOUNT_LOCKED'); s.close();
});
test('S05 altered token (role escalated, original signature) -> 401', async () => {
  const s = await start();
  const good = await s.tokenFor('stu1');
  const [h, , sig] = good.split('.');
  const forged = [h, b64({ ...jwt.decode(good), role: 'custodian' }), sig].join('.');
  assert.equal((await s.call('GET', '/api/manual-queue', null, { token: forged })).status, 401); s.close();
});
test('S06 token signed with a different secret -> 401', async () => {
  const s = await start();
  const t = jwt.sign(claims({ role: 'custodian', sub: 'cust1' }), 'x'.repeat(48), { algorithm: 'HS256', expiresIn: 600 });
  assert.equal((await s.call('GET', '/api/manual-queue', null, { token: t })).status, 401); s.close();
});
test('S07 "alg: none" unsigned token -> 401', async () => {
  const s = await start();
  const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...claims({ role: 'custodian', sub: 'cust1' }), exp: Math.floor(Date.now() / 1000) + 600 })}.`;
  assert.equal((await s.call('GET', '/api/manual-queue', null, { token: t })).status, 401); s.close();
});
test('S08 expired token -> 401 (and logged as expired)', async () => {
  const s = await start(); log.clear();
  const t = jwt.sign(claims(), SECRET, { algorithm: 'HS256', expiresIn: -60 });
  assert.equal((await s.call('GET', '/api/reports', null, { token: t })).status, 401);
  assert.ok(log.recent().some((l) => l.event === 'auth.token_rejected' && l.reason === 'expired')); s.close();
});
test('S09 token with wrong audience/issuer -> 401', async () => {
  const s = await start();
  const t1 = jwt.sign({ sub: 'stu1', role: 'student', iss: 'evil', aud: 'lostfound-web' }, SECRET, { expiresIn: 600 });
  const t2 = jwt.sign({ sub: 'stu1', role: 'student', iss: 'lostfound-api', aud: 'other-app' }, SECRET, { expiresIn: 600 });
  assert.equal((await s.call('GET', '/api/reports', null, { token: t1 })).status, 401);
  assert.equal((await s.call('GET', '/api/reports', null, { token: t2 })).status, 401); s.close();
});
test('S10 token for a user whose role no longer matches the server record -> 401', async () => {
  const s = await start();
  const t = jwt.sign(claims({ role: 'custodian' }), SECRET, { algorithm: 'HS256', expiresIn: 600 }); // stu1 is a student
  assert.equal((await s.call('GET', '/api/manual-queue', null, { token: t })).status, 401); s.close();
});
test('S11 legacy X-Role / X-User-Id headers grant nothing', async () => {
  const s = await start();
  const anon = await s.raw('GET', '/api/manual-queue', { headers: { 'x-role': 'custodian', 'x-user-id': 'cust1' } });
  assert.equal(anon.status, 401);
  const stu = await s.raw('GET', '/api/manual-queue', { headers: { authorization: `Bearer ${await s.tokenFor('stu1')}`, 'x-role': 'custodian' } });
  assert.equal(stu.status, 403); s.close();
});
test('S12 students get 403 on every staff endpoint', async () => {
  const s = await start();
  for (const [m, p] of [['GET', '/api/manual-queue'], ['GET', '/api/logs'], ['GET', '/api/audit'], ['POST', '/api/jobs/aging'], ['POST', '/api/matches/M-0001/release'], ['POST', '/api/manual-queue/MQ-0001/resolve']]) {
    assert.equal((await s.call(m, p, {})).status, 403, `${m} ${p}`);
  }
  assert.equal((await s.call('POST', '/api/jobs/aging', {}, 'sec1')).status, 403, 'only custodian may run jobs'); s.close();
});
test('S13 object-level access: another student cannot read, list or match-view someone else\'s data', async () => {
  const s = await start();
  const mine = await s.call('POST', '/api/reports', report, 'stu1');
  const id = mine.body.report.id;
  assert.equal((await s.call('GET', `/api/reports/${id}`, null, 'stu2')).status, 404);
  assert.equal((await s.call('GET', '/api/reports', null, 'stu2')).body.length, 0);
  assert.equal((await s.call('GET', `/api/reports/${id}`, null, 'stu1')).status, 200);
  assert.equal((await s.call('GET', `/api/reports/${id}`, null, 'sec1')).status, 200); s.close();
});
test('S14 logout revokes the token', async () => {
  const s = await start();
  const t = (await s.raw('POST', '/api/auth/login', { body: { userId: 'stu1', password: passwordOf('stu1') } })).body.token;
  assert.equal((await s.call('GET', '/api/reports', null, { token: t })).status, 200);
  assert.equal((await s.call('POST', '/api/auth/logout', {}, { token: t })).status, 204);
  assert.equal((await s.call('GET', '/api/reports', null, { token: t })).status, 401); s.close();
});
test('S15 data minimisation: claimant match/notification views hide found id, verifier, notes and internals', async () => {
  const s = await start();
  await s.call('POST', '/api/reports', report, 'stu1');
  const f = await s.call('POST', '/api/reports', { ...found, simulateDelivery: 'ok' }, 'sec1');
  await s.call('POST', `/api/matches/${f.body.matches[0].id}/verify`, { ownershipConfirmed: true, note: 'checked ID card' }, 'cust1');
  const m = (await s.call('GET', '/api/matches', null, 'stu1')).body[0];
  assert.deepEqual(Object.keys(m).sort(), ['createdAt', 'id', 'lost', 'lostId', 'score', 'status']);
  assert.equal(m.lost.reporterId, undefined, 'own-report summary does not need to carry the reporter id');
  assert.ok(!JSON.stringify(m).includes('R-0002') && !JSON.stringify(m).includes('study desk') && !JSON.stringify(m).includes('checked ID card'), 'nothing about the found item, verifier or note');
  const n = (await s.call('GET', '/api/notifications', null, 'stu1')).body[0];
  assert.equal(n.sim, undefined); s.close();
});
test('S16 input validation: type confusion, control characters, bad dates -> 422', async () => {
  const s = await start();
  for (const bad of [
    { ...report, description: { $ne: null } }, { ...report, description: ['a', 'b'] }, { ...report, location: 12345 },
    { ...report, description: 'bad\u0000char here' }, { ...report, eventDate: '2026-1-1' }, { ...report, eventDate: { y: 2026 } }, { ...report, category: '__proto__' },
  ]) assert.equal((await s.call('POST', '/api/reports', bad)).status, 422, JSON.stringify(bad));
  assert.equal((await s.call('POST', '/api/reports', [1, 2, 3])).status, 422); s.close();
});
test('S17 oversized body -> 413; malformed identifiers -> 404', async () => {
  const s = await start();
  const big = await s.call('POST', '/api/reports', { ...report, description: 'x'.repeat(20000) });
  assert.equal(big.status, 413);
  assert.equal((await s.call('GET', '/api/reports/..%2F..%2Fetc', null, 'sec1')).status, 404);
  assert.equal((await s.call('POST', "/api/matches/M-1;DROP/verify", {}, 'sec1')).status, 404); s.close();
});
test('S18 hostile text is stored inert and returned as data (no execution, no crash)', async () => {
  const s = await start();
  const payload = `<script>alert(1)</script>'; DROP TABLE reports;--`;
  const r = await s.call('POST', '/api/reports', { ...report, description: payload });
  assert.equal(r.status, 201); assert.equal(r.body.report.description, payload.trim());
  assert.match(r.headers.get('content-type'), /application\/json/); s.close();
});
test('S19 mass assignment: client-supplied id/status/reporterId are ignored', async () => {
  const s = await start();
  const r = await s.call('POST', '/api/reports', { ...report, id: 'R-9999', status: 'closed', reporterId: 'cust1', remindedAt: 'x' }, 'stu1');
  assert.equal(r.body.report.reporterId, 'stu1'); assert.equal(r.body.report.status, 'open'); assert.notEqual(r.body.report.id, 'R-9999'); s.close();
});
test('S20 logs never contain passwords, tokens or report text', async () => {
  const s = await start(); log.clear();
  const token = await s.tokenFor('stu1');
  await s.raw('POST', '/api/auth/login', { body: { userId: 'stu1', password: 'Wrong-Secret-Value-123' } });
  await s.call('POST', '/api/reports', report, 'stu1');
  await s.call('GET', '/api/reports', null, { token: token + 'x' });
  const dump = JSON.stringify(log.recent(500));
  assert.ok(!dump.includes('Wrong-Secret-Value-123')); assert.ok(!dump.includes(passwordOf('stu1')));
  assert.ok(!dump.includes(token)); assert.ok(!dump.includes('black leather wallet')); s.close();
});
test('S21 logger redacts sensitive keys and JWT-looking strings even if a caller slips', () => {
  log.clear();
  const e = log.info('x', { password: 'p', nested: { token: 't', ok: 1 }, msg: 'bearer eyJhbGciOi.eyJzdWIiOiJ4.abc-DEF_123' });
  assert.equal(e.password, '[REDACTED]'); assert.equal(e.nested.token, '[REDACTED]'); assert.equal(e.nested.ok, 1); assert.ok(e.msg.includes('[REDACTED_TOKEN]'));
});
test('S22 security headers present and x-powered-by removed', async () => {
  const s = await start();
  const r = await s.raw('GET', '/health');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.equal(r.headers.get('x-powered-by'), null);
  assert.ok(r.headers.get('content-security-policy')); assert.equal(r.body.time, undefined); s.close();
});
test('S23 CORS: only configured origins are allowed', async () => {
  const s = await start({ env: { CORS_ORIGINS: 'https://app.example.test' } });
  const ok = await s.raw('GET', '/health', { headers: { origin: 'https://app.example.test' } });
  const bad = await s.raw('GET', '/health', { headers: { origin: 'https://evil.example' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.example.test');
  assert.equal(bad.headers.get('access-control-allow-origin'), null); s.close();
});
test('S24 global rate limit returns 429', async () => {
  const s = await start({ env: { RATE_LIMIT_PER_MIN: '5' } });
  let last; for (let i = 0; i < 8; i++) last = await s.raw('GET', '/health');
  assert.equal(last.status, 429); s.close();
});
test('S25 configuration: production refuses missing/weak secret and missing TLS', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }, () => {}), /JWT_SECRET is required/);
  assert.throws(() => loadConfig({ JWT_SECRET: 'short' }, () => {}), /at least 32/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: SECRET }, () => {}), /TLS/);
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: SECRET, TRUST_PROXY_TLS: '1' }, () => {}));
});
test('S26 production disables test hooks (simulated delivery, clock override)', async () => {
  const s = await start({ env: { NODE_ENV: 'production', TRUST_PROXY_TLS: '1' } });
  assert.equal(s.config.allowTestHooks, false);
  assert.equal((await s.call('POST', '/api/jobs/aging', { now: '2030-01-01' }, 'cust1')).status, 403);
  await s.call('POST', '/api/reports', report, 'stu1');
  await s.call('POST', '/api/reports', { ...found, simulateDelivery: 'permanent' }, 'sec1');
  assert.equal(s.store.data.notifications[0].status, 'delivered', 'simulated failure must be ignored in production'); s.close();
});
test('S27 passwords are stored only as salted scrypt hashes', () => {
  const users = buildUserTable([{ id: 'a', role: 'student', password: 'Same-Password-1' }, { id: 'b', role: 'student', password: 'Same-Password-1' }]);
  const a = users.get('a').passwordHash, b = users.get('b').passwordHash;
  assert.ok(a.startsWith('scrypt$')); assert.ok(!a.includes('Same-Password-1')); assert.notEqual(a, b);
  assert.ok(verifyPassword('Same-Password-1', a)); assert.ok(!verifyPassword('same-password-1', a));
  assert.ok(!verifyPassword('x', 'plaintext-not-a-hash'));
});
test('S28 HTTPS: API is reachable over TLS with the dev certificate and rejects plain HTTP', async (t) => {
  const certDir = path.join(__dirname, '..', 'certs');
  if (!fs.existsSync(path.join(certDir, 'dev-cert.pem'))) return t.skip('dev certificate not generated');
  const key = fs.readFileSync(path.join(certDir, 'dev-key.pem')), cert = fs.readFileSync(path.join(certDir, 'dev-cert.pem'));
  const config = loadConfig({ JWT_SECRET: SECRET }, () => {});
  const server = https.createServer({ key, cert, minVersion: 'TLSv1.2' }, createApp(new Store(null), { config, users: buildUserTable([]) }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const res = await new Promise((resolve, reject) => {
      https.get({ host: '127.0.0.1', port, path: '/health', ca: cert, servername: 'localhost' }, (r) => {
        const proto = r.socket.getProtocol();
        let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode, d, proto }));
      }).on('error', reject);
    });
    assert.equal(res.status, 200); assert.ok(['TLSv1.2', 'TLSv1.3'].includes(res.proto), res.proto);
    const plain = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) }).then(() => 'answered', () => 'refused');
    assert.equal(plain, 'refused');
  } finally {
    server.close(); server.closeAllConnections();
  }
});
