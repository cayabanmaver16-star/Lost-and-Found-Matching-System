'use strict';
// Week 15 (IA6): boundary, interoperability, reliability, integration and hardening tests.
// IDs H01.. are referenced from docs/traceability.json. Tests marked [Dn] guard a defect logged in the hardening report.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start } = require('./helpers');
const { Store } = require('../src/store');
const { score, MATCH_THRESHOLD } = require('../src/matching');
const { createAuth } = require('../src/auth');
const { loadConfig } = require('../src/config');
const { deliver, POLICY } = require('../src/notifier');
const log = require('../src/logger');

const base = { type: 'lost', category: 'wallet', description: 'black leather wallet with student card', location: 'library 2nd floor', eventDate: '2026-11-01' };
const foundBase = { ...base, type: 'found', description: 'black leather wallet student card inside', location: 'library second floor', eventDate: '2026-11-02' };
const isoDay = (d) => d.toISOString().slice(0, 10);
const FIXED = new Date('2026-11-07T22:00:00Z'); // = 2026-11-08 06:00 in Manila (UTC+8)

// ---------------- Boundary ----------------
test('H01 description boundaries: 4 rejected, 5 accepted, 300 accepted, 301 rejected, whitespace-only rejected', async () => {
  const s = await start({ clock: () => FIXED });
  const post = (d, who = 'stu1') => s.call('POST', '/api/reports', { ...base, description: d, category: 'other' }, who);
  assert.equal((await post('abcd')).status, 422);
  assert.equal((await post('abcde')).status, 201);
  assert.equal((await post('x'.repeat(300) + '')).status, 201);
  assert.equal((await post('y'.repeat(301))).status, 422);
  assert.equal((await post('       ')).status, 422); s.close();
});
test('H02 location boundaries: 1 rejected, 2 accepted, 100 accepted, 101 rejected', async () => {
  const s = await start({ clock: () => FIXED });
  const post = (l, d) => s.call('POST', '/api/reports', { ...base, location: l, description: d, category: 'other' });
  assert.equal((await post('a', 'desc one')).status, 422);
  assert.equal((await post('ab', 'desc two')).status, 201);
  assert.equal((await post('l'.repeat(100), 'desc three')).status, 201);
  assert.equal((await post('l'.repeat(101), 'desc four')).status, 422); s.close();
});
test('H03 [D1] a user in UTC+8 may report an item lost "today" even while UTC is still the previous day', async () => {
  const s = await start({ clock: () => FIXED });
  const post = (d, desc) => s.call('POST', '/api/reports', { ...base, eventDate: d, description: desc, category: 'books' });
  assert.equal((await post('2026-11-08', 'local today report')).status, 201, 'local "today" must be accepted');
  assert.equal((await post('2026-11-09', 'two days ahead report')).status, 422, 'a date beyond any timezone\'s today must be rejected'); s.close();
});
test('H04 [D9] event date older than 730 days is rejected; exactly 730 days accepted', async () => {
  const s = await start({ clock: () => FIXED });
  const day = (n) => isoDay(new Date(FIXED.getTime() - n * 86400000));
  assert.equal((await s.call('POST', '/api/reports', { ...base, eventDate: day(730), description: 'old but allowed', category: 'keys' })).status, 201);
  assert.equal((await s.call('POST', '/api/reports', { ...base, eventDate: day(731), description: 'too old report', category: 'keys' })).status, 422);
  assert.equal((await s.call('POST', '/api/reports', { ...base, eventDate: '1900-01-01', description: 'ancient report', category: 'keys' })).status, 422); s.close();
});
test('H05 [D12] impossible calendar dates (Feb 30, month 13, day 00) are rejected', async () => {
  const s = await start({ clock: () => FIXED });
  for (const d of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '2026-10-00']) {
    assert.equal((await s.call('POST', '/api/reports', { ...base, eventDate: d, description: 'date check ' + d })).status, 422, d);
  }
  s.close();
  const leap = await start({ clock: () => new Date('2024-03-10T12:00:00Z') }); // leap-year handling needs a clock near Feb 2024
  assert.equal((await leap.call('POST', '/api/reports', { ...base, eventDate: '2024-02-29', description: 'leap day valid', category: 'bag' })).status, 201);
  assert.equal((await leap.call('POST', '/api/reports', { ...base, eventDate: '2023-02-29', description: 'not a leap year', category: 'bag' })).status, 422);
  leap.close();
});
test('H06 [D11] matching threshold: same category + same day with NO shared words is not a candidate', () => {
  const lost = { type: 'lost', category: 'wallet', description: 'pink silk purse', location: 'gym', eventDate: '2026-11-01' };
  const found = { type: 'found', category: 'wallet', description: 'brown leather billfold', location: 'cafeteria', eventDate: '2026-11-01' };
  assert.ok(score(lost, found) < MATCH_THRESHOLD, `score ${score(lost, found)} must stay below ${MATCH_THRESHOLD}`);
  const near = { ...found, description: 'pink purse silk', location: 'gym entrance' };
  assert.ok(score(lost, near) >= MATCH_THRESHOLD);
});
test('H07 list limit parameter: default, bounds and junk values never break the API', async () => {
  const s = await start({ clock: () => FIXED });
  for (let i = 0; i < 3; i++) await s.call('POST', '/api/reports', { ...base, description: 'unique item number ' + i, category: 'other' });
  assert.equal((await s.call('GET', '/api/reports?limit=2')).body.length, 2);
  assert.equal((await s.call('GET', '/api/reports?limit=2&offset=2')).body.length, 1);
  for (const q of ['limit=0', 'limit=-5', 'limit=abc', 'limit=99999', 'offset=-1', 'offset=zzz', 'limit=1.5']) {
    const r = await s.call('GET', '/api/reports?' + q); assert.equal(r.status, 200, q); assert.ok(Array.isArray(r.body) && r.body.length <= 500, q);
  } s.close();
});

// ---------------- Interoperability ----------------
test('H08 content-type handling: charset parameter OK; wrong or missing body yields 422, never 500', async () => {
  const s = await start({ clock: () => FIXED });
  const tok = await s.tokenFor('stu1');
  const post = (ct, body) => s.raw('POST', '/api/reports', { rawBody: body, headers: { authorization: 'Bearer ' + tok, 'content-type': ct } });
  assert.equal((await post('application/json; charset=utf-8', JSON.stringify({ ...base, category: 'other' }))).status, 201);
  assert.equal((await post('text/plain', JSON.stringify(base))).status, 422);
  assert.equal((await post('application/json', '')).status, 422);
  assert.equal((await post('application/x-www-form-urlencoded', 'type=lost')).status, 422);
  const ok = await s.call('GET', '/health'); assert.match(ok.headers.get('content-type'), /application\/json; charset=utf-8/); s.close();
});
test('H09 CORS preflight: allowed origin gets methods/headers; disallowed origin gets none', async () => {
  const s = await start({ env: { CORS_ORIGINS: 'https://app.example.test' } });
  const pre = (origin) => s.raw('OPTIONS', '/api/reports', { headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
  const ok = await pre('https://app.example.test');
  assert.ok([200, 204].includes(ok.status)); assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.example.test');
  assert.match(ok.headers.get('access-control-allow-headers'), /authorization/i); assert.doesNotMatch(ok.headers.get('access-control-allow-methods'), /DELETE|PUT/);
  assert.equal((await pre('https://evil.example')).headers.get('access-control-allow-origin'), null); s.close();
});
test('H10 [D5] Authorization scheme is case-insensitive; query-string tokens and sloppy headers are not accepted', async () => {
  const s = await start();
  const t = await s.tokenFor('stu1');
  const get = (h, p = '/api/reports') => s.raw('GET', p, { headers: h });
  assert.equal((await get({ authorization: 'bearer ' + t })).status, 200);
  assert.equal((await get({ authorization: 'BEARER ' + t })).status, 200);
  assert.equal((await get({ authorization: 'Bearer  ' + t })).status, 401);
  assert.equal((await get({ authorization: t })).status, 401);
  assert.equal((await get({}, '/api/reports?access_token=' + t)).status, 401);
  assert.equal((await get({ authorization: 'Basic ' + Buffer.from('stu1:x').toString('base64') })).status, 401); s.close();
});
test('H11 [D2] accents and case are ignored when matching (Cafe vs Café, nino vs niño)', async () => {
  const s = await start({ clock: () => FIXED });
  const { tokens } = require('../src/matching');
  assert.deepEqual([...tokens('Niño CAFÉ')].sort(), [...tokens('nino cafe')].sort(), 'accent/case folding must make the token sets identical');
  assert.ok(tokens('key 3').has('3') && !tokens('key 3').has('7'), 'single digits are meaningful tokens');
  await s.call('POST', '/api/reports', { ...base, category: 'bag', description: 'Niño café backpack grey', location: 'Plaza Mayor' });
  const f = await s.call('POST', '/api/reports', { ...foundBase, category: 'bag', description: 'nino cafe backpack grey', location: 'plaza mayor' }, 'sec1');
  assert.equal(f.body.matches.length, 1, 'accented and unaccented spellings must match'); s.close();
});
test('H12 [D2] non-Latin descriptions are stored intact and different texts are NOT flagged as duplicates', async () => {
  const s = await start({ clock: () => FIXED });
  const a = await s.call('POST', '/api/reports', { ...base, category: 'wallet', description: '黒い革の財布 学生証入り' });
  const b = await s.call('POST', '/api/reports', { ...base, category: 'wallet', description: '赤い傘 図書館の前' });
  assert.equal(a.status, 201); assert.equal(b.status, 201, 'two different Japanese descriptions must not collide as duplicates');
  assert.equal(a.body.report.description, '黒い革の財布 学生証入り');
  const emoji = await s.call('POST', '/api/reports', { ...base, category: 'other', description: 'lucky charm 🍀 keychain' });
  assert.equal(emoji.status, 201); assert.equal(emoji.body.report.description, 'lucky charm 🍀 keychain'); s.close();
});

// ---------------- Reliability ----------------
test('H13 retry policy: exactly 3 attempts with 1000 ms then 2000 ms backoff, then manual queue', async () => {
  const store = new Store(null); const sleeps = []; let sends = 0;
  const n = { id: 'N-1', matchId: 'M-1', attempts: 0, status: 'queued' };
  await deliver(store, n, { channel: async () => { sends += 1; throw new Error('Gateway timeout'); }, sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(sends, POLICY.maxAttempts); assert.deepEqual(sleeps, [1000, 2000]);
  assert.equal(n.status, 'failed_permanent'); assert.equal(store.data.manualQueue.length, 1);
});
test('H14 identical concurrent submissions create exactly one report (duplicate control is race-free)', async () => {
  const s = await start({ clock: () => FIXED });
  const rs = await Promise.all(Array.from({ length: 6 }, () => s.call('POST', '/api/reports', { ...base, category: 'keys', description: 'silver keys blue tag' })));
  assert.equal(rs.filter((r) => r.status === 201).length, 1); assert.equal(rs.filter((r) => r.status === 409).length, 5);
  assert.equal(s.store.data.reports.length, 1); s.close();
});
test('H15 [D4] double-clicking Re-send does not deliver twice', async () => {
  let sends = 0;
  const delivery = { sleep: async () => {}, channel: async (n) => { if ((n.sim || 'ok') === 'permanent') throw Object.assign(new Error('mailbox unavailable'), { permanent: true }); sends += 1; await new Promise((r) => setTimeout(r, 40)); return { delivered: true }; } };
  const s = await start({ delivery, clock: () => FIXED });
  await s.call('POST', '/api/reports', base);
  await s.call('POST', '/api/reports', { ...foundBase, simulateDelivery: 'permanent' }, 'sec1');
  const q = s.store.data.manualQueue[0]; assert.ok(q); sends = 0;
  const rs = await Promise.all([1, 2, 3].map(() => s.call('POST', `/api/manual-queue/${q.id}/retry-notification`, {}, 'cust1')));
  assert.equal(sends, 1, 'the notification must be sent once');
  assert.equal(rs.filter((r) => r.status === 200).length, 1); assert.ok(rs.filter((r) => r.status !== 200).every((r) => [404, 409].includes(r.status))); s.close();
});
test('H16 [D3] a found item cannot be released to two different claimants', async () => {
  const s = await start({ clock: () => FIXED });
  const l1 = await s.call('POST', '/api/reports', base, 'stu1');
  const l2 = await s.call('POST', '/api/reports', { ...base, description: 'black leather wallet student card library' }, 'stu2');
  const f = await s.call('POST', '/api/reports', foundBase, 'sec1');
  assert.equal(f.body.matches.length, 2, 'both claimants become candidates');
  const [m1, m2] = f.body.matches;
  assert.equal((await s.call('POST', `/api/matches/${m1.id}/verify`, { ownershipConfirmed: true, note: 'ID card and contents checked' }, 'cust1')).status, 200);
  assert.equal((await s.call('POST', `/api/matches/${m2.id}/verify`, { ownershipConfirmed: true, note: 'ID card and contents checked' }, 'cust1')).status, 200);
  assert.equal((await s.call('POST', `/api/matches/${m1.id}/release`, {}, 'cust1')).status, 200);
  const second = await s.call('POST', `/api/matches/${m2.id}/release`, {}, 'cust1');
  assert.equal(second.status, 409, 'item already released to someone else');
  assert.equal(s.store.data.matches.find((m) => m.id === m1.id).releasedTo, 'stu1'); s.close();
});
test('H17 [D6] persistence is atomic: a failed write leaves the previous data file intact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-')); const file = path.join(dir, 'db.json');
  const st = new Store(file); st.data.reports.push({ id: 'R-0001' }); st.save();
  const good = fs.readFileSync(file, 'utf8');
  const realWrite = fs.writeFileSync;
  fs.writeFileSync = (p, data, ...rest) => { realWrite(p, String(data).slice(0, 10), ...rest); throw new Error('ENOSPC: no space left on device'); }; // partial write then crash
  try { st.data.reports.push({ id: 'R-0002' }); assert.throws(() => st.save(), /ENOSPC/); } finally { fs.writeFileSync = realWrite; }
  assert.equal(fs.readFileSync(file, 'utf8'), good, 'previous good file must survive a crash mid-write');
  assert.equal(new Store(file).data.reports.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
test('H18 [D6] persistence round-trip keeps ids monotonic; corrupt file falls back to last good backup or fails with a clear message', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-')); const file = path.join(dir, 'db.json');
  const st = new Store(file); const id1 = st.nextId('R'); st.save(); st.save();
  assert.equal(new Store(file).nextId('R'), 'R-0002', id1);
  fs.writeFileSync(file, '{"seq": 5, "reports": [');                               // corrupt
  const recovered = new Store(file);                                                // .bak from the 2nd save is valid
  assert.equal(recovered.data.seq, 1);
  fs.rmSync(file + '.bak'); fs.writeFileSync(file, 'not json');
  assert.throws(() => new Store(file), /corrupt|restore/i);
  fs.rmSync(dir, { recursive: true, force: true });
});
test('H19 error path: an unexpected failure returns a generic 500, leaks nothing, and the server stays up', async () => {
  const s = await start({ clock: () => FIXED }); log.clear();
  const realSave = s.store.commit; s.store.commit = async () => { throw new Error('disk full at C:\\secret\\path\\db.json'); };
  const r = await s.call('POST', '/api/reports', { ...base, category: 'books', description: 'failure path report' });
  s.store.commit = realSave;
  assert.equal(r.status, 500); assert.ok(!r.text.includes('secret')); assert.equal(r.body.error.message, 'Internal server error');
  assert.equal((await s.call('GET', '/health', null, null)).status, 200); s.close();
});
test('H20 robustness sweep: 60 hostile requests never cause a 5xx and the server stays healthy', async () => {
  const s = await start({ clock: () => FIXED });
  const tok = await s.tokenFor('cust1'); const auth = { authorization: 'Bearer ' + tok };
  const bodies = ['null', '[]', '"str"', '123', 'true', '{}', '{"type":null}', '{"__proto__":{"polluted":1}}', '{"constructor":{"prototype":{"x":1}}}', '\u0000', '{"a":'.repeat(200)];
  const paths = ['/api/reports', '/api/matches/M-0001/verify', '/api/manual-queue/MQ-0001/resolve', '/api/jobs/aging', '/api/auth/login'];
  let bad = 0;
  for (const p of paths) for (const b of bodies) { const r = await s.raw('POST', p, { rawBody: b, headers: auth }); if (r.status >= 500) { bad += 1; console.error('5xx', p, b.slice(0, 20), r.status); } }
  for (const q of ['n=abc', 'n=-1', 'n=1e99', 'n=%00']) { const r = await s.raw('GET', '/api/logs?' + q, { headers: auth }); if (r.status >= 500) bad += 1; }
  assert.equal(bad, 0); assert.equal(({}).polluted, undefined); assert.equal((await s.raw('GET', '/health')).status, 200); s.close();
});
test('H21 [D7] login-failure tracking and token revocation lists are bounded (no memory growth under attack)', async () => {
  const config = loadConfig({ JWT_SECRET: 'z'.repeat(40), MAX_TRACKED_LOGINS: '20' }, () => {});
  const auth = createAuth(config, new Map());
  for (let i = 0; i < 80; i++) await auth.login('ghost' + i, 'whatever-password');
  assert.ok(auth._failures.size <= 20, `tracked ${auth._failures.size} identities, cap is 20`);
  const old = Math.floor(Date.now() / 1000) - 3600;
  for (let i = 0; i < 50; i++) auth.revoke({ id: 'u', jti: 'old' + i, exp: old });
  auth.revoke({ id: 'u', jti: 'fresh', exp: Math.floor(Date.now() / 1000) + 600 });
  assert.ok(auth._revokedSize() <= 2, `expired revocations must be purged, size ${auth._revokedSize()}`);
});

// ---------------- Authorization / integrity ----------------
test('H22 [D8] separation of duties: staff cannot verify or release a match for their own report', async () => {
  const s = await start({ clock: () => FIXED });
  await s.call('POST', '/api/reports', base, 'sec1');                        // security officer lost a wallet
  const f = await s.call('POST', '/api/reports', foundBase, 'cust1');        // custodian logs a found wallet
  const m = f.body.matches[0]; assert.ok(m);
  const own = await s.call('POST', `/api/matches/${m.id}/verify`, { ownershipConfirmed: true, note: 'ID card and contents checked' }, 'sec1');
  assert.equal(own.status, 403); assert.equal(own.body.error.code, 'CONFLICT_OF_INTEREST');
  assert.equal((await s.call('POST', `/api/matches/${m.id}/verify`, { ownershipConfirmed: true, note: 'ID card and contents checked' }, 'cust1')).status, 200);
  assert.equal((await s.call('POST', `/api/matches/${m.id}/release`, {}, 'sec1')).status, 403, 'claimant-staff cannot release either');
  assert.equal((await s.call('POST', `/api/matches/${m.id}/release`, {}, 'cust1')).status, 200); s.close();
});

// ---------------- Integration / end-to-end ----------------
test('H23 end-to-end across roles: lost -> found -> notify -> verify -> release -> closed, with audit trail', async () => {
  const s = await start({ clock: () => FIXED });
  const lost = await s.call('POST', '/api/reports', base, 'stu1');
  const found = await s.call('POST', '/api/reports', foundBase, 'sec1');
  const m = found.body.matches[0];
  const n = (await s.call('GET', '/api/notifications', null, 'stu1')).body;
  assert.equal(n.length, 1); assert.equal(n[0].status, 'delivered');
  assert.equal((await s.call('GET', '/api/matches', null, 'stu1')).body[0].status, 'candidate');
  assert.equal((await s.call('POST', `/api/matches/${m.id}/verify`, { ownershipConfirmed: true, note: 'ID card matched' }, 'cust1')).body.status, 'verified');
  assert.equal((await s.call('POST', `/api/matches/${m.id}/release`, {}, 'cust1')).body.status, 'released');
  assert.equal((await s.call('GET', '/api/matches', null, 'stu1')).body[0].status, 'released');
  assert.equal((await s.call('GET', `/api/reports/${lost.body.report.id}`, null, 'stu1')).body.status, 'closed');
  const actions = (await s.call('GET', '/api/audit', null, 'cust1')).body.map((a) => a.action);
  for (const a of ['report.created', 'match.verified', 'match.released']) assert.ok(actions.includes(a), a);
  // closed reports are never matched again
  const again = await s.call('POST', '/api/reports', { ...foundBase, description: 'black leather wallet student card second' }, 'sec1');
  assert.equal(again.body.matches.length, 0); s.close();
});
test('H24 aging job is idempotent and ignores closed/disposed reports', async () => {
  const s = await start({ clock: () => FIXED });
  await s.call('POST', '/api/reports', { ...foundBase, category: 'keys', description: 'silver keys blue tag' }, 'sec1');
  const f2 = await s.call('POST', '/api/reports', { ...foundBase, category: 'bag', description: 'grey backpack zipper' }, 'sec1');
  s.store.data.reports.find((r) => r.id === f2.body.report.id).status = 'closed';
  const later = new Date(Date.now() + 100 * 86400000).toISOString();
  const first = (await s.call('POST', '/api/jobs/aging', { now: later }, 'cust1')).body;
  const second = (await s.call('POST', '/api/jobs/aging', { now: later }, 'cust1')).body;
  assert.equal(first.disposalFlagged.length, 1); assert.equal(second.disposalFlagged.length, 0); assert.equal(second.reminded.length, 0);
  assert.equal(s.store.data.manualQueue.filter((q) => q.kind === 'disposal_review').length, 1); s.close();
});
test('H25 disposal review flow: aging flags -> custodian disposes -> report disposed; double-resolve 409; unknown id 404', async () => {
  const s = await start({ clock: () => FIXED });
  const f = await s.call('POST', '/api/reports', { ...foundBase, category: 'keys', description: 'silver keys blue tag' }, 'sec1');
  const later = new Date(Date.now() + 100 * 86400000).toISOString();
  await s.call('POST', '/api/jobs/aging', { now: later }, 'cust1');
  const item = s.store.data.manualQueue.find((q) => q.kind === 'disposal_review'); assert.ok(item);
  const ok = await s.call('POST', `/api/manual-queue/${item.id}/resolve`, { resolution: 'Donated to charity\u0000', dispose: true }, 'cust1');
  assert.equal(ok.status, 200); assert.equal(ok.body.status, 'resolved'); assert.ok(!ok.body.resolution.includes('\u0000'));
  assert.equal(s.store.data.reports.find((r) => r.id === f.body.report.id).status, 'disposed');
  assert.equal((await s.call('POST', `/api/manual-queue/${item.id}/resolve`, { dispose: true }, 'cust1')).status, 409);
  assert.equal((await s.call('POST', '/api/manual-queue/MQ-9999/resolve', {}, 'cust1')).status, 404);
  const matchesAfter = await s.call('POST', '/api/reports', { ...base, category: 'keys', description: 'silver keys blue tag' }, 'stu1');
  assert.equal(matchesAfter.body.matches.length, 0, 'disposed items are never matched'); s.close();
});
