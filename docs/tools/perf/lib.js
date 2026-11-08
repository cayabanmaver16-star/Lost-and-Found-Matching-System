'use strict';
// Performance harness: starts the API as a separate OS process, drives a closed-loop workload, samples server metrics.
// Everything runs on one machine, so the load generator competes with the server for CPU: results are conservative.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const ROOT = path.join(__dirname, '..');
const API = path.join(ROOT, 'api');
const WORK = path.join(__dirname, 'work');
const seedUsers = JSON.parse(fs.readFileSync(path.join(API, 'seed', 'demo-users.json'), 'utf8')).users;
const pw = (id) => seedUsers.find((u) => u.id === id).password;

const CATEGORIES = ['electronics', 'wallet', 'keys', 'bag', 'clothing', 'id-card', 'books', 'other'];
const WORDS = ('black white red blue green grey brown silver gold leather plastic metal small large old new cracked striped logo sticker chain ' +
  'zipper case cover charger phone laptop watch ring card badge scarf jacket umbrella bottle notebook textbook calculator earbuds helmet cap').split(' ');
const PLACES = ['library', 'gym', 'cafeteria', 'main gate', 'room 101', 'room 204', 'chapel', 'parking lot', 'lab 3', 'admin office', 'quadrangle', 'bus stop'];
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const words = (n) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
const dayAgo = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

function pctile(sorted, q) { if (!sorted.length) return 0; return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)]; }
function summarise(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return { n: s.length, p50: +pctile(s, 0.5).toFixed(1), p95: +pctile(s, 0.95).toFixed(1), p99: +pctile(s, 0.99).toFixed(1), max: +(s[s.length - 1] || 0).toFixed(1), mean: +(s.reduce((a, b) => a + b, 0) / (s.length || 1)).toFixed(1) };
}

// ---------- seed data (written directly to the data file so large datasets load instantly) ----------
function makeDb(nReports) {
  const reports = [];
  for (let i = 1; i <= nReports; i++) {
    reports.push({
      id: `R-${String(i).padStart(4, '0')}`, type: i % 2 ? 'lost' : 'found', category: pick(CATEGORIES),
      description: `${words(4)} seed${i}`, location: pick(PLACES), eventDate: dayAgo(rnd(60)),
      reporterId: pick(['stu1', 'stu2', 'emp1']), status: i % 10 === 0 ? 'closed' : 'open',
      createdAt: new Date(Date.now() - rnd(60) * 86400000).toISOString(), remindedAt: null, disposalFlagged: false,
    });
  }
  return { seq: nReports, reports, matches: [], notifications: [], manualQueue: [], audit: [] };
}

// ---------- server process ----------
async function startServer({ label, https = false, production = false, dataReports = 0, extraEnv = {}, apiDir = API, port, dataFile: givenDataFile, removeEnv = [] }) {
  fs.mkdirSync(WORK, { recursive: true });
  const id = `${label}-${crypto.randomBytes(3).toString('hex')}`;
  const dataFile = givenDataFile || path.join(WORK, `${id}.json`);
  if (!givenDataFile && dataReports > 0) fs.writeFileSync(dataFile, JSON.stringify(makeDb(dataReports)));
  const logFile = path.join(WORK, `${id}.log`);
  const out = fs.openSync(logFile, 'a');
  port = port || 7000 + rnd(2000); // avoid ports on the fetch standard blocked-port list (e.g. 5060/5061)
  const env = {
    ...process.env, PORT: String(port), DATA_FILE: dataFile, JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    RATE_LIMIT_PER_MIN: '10000000', LOGIN_IP_MAX: '10000000', LOGIN_MAX_FAILURES: '1000000',
    NODE_ENV: production ? 'production' : 'development',
    ...(https ? { TLS_KEY_FILE: path.join(API, 'certs', 'dev-key.pem'), TLS_CERT_FILE: path.join(API, 'certs', 'dev-cert.pem') } : {}),
    ...(production && !https ? { TRUST_PROXY_TLS: '1' } : {}),
    ...extraEnv,
  };
  for (const k of removeEnv) delete env[k];
  const child = spawn(process.execPath, ['src/server.js'], { cwd: apiDir, env, stdio: ['ignore', out, out], windowsHide: true });
  const base = `${https ? 'https' : 'http'}://localhost:${port}`;
  const srv = { child, base, dataFile, logFile, port, https, exited: false };
  child.on('exit', (code) => { srv.exited = true; srv.exitCode = code; });
  await waitReady(base, 20000, srv);
  return srv;
}
async function waitReady(base, ms, srv) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (srv && srv.exited) throw new Error(`server exited early (code ${srv.exitCode})`);
    try { const r = await fetch(base + '/ready', { signal: AbortSignal.timeout(1000) }); if (r.status === 200) return Date.now() - t0; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server not ready in time');
}
async function stopServer(srv) {
  if (srv.exited) return;
  srv.child.kill();
  await new Promise((r) => { const t = setTimeout(r, 3000); srv.child.on('exit', () => { clearTimeout(t); r(); }); });
}

// ---------- client ----------
async function call(base, method, p, { token, body, timeoutMs = 10000 } = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(base + p, {
      method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* */ }
    return { status: res.status, ms: performance.now() - t0, body: json };
  } catch (e) {
    return { status: 0, ms: performance.now() - t0, error: e.name === 'TimeoutError' ? 'timeout' : (e.cause && e.cause.code) || e.message };
  }
}
async function login(base, id) {
  const r = await call(base, 'POST', '/api/auth/login', { body: { userId: id, password: pw(id) } });
  if (r.status !== 200) throw new Error(`login ${id} failed: ${r.status} ${r.error || ''}`);
  return r.body.token;
}

// ---------- workload ----------
function buildOps(tokens) {
  const stu = ['stu1', 'stu2', 'emp1'];
  const lostBody = () => ({ type: 'lost', category: pick(CATEGORIES), description: words(3), location: pick(PLACES), eventDate: dayAgo(rnd(5)) });
  const foundBody = () => ({ ...lostBody(), type: 'found' });
  return [
    { name: 'list_reports', w: 25, run: (b) => call(b, 'GET', '/api/reports', { token: tokens[pick(stu)] }) },
    { name: 'list_matches', w: 15, run: (b) => call(b, 'GET', '/api/matches', { token: tokens[pick(stu)] }) },
    { name: 'list_notifications', w: 10, run: (b) => call(b, 'GET', '/api/notifications', { token: tokens[pick(stu)] }) },
    { name: 'create_lost', w: 20, run: (b) => call(b, 'POST', '/api/reports', { token: tokens[pick(stu)], body: lostBody() }) },
    { name: 'create_found', w: 12, run: (b) => call(b, 'POST', '/api/reports', { token: tokens.sec1, body: foundBody() }) },
    { name: 'staff_queue', w: 5, run: (b) => call(b, 'GET', '/api/manual-queue', { token: tokens.cust1 }) },
    { name: 'me', w: 3, run: (b) => call(b, 'GET', '/api/auth/me', { token: tokens[pick(stu)] }) },
    { name: 'health', w: 10, run: (b) => call(b, 'GET', '/health') },
  ];
}
const isOk = (op, r) => r.status >= 200 && r.status < 300 || (op.startsWith('create_') && r.status === 409);

async function runLoad({ base, tokens, vus, durationMs, thinkMs, label, sampleMs = 1000 }) {
  const ops = buildOps(tokens); const total = ops.reduce((a, o) => a + o.w, 0);
  const choose = () => { let x = Math.random() * total; for (const o of ops) { if ((x -= o.w) < 0) return o; } return ops[0]; };
  const per = {}; const errors = { network: 0, timeout: 0, http5xx: 0, unexpected4xx: 0, http429: 0 };
  const lat = [];
  let requests = 0; let stop = false;
  const t0 = performance.now();
  const samples = [];
  const sampler = (async () => {
    while (!stop) {
      await new Promise((r) => setTimeout(r, sampleMs));
      const m = await call(base, 'GET', '/api/metrics?reset=1', { token: tokens.cust1, timeoutMs: 5000 });
      if (m.status === 200) samples.push({ t: +((performance.now() - t0) / 1000).toFixed(1), rssMB: m.body.process.rssMB, heapMB: m.body.process.heapUsedMB, cpu: m.body.process.cpuPercentSinceLast, loopP99: m.body.eventLoop.p99Ms, loopMax: m.body.eventLoop.maxMs, inFlight: m.body.requests.inFlight });
    }
  })();
  const worker = async () => {
    await new Promise((r) => setTimeout(r, rnd(Math.max(1, thinkMs)))); // desynchronise start
    while (performance.now() - t0 < durationMs) {
      const op = choose(); const r = await op.run(base);
      requests += 1; (per[op.name] ||= []).push(r.ms); lat.push(r.ms);
      if (r.status === 0) { if (r.error === 'timeout') errors.timeout += 1; else errors.network += 1; }
      else if (r.status === 429) errors.http429 += 1;
      else if (r.status >= 500) errors.http5xx += 1;
      else if (!isOk(op.name, r)) errors.unexpected4xx += 1;
      await new Promise((res) => setTimeout(res, thinkMs * (0.5 + Math.random())));
    }
  };
  await Promise.all(Array.from({ length: vus }, worker));
  stop = true; await sampler;
  const elapsed = (performance.now() - t0) / 1000;
  const errTotal = Object.values(errors).reduce((a, b) => a + b, 0);
  const agg = (k, f) => +(Math.max(...samples.map((s) => s[k]), 0)).toFixed(1);
  return {
    label, vus, thinkMs, durationSec: +elapsed.toFixed(1), requests, throughputRps: +(requests / elapsed).toFixed(1),
    errors, errorRatePct: +((errTotal / Math.max(1, requests)) * 100).toFixed(2),
    overall: summarise(lat), perOp: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, summarise(v)])),
    server: { maxRssMB: agg('rssMB'), maxHeapMB: agg('heapMB'), maxCpuPct: agg('cpu'), avgCpuPct: +(samples.reduce((a, s) => a + s.cpu, 0) / (samples.length || 1)).toFixed(1), maxLoopP99Ms: agg('loopP99'), maxLoopMaxMs: agg('loopMax'), maxInFlight: agg('inFlight'), samples: samples.length },
  };
}

async function tokensFor(base) {
  const t = {}; for (const id of ['stu1', 'stu2', 'emp1', 'sec1', 'cust1']) t[id] = await login(base, id); return t;
}

// Login burst: N concurrent logins while a probe measures /health latency (shows event-loop blocking).
async function loginBurst({ base, concurrency, rounds }) {
  const loginLat = []; const probeLat = []; let stop = false; let errors = 0;
  const probe = (async () => { while (!stop) { const r = await call(base, 'GET', '/health', { timeoutMs: 15000 }); probeLat.push(r.ms); await new Promise((x) => setTimeout(x, 20)); } })();
  const ids = ['stu1', 'stu2', 'emp1', 'sec1', 'cust1'];
  const t0 = performance.now();
  for (let r = 0; r < rounds; r++) {
    await Promise.all(Array.from({ length: concurrency }, async (_, i) => {
      const id = ids[i % ids.length];
      const res = await call(base, 'POST', '/api/auth/login', { body: { userId: id, password: pw(id) }, timeoutMs: 30000 });
      if (res.status !== 200) errors += 1; loginLat.push(res.ms);
    }));
  }
  const elapsed = (performance.now() - t0) / 1000; stop = true; await probe;
  return { concurrency, rounds, logins: loginLat.length, errors, loginsPerSec: +(loginLat.length / elapsed).toFixed(1), login: summarise(loginLat), healthProbeDuringBurst: summarise(probeLat) };
}

module.exports = { ROOT, API, WORK, startServer, stopServer, waitReady, call, login, tokensFor, runLoad, loginBurst, summarise, makeDb, pw, rnd, pick, words, CATEGORIES, PLACES, dayAgo };
