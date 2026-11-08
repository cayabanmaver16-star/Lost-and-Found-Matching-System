'use strict';
// Narrated end-to-end run of the whole story against a REAL server process (fresh data). Two uses:
//   1. PREFLIGHT / REHEARSAL: node demo/rehearse.js            -> exits 1 if anything does not behave as the demo script promises
//   2. PREPARED FALLBACK if the browser UI fails during the defence:
//        node demo/rehearse.js --pace 2500                     pauses 2.5 s after each step so you can talk over it
//        node demo/rehearse.js --step                          waits for Enter after each step
//        node demo/rehearse.js --from 9 --to 9                 shows only step 9 (earlier steps still run silently, later ones depend on them)
//        node demo/rehearse.js --save docs/w18/fallback-transcript.txt
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const lib = require('../perf/lib');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const FROM = parseInt(opt('from', '1'), 10); const TO = parseInt(opt('to', '999'), 10); let muted = false;
const PACE = parseInt(opt('pace', '0'), 10); const STEP = argv.includes('--step'); const SAVE = opt('save', null);
const out = []; const say = (s = '') => { out.push(s); if (!muted) console.log(s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ask = () => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question('   (press Enter for the next step) ', () => { rl.close(); res(); }); });

let n = 0; let failures = 0; let checks = 0; const timings = [];
const day = (d = 0) => lib.dayAgo(d);
async function step(title, talk, fn) {
  n += 1; const t0 = Date.now(); muted = n < FROM || n > TO;
  say(`\n[${String(n).padStart(2, '0')}] ${title}`); say(`     say: ${talk}`);
  await fn();
  timings.push([title, Date.now() - t0]);
  if (!muted) { if (STEP) await ask(); else if (PACE) await sleep(PACE); }
}
function check(label, ok, detail = '') { checks += 1; if (!ok) failures += 1; say(`     ${ok ? '[ok]  ' : '[FAIL]'} ${label}${detail ? '  ->  ' + detail : ''}`); }

(async () => {
  const dir = path.join(lib.WORK, 'rehearse'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const dataFile = path.join(dir, 'db.json');
  const env = { ALLOW_SIM: '1', LOGIN_MAX_FAILURES: '5', LOGIN_IP_MAX: '100', RATE_LIMIT_PER_MIN: '1000' };
  let srv = await lib.startServer({ label: 'rehearse', dataFile, extraEnv: env });
  const B = () => srv.base;
  const tok = {}; const api = (who, m, p, body) => lib.call(B(), m, p, { token: who && tok[who], body });
  const started = Date.now();
  say('LOST & FOUND - narrated run (fresh data, real server process, fictional accounts)');
  say(`API: ${srv.base}   data file: ${dataFile}`);

  await step('Platform is alive and describes itself', 'Liveness and readiness are separate probes; the API publishes its own contract.', async () => {
    const h = await api(null, 'GET', '/health'); const r = await api(null, 'GET', '/ready'); const o = await api(null, 'GET', '/api/openapi.json');
    check('GET /health', h.status === 200, JSON.stringify(h.body)); check('GET /ready', r.status === 200, JSON.stringify(r.body));
    check('GET /api/openapi.json', o.status === 200 && Object.keys(o.body.paths).length >= 18, `${Object.keys(o.body.paths).length} paths, version ${o.body.info.version}`);
  });

  await step('Sign in (and a wrong password)', 'Tokens are short-lived and signed; a wrong password and an unknown user get the same answer, so nobody can probe for accounts.', async () => {
    const wrong = await lib.call(B(), 'POST', '/api/auth/login', { body: { userId: 'stu1', password: 'not-the-password' } });
    const ghost = await lib.call(B(), 'POST', '/api/auth/login', { body: { userId: 'nobody', password: 'not-the-password' } });
    check('wrong password -> 401', wrong.status === 401, wrong.body.error.message); check('unknown user -> identical message', ghost.status === 401 && ghost.body.error.message === wrong.body.error.message);
    for (const id of ['stu1', 'stu2', 'emp1', 'sec1', 'cust1']) tok[id] = await lib.login(B(), id);
    check('five test accounts signed in', Object.keys(tok).length === 5);
  });

  let lostId; let matchId;
  await step('A student reports a lost wallet (validation first)', 'The server validates everything; the client checks are only a convenience.', async () => {
    const bad = await api('stu1', 'POST', '/api/reports', { type: 'lost', category: 'wallet', description: 'x', location: '', eventDate: day(0) });
    check('empty/short fields -> 422 with field messages', bad.status === 422 && bad.body.error.details.description && bad.body.error.details.location, Object.keys(bad.body.error.details || {}).join(', '));
    const impossible = await api('stu1', 'POST', '/api/reports', { type: 'lost', category: 'wallet', description: 'black leather wallet', location: 'library', eventDate: '2026-02-30' });
    check('impossible date 2026-02-30 -> 422', impossible.status === 422);
    const ok = await api('stu1', 'POST', '/api/reports', { type: 'lost', category: 'wallet', description: 'black leather wallet with student card and a red sticker', location: 'library second floor', eventDate: day(1) });
    lostId = ok.body.report && ok.body.report.id;
    check('valid report accepted -> 201', ok.status === 201, `${lostId}, no match yet: ${ok.body.matches.length === 0}`);
    const dup = await api('stu1', 'POST', '/api/reports', { type: 'lost', category: 'wallet', description: 'Black LEATHER wallet, with student card and a red sticker!', location: 'library second floor', eventDate: day(1) });
    check('same report again -> 409 duplicate, names the original', dup.status === 409 && dup.body.error.details.existingId === lostId, dup.body.error.code);
  });

  await step('Security officer reports the found wallet: automatic match and notification', 'Matching runs when the report arrives; the owner is told, with retries if delivery fails.', async () => {
    const f = await api('sec1', 'POST', '/api/reports', { type: 'found', category: 'wallet', description: 'black leather wallet, student card inside, red sticker on back', location: 'library 2nd floor study desk', eventDate: day(0) });
    matchId = f.body.matches && f.body.matches[0] && f.body.matches[0].id;
    check('one candidate match created', f.status === 201 && f.body.matches.length === 1, `${matchId} score ${f.body.matches[0] && f.body.matches[0].score}`);
    const n1 = await api('stu1', 'GET', '/api/notifications');
    check('owner has a delivered notification', n1.body.length === 1 && n1.body[0].status === 'delivered', `${n1.body[0].kind}, attempts ${n1.body[0].attempts}`);
  });

  await step('What the owner can and cannot see', 'Data minimisation: the owner sees their own item and the outcome, never the finder or the found item.', async () => {
    const m = await api('stu1', 'GET', '/api/matches');
    check('owner sees own item summary', m.body[0].lost && m.body[0].lost.description.includes('red sticker'));
    check('no found-item id, details, finder or verifier', m.body[0].found === undefined && m.body[0].foundId === undefined && !JSON.stringify(m.body[0]).includes('sec1'));
    const other = await api('stu2', 'GET', `/api/reports/${lostId}`);
    check("another student cannot open the owner's report -> 404 (existence not revealed)", other.status === 404);
  });

  await step('Custodian reviews, then verifies with a recorded proof', 'A human decides, sees both items, and must write down the proof. Staff cannot decide their own item.', async () => {
    const staff = await api('cust1', 'GET', '/api/matches');
    check('custodian sees BOTH items side by side', staff.body[0].lost.description && staff.body[0].found.description, `${staff.body[0].lost.reporterId} vs ${staff.body[0].found.reporterId}`);
    const noNote = await api('cust1', 'POST', `/api/matches/${matchId}/verify`, { ownershipConfirmed: true });
    check('verify without a note -> 422', noNote.status === 422 && noNote.body.error.details.note);
    const early = await api('cust1', 'POST', `/api/matches/${matchId}/release`, {});
    check('release before verification -> 409', early.status === 409, early.body.error.code);
    const student = await api('stu1', 'POST', `/api/matches/${matchId}/verify`, { ownershipConfirmed: true, note: 'I say it is mine' });
    check('a student cannot verify -> 403', student.status === 403);
    const v = await api('cust1', 'POST', `/api/matches/${matchId}/verify`, { ownershipConfirmed: true, note: 'Student ID matched; described the red sticker on the back' });
    check('verified with proof recorded', v.status === 200 && v.body.status === 'verified' && v.body.note.includes('red sticker'));
    const rel = await api('cust1', 'POST', `/api/matches/${matchId}/release`, {});
    check('released to the owner; both reports closed', rel.status === 200 && rel.body.releasedTo === 'stu1');
    const closed = await api('stu1', 'GET', `/api/reports/${lostId}`);
    check("owner's report is closed", closed.body.status === 'closed');
  });

  let queueId;
  await step('A notification that cannot be delivered reaches a human', 'Failures are bounded and visible: three attempts, then a person fixes it and re-sends.', async () => {
    await api('stu2', 'POST', '/api/reports', { type: 'lost', category: 'keys', description: 'silver house keys with blue tag', location: 'gym lockers', eventDate: day(2) });
    await api('sec1', 'POST', '/api/reports', { type: 'found', category: 'keys', description: 'silver house keys blue tag', location: 'gym lockers', eventDate: day(0), simulateDelivery: 'permanent' });
    const q = (await api('cust1', 'GET', '/api/manual-queue')).body.find((x) => x.kind === 'notification_failure');
    queueId = q && q.id; check('failure is in the manual queue with a reason', !!q && q.status === 'open', q && q.reason);
    const rs = await api('cust1', 'POST', `/api/manual-queue/${queueId}/retry-notification`, {});
    check('custodian re-sends -> delivered, item resolved', rs.status === 200 && rs.body.notification.status === 'delivered' && rs.body.queueItem.status === 'resolved');
    const again = await api('cust1', 'POST', `/api/manual-queue/${queueId}/retry-notification`, {});
    check('a second re-send is refused (no double delivery)', again.status === 404 || again.status === 409, String(again.status));
  });

  await step('A temporary delivery problem repairs itself', 'Transient failures are retried with 1 s then 2 s backoff, with no human involved.', async () => {
    await api('emp1', 'POST', '/api/reports', { type: 'lost', category: 'electronics', description: 'blue phone case with cracked corner', location: 'lab 3', eventDate: day(1) });
    const t0 = Date.now();
    const f = await api('sec1', 'POST', '/api/reports', { type: 'found', category: 'electronics', description: 'blue phone case cracked corner', location: 'lab 3', eventDate: day(0), simulateDelivery: 'transient' });
    const nn = (await api('cust1', 'GET', '/api/notifications')).body.find((x) => x.matchId === f.body.matches[0].id);
    check('delivered on the third attempt', nn.status === 'delivered' && nn.attempts === 3, `${nn.attempts} attempts, request took ${((Date.now() - t0) / 1000).toFixed(1)} s (this is why delivery moves out of the request before a real gateway)`);
  });

  await step('Security: forged, expired and unauthorised', 'Role comes only from the signed token; every attack here is refused and none of them changes anything.', async () => {
    const [h, , s] = tok.stu1.split('.'); const body = JSON.parse(Buffer.from(tok.stu1.split('.')[1], 'base64url').toString());
    const forged = [h, Buffer.from(JSON.stringify({ ...body, role: 'custodian' })).toString('base64url'), s].join('.');
    const f = await lib.call(B(), 'GET', '/api/manual-queue', { token: forged }); check('token with role changed to custodian -> 401', f.status === 401);
    const none = await lib.call(B(), 'GET', '/api/reports'); check('no token -> 401', none.status === 401);
    const stu = await api('stu1', 'GET', '/api/manual-queue'); check('student on a staff endpoint -> 403', stu.status === 403);
    for (let i = 0; i < 5; i++) await lib.call(B(), 'POST', '/api/auth/login', { body: { userId: 'emp1', password: 'wrong' + i } });
    const locked = await lib.call(B(), 'POST', '/api/auth/login', { body: { userId: 'emp1', password: lib.pw('emp1') } });
    check('5 failed logins lock the account, even for the right password -> 429', locked.status === 429, locked.body.error.code);
    await lib.call(B(), 'POST', '/api/auth/logout', { token: tok.sec1, body: {} });
    const after = await api('sec1', 'GET', '/api/reports'); check('signed-out token is refused (revocation)', after.status === 401); tok.sec1 = await lib.login(B(), 'sec1');
  });

  await step('Operations: metrics, audit trail and the aging job', 'The system watches itself; every state change is audited; unclaimed items escalate once.', async () => {
    const m = await api('cust1', 'GET', '/api/metrics'); const top = m.body.routes[0];
    check('metrics: counts, latency percentiles, event-loop delay', m.status === 200 && m.body.requests.total > 20 && m.body.eventLoop.p99Ms >= 0, `${m.body.requests.total} requests, busiest route ${top.route} p95 ${top.p95Ms} ms, loop p99 ${m.body.eventLoop.p99Ms} ms`);
    const stuM = await api('stu1', 'GET', '/api/metrics'); check('metrics are staff-only -> 403 for a student', stuM.status === 403);
    const a = await api('cust1', 'GET', '/api/audit'); const acts = new Set(a.body.map((x) => x.action));
    check('audit trail covers create, verify, release', ['report.created', 'match.verified', 'match.released'].every((x) => acts.has(x)), `${a.body.length} entries`);
    const d = (k) => new Date(Date.now() + k * 86400000).toISOString();
    const r31 = await api('cust1', 'POST', '/api/jobs/aging', { now: d(31) }); const r31b = await api('cust1', 'POST', '/api/jobs/aging', { now: d(32) });
    check('30-day reminder raised once, not twice', r31.body.reminded.length >= 1 && r31b.body.reminded.length === 0, `${r31.body.reminded.length} then ${r31b.body.reminded.length}`);
    const r91 = await api('cust1', 'POST', '/api/jobs/aging', { now: d(91) });
    check('90-day disposal review appears for staff', r91.body.disposalFlagged.length >= 1, `${r91.body.disposalFlagged.length} item(s)`);
  });

  await step('Durability: hard-kill the server, restart, nothing acknowledged is lost', 'A response is sent only after the data is on disk, so a crash cannot lose what a user was told succeeded.', async () => {
    const created = []; for (let i = 0; i < 6; i++) { const r = await api('stu1', 'POST', '/api/reports', { type: 'lost', category: 'other', description: `durability probe item ${i} ${Math.random().toString(36).slice(2, 7)}`, location: 'quad', eventDate: day(0) }); created.push(r.body.report.id); }
    srv.child.kill(); await new Promise((r) => (srv.exited ? r() : srv.child.on('exit', r)));
    const t0 = Date.now(); srv = await lib.startServer({ label: 'rehearse2', dataFile, extraEnv: env });
    const ms = Date.now() - t0; const t = await lib.login(B(), 'cust1');
    const all = (await lib.call(B(), 'GET', '/api/reports?limit=500', { token: t })).body.map((r) => r.id);
    check('server restarted and is ready', true, `${ms} ms`); check('all acknowledged reports are still there', created.every((id) => all.includes(id)), `${created.length} of ${created.length}`);
    check('earlier verified/released case survived too', (await lib.call(B(), 'GET', '/api/matches', { token: t })).body.some((m) => m.status === 'released'));
  });

  await lib.stopServer(srv);
  muted = false;
  say(`\nSummary: ${checks - failures} of ${checks} checks passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  say('Step timings: ' + timings.map(([t, ms]) => `${t.split(':')[0].slice(0, 28)} ${ms} ms`).join(' | '));
  if (SAVE) { fs.mkdirSync(path.dirname(path.resolve(SAVE)), { recursive: true }); fs.writeFileSync(SAVE, out.join('\n') + '\n'); }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('Run failed:', e); process.exit(1); });
