'use strict';
// Usage: NODE_EXTRA_CA_CERTS=api/certs/dev-cert.pem node perf/run-suite.js --label baseline --env dev-http --scenarios ordinary,peak,login,growth,stress
// Environments: dev-http | dev-https | prod-https
const fs = require('fs');
const path = require('path');
const lib = require('./lib');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const label = arg('label', 'run');
const envName = arg('env', 'dev-http');
const scenarios = arg('scenarios', 'ordinary,peak').split(',');
const scale = parseFloat(arg('scale', '1')); // duration multiplier
const OUT = path.join(lib.ROOT, 'docs', 'w16');
fs.mkdirSync(OUT, { recursive: true });
const envCfg = { 'dev-http': { https: false, production: false }, 'dev-https': { https: true, production: false }, 'prod-https': { https: true, production: true } }[envName];
if (!envCfg) throw new Error('unknown env ' + envName);

const fmt = (r) => `${r.label.padEnd(18)} vus=${String(r.vus).padStart(3)} rps=${String(r.throughputRps).padStart(6)} p50=${String(r.overall.p50).padStart(6)} p95=${String(r.overall.p95).padStart(7)} p99=${String(r.overall.p99).padStart(7)} max=${String(r.overall.max).padStart(7)} err=${r.errorRatePct}% cpu(max)=${r.server.maxCpuPct}% rss=${r.server.maxRssMB}MB loopP99=${r.server.maxLoopP99Ms}ms`;

(async () => {
  const results = { label, env: envName, machine: `${require('os').cpus()[0].model.trim()}, ${require('os').cpus().length} logical CPUs, node ${process.version}, ${process.platform}`, startedAt: new Date().toISOString(), scenarios: {} };
  const withServer = async (name, opts, fn) => {
    const srv = await lib.startServer({ label: `${label}-${name}`, ...envCfg, ...opts });
    try { return await fn(srv); } finally { await lib.stopServer(srv); }
  };
  const save = () => fs.writeFileSync(path.join(OUT, `results-${label}-${envName}.json`), JSON.stringify(results, null, 2));

  if (scenarios.includes('ordinary')) await withServer('ordinary', { dataReports: 500 }, async (srv) => {
    const tokens = await lib.tokensFor(srv.base);
    const r = await lib.runLoad({ base: srv.base, tokens, vus: 10, thinkMs: 800, durationMs: 25000 * scale, label: 'ordinary' });
    r.dbBytes = fs.statSync(srv.dataFile).size; results.scenarios.ordinary = r; console.log(fmt(r)); save();
  });
  if (scenarios.includes('peak')) await withServer('peak', { dataReports: 500 }, async (srv) => {
    const tokens = await lib.tokensFor(srv.base);
    const r = await lib.runLoad({ base: srv.base, tokens, vus: 50, thinkMs: 250, durationMs: 25000 * scale, label: 'peak' });
    r.dbBytes = fs.statSync(srv.dataFile).size; results.scenarios.peak = r; console.log(fmt(r)); save();
  });
  if (scenarios.includes('login')) await withServer('login', {}, async (srv) => {
    const r = await lib.loginBurst({ base: srv.base, concurrency: 40, rounds: 3 });
    results.scenarios.loginBurst = r;
    console.log(`login burst        c=${r.concurrency} x${r.rounds}: logins/s=${r.loginsPerSec} login p50=${r.login.p50} p95=${r.login.p95} max=${r.login.max} | /health during burst p50=${r.healthProbeDuringBurst.p50} p95=${r.healthProbeDuringBurst.p95} max=${r.healthProbeDuringBurst.max} errors=${r.errors}`); save();
  });
  if (scenarios.includes('growth')) {
    results.scenarios.growth = [];
    for (const n of [0, 2000, 10000, 25000]) await withServer(`growth${n}`, { dataReports: n }, async (srv) => {
      const tokens = await lib.tokensFor(srv.base);
      const r = await lib.runLoad({ base: srv.base, tokens, vus: 8, thinkMs: 150, durationMs: 12000 * scale, label: `growth ${n}` });
      r.datasetReports = n; r.dbBytes = fs.statSync(srv.dataFile).size; r.dbBytesAfter = r.dbBytes;
      results.scenarios.growth.push(r); console.log(fmt(r), `| createLost p95=${(r.perOp.create_lost || {}).p95} createFound p95=${(r.perOp.create_found || {}).p95} listReports p95=${(r.perOp.list_reports || {}).p95} db=${(r.dbBytes / 1048576).toFixed(1)}MB`); save();
    });
  }
  if (scenarios.includes('stress')) {
    results.scenarios.stress = [];
    await withServer('stress', { dataReports: 500 }, async (srv) => {
      const tokens = await lib.tokensFor(srv.base);
      for (const vus of [25, 50, 100, 200, 400]) {
        const r = await lib.runLoad({ base: srv.base, tokens, vus, thinkMs: 100, durationMs: 10000 * scale, label: `stress ${vus}vu` });
        results.scenarios.stress.push(r); console.log(fmt(r)); save();
        if (r.errorRatePct > 20) { console.log('stopping stress ramp: error rate above 20%'); break; }
      }
    });
  }
  results.finishedAt = new Date().toISOString(); save();
  console.log('saved', path.join(OUT, `results-${label}-${envName}.json`));
})().catch((e) => { console.error('suite failed:', e); process.exit(1); });
