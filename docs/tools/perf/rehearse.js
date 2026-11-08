'use strict';
// Recovery and rollback rehearsals against REAL server processes (hard kills, corrupted files, a bad release).
// Usage: node perf/rehearse.js   -> docs/w16/rehearsal-results.json + console transcript
const fs = require('fs');
const path = require('path');
const lib = require('./lib');
const { performance } = require('perf_hooks');

const OUT = path.join(lib.ROOT, 'docs', 'w16');
fs.mkdirSync(OUT, { recursive: true });
const results = { startedAt: new Date().toISOString(), rehearsals: {} };
const say = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readDb = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const save = () => fs.writeFileSync(path.join(OUT, 'rehearsal-results.json'), JSON.stringify(results, null, 2));

async function killHard(srv) { srv.child.kill(); await new Promise((r) => { if (srv.exited) return r(); srv.child.on('exit', r); }); }

// ---------- R1: hard crash during write load ----------
async function r1() {
  say('\n== R1 hard crash (process killed mid-write-load) ==');
  const work = path.join(lib.WORK, 'r1'); fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const dataFile = path.join(work, 'db.json'); fs.writeFileSync(dataFile, JSON.stringify(lib.makeDb(2000)));
  let srv = await lib.startServer({ label: 'r1', dataFile });
  const tokens = await lib.tokensFor(srv.base);
  const acked = new Set(); let stop = false; let inflightAtKill = 0;
  const writers = Array.from({ length: 8 }, (_, w) => (async () => {
    while (!stop) {
      inflightAtKill += 1;
      const r = await lib.call(srv.base, 'POST', '/api/reports', { token: tokens[['stu1', 'stu2', 'emp1'][w % 3]], body: { type: 'lost', category: lib.pick(lib.CATEGORIES), description: lib.words(4) + ' w' + w + ' ' + Math.random().toString(36).slice(2, 8), location: lib.pick(lib.PLACES), eventDate: lib.dayAgo(1) }, timeoutMs: 5000 });
      inflightAtKill -= 1;
      if (r.status === 201) acked.add(r.body.report.id);
    }
  })());
  await sleep(4000);
  const tKill = performance.now(); await killHard(srv); say(`killed server after ${acked.size} acknowledged writes`);
  stop = true; await Promise.all(writers);
  const leftoverTmp = fs.existsSync(dataFile + '.tmp');
  let parsed = true, db; try { db = readDb(dataFile); } catch { parsed = false; }
  const ids = db ? db.reports.map((r) => r.id) : [];
  const missing = [...acked].filter((id) => !ids.includes(id));
  const dupIds = ids.length - new Set(ids).size;
  const t0 = performance.now(); srv = await lib.startServer({ label: 'r1b', dataFile }); const rtoMs = Math.round(performance.now() - t0);
  const tokens2 = await lib.tokensFor(srv.base);
  const probe = await lib.call(srv.base, 'POST', '/api/reports', { token: tokens2.stu1, body: { type: 'lost', category: 'books', description: 'post-crash probe report ' + Date.now(), location: 'library', eventDate: lib.dayAgo(0) } });
  const idsAfter = readDb(dataFile).reports.map((r) => r.id);
  await lib.stopServer(srv);
  results.rehearsals.crashRecovery = { acknowledgedWrites: acked.size, fileParsedAfterKill: parsed, acknowledgedMissing: missing.length, duplicateIds: dupIds, leftoverTempFile: leftoverTmp, restartToReadyMs: rtoMs, postCrashWriteStatus: probe.status, postCrashIdUnique: !idsAfter.slice(0, -1).includes(probe.body && probe.body.report.id), totalReportsBefore: 2000, totalReportsAfterRestart: idsAfter.length };
  say(JSON.stringify(results.rehearsals.crashRecovery)); save();
}

// ---------- R2: corruption and backup recovery ----------
async function r2() {
  say('\n== R2 data-file corruption ==');
  const work = path.join(lib.WORK, 'r2'); fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const dataFile = path.join(work, 'db.json'); fs.writeFileSync(dataFile, JSON.stringify(lib.makeDb(500)));
  let srv = await lib.startServer({ label: 'r2', dataFile });
  const tokens = await lib.tokensFor(srv.base);
  for (let i = 0; i < 20; i++) await lib.call(srv.base, 'POST', '/api/reports', { token: tokens.stu1, body: { type: 'lost', category: 'books', description: 'backup test item ' + i + ' ' + lib.words(2), location: 'library', eventDate: lib.dayAgo(0) } });
  const countBefore = readDb(dataFile).reports.length;
  await killHard(srv);
  const full = fs.readFileSync(dataFile); fs.writeFileSync(dataFile, full.subarray(0, Math.floor(full.length / 2))); // truncate: simulates disk fault
  const t0 = performance.now(); srv = await lib.startServer({ label: 'r2b', dataFile }); const rto = Math.round(performance.now() - t0);
  const t2 = await lib.tokensFor(srv.base);
  const list = await lib.call(srv.base, 'GET', '/api/reports?limit=500', { token: t2.cust1 });
  const logs = (await lib.call(srv.base, 'GET', '/api/logs?n=200', { token: t2.cust1 })).body || [];
  const recovered = logs.some((l) => l.event === 'store.recovered_from_backup');
  await lib.stopServer(srv);
  const countAfter = readDb(dataFile + '.bak').reports.length;
  // both files corrupt -> must refuse to start with a clear message
  fs.writeFileSync(dataFile, 'garbage'); fs.writeFileSync(dataFile + '.bak', 'garbage');
  let refused = null;
  try { const s = await lib.startServer({ label: 'r2c', dataFile }); await lib.stopServer(s); refused = false; } catch (e) { refused = true; }
  const msg = fs.readdirSync(lib.WORK).filter((f) => f.startsWith('r2c-') && f.endsWith('.log')).map((f) => fs.readFileSync(path.join(lib.WORK, f), 'utf8')).join('\n').split('\n').find((l) => /^Error: Data file/.test(l)) || '';
  results.rehearsals.corruption = { reportsBeforeCorruption: countBefore, recoveredFromBackup: recovered, reportsServedAfterRecovery: Array.isArray(list.body) ? list.body.length : null, restartToReadyMs: rto, reportsLostApprox: countBefore - countAfter, bothFilesCorruptRefusesToStart: refused, refusalMessage: msg.slice(0, 220) };
  say(JSON.stringify(results.rehearsals.corruption)); save();
}

// ---------- R3: bad release, health-gated deploy with automatic rollback ----------
function copyRelease(from, to, mutate) {
  fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true });
  for (const d of ['src', 'seed']) fs.cpSync(path.join(from, d), path.join(to, d), { recursive: true });
  fs.copyFileSync(path.join(from, 'package.json'), path.join(to, 'package.json'));
  fs.symlinkSync(path.join(from, 'node_modules'), path.join(to, 'node_modules'), 'junction');
  if (mutate) mutate(to);
}
async function gate(srv) {   // deploy gate: readiness + login + one authenticated read
  const t0 = performance.now();
  await lib.waitReady(srv.base, 10000, srv);
  const t = await lib.login(srv.base, 'cust1');
  const r = await lib.call(srv.base, 'GET', '/api/reports?limit=5', { token: t });
  if (r.status !== 200) throw new Error(`smoke test failed: GET /api/reports -> ${r.status}`);
  return Math.round(performance.now() - t0);
}
async function deploy({ current, candidate, dataFile, candEnv = {}, candRemove = [] }) {
  const t0 = performance.now(); const tl = [];
  const mark = (m) => tl.push({ tMs: Math.round(performance.now() - t0), event: m });
  await killHard(current.srv); mark(`stop ${current.name}`);
  let cand;
  try {
    cand = await lib.startServer({ label: 'cand', apiDir: candidate.dir, dataFile, extraEnv: candEnv, removeEnv: candRemove, production: !!candEnv.NODE_ENV });
    mark(`start ${candidate.name}`); const g = await gate(cand); mark(`gate passed in ${g} ms`);
    return { ok: true, srv: cand, timeline: tl, downtimeMs: Math.round(performance.now() - t0) };
  } catch (e) {
    mark(`gate FAILED for ${candidate.name}: ${e.message}`);
    if (cand && !cand.exited) await killHard(cand);
    const back = await lib.startServer({ label: 'rollback', apiDir: current.dir, dataFile }); mark(`rollback: restarted ${current.name}`);
    const g = await gate(back); mark(`rollback gate passed in ${g} ms`);
    return { ok: false, srv: back, timeline: tl, downtimeMs: Math.round(performance.now() - t0), error: e.message };
  }
}
async function r3() {
  say('\n== R3 bad release -> automatic rollback ==');
  const rel = path.join(lib.WORK, 'releases'); fs.rmSync(rel, { recursive: true, force: true });
  const v1 = path.join(rel, 'v1'), vBug = path.join(rel, 'v2-bug'), vCfg = path.join(rel, 'v2-config');
  copyRelease(lib.API, v1);
  copyRelease(lib.API, vBug, (to) => { // regression: list endpoint crashes
    const f = path.join(to, 'src', 'app.js'); let t = fs.readFileSync(f, 'utf8');
    t = t.replace("app.get('/api/reports', need(), (req, res) => {", "app.get('/api/reports', need(), (req, res) => {\n    throw new Error('injected regression');");
    fs.writeFileSync(f, t);
  });
  copyRelease(lib.API, vCfg);
  const work = path.join(lib.WORK, 'r3'); fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const dataFile = path.join(work, 'db.json'); fs.writeFileSync(dataFile, JSON.stringify(lib.makeDb(1000)));
  let current = { name: 'v1', dir: v1, srv: await lib.startServer({ label: 'v1', apiDir: v1, dataFile }) };
  const before = readDb(dataFile).reports.length;
  const out = {};
  // (a) release with a code regression: passes readiness, fails the smoke test
  let d = await deploy({ current, candidate: { name: 'v2-bug', dir: vBug }, dataFile });
  out.codeRegression = { rolledBack: !d.ok, downtimeMs: d.downtimeMs, timeline: d.timeline, reason: d.error };
  say('(a) code regression: ' + JSON.stringify(out.codeRegression)); current = { name: 'v1', dir: v1, srv: d.srv };
  // (b) release started in production mode without its secret: refuses to start
  d = await deploy({ current, candidate: { name: 'v2-config', dir: vCfg }, dataFile, candEnv: { NODE_ENV: 'production', JWT_SECRET: '' }, candRemove: ['JWT_SECRET'] });
  out.configError = { rolledBack: !d.ok, downtimeMs: d.downtimeMs, timeline: d.timeline, reason: d.error };
  say('(b) missing production secret: ' + JSON.stringify(out.configError)); current = { name: 'v1', dir: v1, srv: d.srv };
  // (c) good release goes through
  copyRelease(lib.API, path.join(rel, 'v2-good'));
  d = await deploy({ current, candidate: { name: 'v2-good', dir: path.join(rel, 'v2-good') }, dataFile });
  out.goodRelease = { deployed: d.ok, downtimeMs: d.downtimeMs, timeline: d.timeline };
  say('(c) good release: ' + JSON.stringify(out.goodRelease));
  await lib.stopServer(d.srv);
  out.dataIntact = { reportsBefore: before, reportsAfter: readDb(dataFile).reports.length };
  results.rehearsals.rollback = out; save();
}

(async () => {
  await r1(); await r2(); await r3();
  results.finishedAt = new Date().toISOString(); save(); say('\nsaved docs/w16/rehearsal-results.json');
})().catch((e) => { console.error('rehearsal failed:', e); process.exit(1); });
