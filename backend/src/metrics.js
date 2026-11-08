'use strict';
// Lightweight in-process metrics: request counts, latency histogram per route, process and event-loop health.
// Exposed to staff only at GET /api/metrics (JSON). No request bodies, tokens or user data are recorded.
const { monitorEventLoopDelay } = require('perf_hooks');
const log = require('./logger');

const BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

function quantile(buckets, count, q) {
  if (!count) return 0;
  const target = Math.ceil(count * q);
  let cum = 0;
  for (let i = 0; i < buckets.length; i++) {
    cum += buckets[i];
    if (cum >= target) return i < BUCKETS_MS.length ? BUCKETS_MS[i] : BUCKETS_MS[BUCKETS_MS.length - 1] * 2;
  }
  return BUCKETS_MS[BUCKETS_MS.length - 1] * 2;
}

function createMetrics({ slowRequestMs = 1000 } = {}) {
  const startedAt = Date.now();
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const routes = new Map(); // "GET /api/reports" -> stats
  const status = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  let total = 0; let inFlight = 0;
  let lastCpu = process.cpuUsage(); let lastT = process.hrtime.bigint();

  function middleware(req, res, next) {
    inFlight += 1;
    const t0 = process.hrtime.bigint();
    let done = false;
    res.on('close', () => {
      if (done) return; done = true;
      inFlight -= 1; total += 1;
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const route = `${req.method} ${req.route ? (req.baseUrl || '') + req.route.path : 'unmatched'}`;
      const cls = `${Math.floor(res.statusCode / 100)}xx`;
      status[cls] = (status[cls] || 0) + 1;
      let r = routes.get(route);
      if (!r) { r = { count: 0, sumMs: 0, maxMs: 0, buckets: new Array(BUCKETS_MS.length + 1).fill(0), s5xx: 0, s4xx: 0 }; routes.set(route, r); }
      r.count += 1; r.sumMs += ms; if (ms > r.maxMs) r.maxMs = ms;
      let i = BUCKETS_MS.findIndex((b) => ms <= b); if (i < 0) i = BUCKETS_MS.length;
      r.buckets[i] += 1;
      if (res.statusCode >= 500) r.s5xx += 1; else if (res.statusCode >= 400) r.s4xx += 1;
      if (ms >= slowRequestMs) log.warn('http.slow_request', { method: req.method, route: route.split(' ')[1], status: res.statusCode, ms: Math.round(ms) });
    });
    next();
  }

  function snapshot({ reset = false } = {}) {
    const now = process.hrtime.bigint();
    const cpu = process.cpuUsage(lastCpu);
    const wallUs = Number(now - lastT) / 1e3;
    const cpuPct = wallUs > 0 ? ((cpu.user + cpu.system) / wallUs) * 100 : 0;
    lastCpu = process.cpuUsage(); lastT = now;
    const mem = process.memoryUsage();
    const out = {
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      requests: { total, inFlight, byStatus: { ...status } },
      routes: [...routes.entries()].map(([route, r]) => ({
        route, count: r.count, avgMs: +(r.sumMs / r.count).toFixed(2), maxMs: +r.maxMs.toFixed(1),
        p50Ms: quantile(r.buckets, r.count, 0.5), p95Ms: quantile(r.buckets, r.count, 0.95), p99Ms: quantile(r.buckets, r.count, 0.99),
        clientErrors: r.s4xx, serverErrors: r.s5xx,
      })).sort((a, b) => b.count - a.count),
      process: { rssMB: +(mem.rss / 1048576).toFixed(1), heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1), cpuPercentSinceLast: +cpuPct.toFixed(1) },
      eventLoop: { meanMs: +(loop.mean / 1e6).toFixed(2), p99Ms: +(loop.percentile(99) / 1e6).toFixed(2), maxMs: +(loop.max / 1e6).toFixed(2) },
    };
    if (reset) loop.reset();
    return out;
  }
  return { middleware, snapshot, stop: () => loop.disable() };
}
module.exports = { createMetrics, BUCKETS_MS };
