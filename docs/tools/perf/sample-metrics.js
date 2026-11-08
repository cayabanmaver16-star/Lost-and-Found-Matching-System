'use strict';
// Starts a real server, generates a little traffic (including errors), and saves the /ready and /api/metrics responses as evidence.
const fs = require('fs');
const path = require('path');
const lib = require('./lib');
(async () => {
  const srv = await lib.startServer({ label: 'sample', dataReports: 300 });
  try {
    const tokens = await lib.tokensFor(srv.base);
    for (let i = 0; i < 30; i++) await lib.call(srv.base, 'GET', '/api/reports', { token: tokens.stu1 });
    for (let i = 0; i < 6; i++) await lib.call(srv.base, 'POST', '/api/reports', { token: tokens.stu1, body: { type: 'lost', category: 'bag', description: lib.words(3), location: 'gym', eventDate: lib.dayAgo(1) } });
    await lib.call(srv.base, 'GET', '/api/manual-queue', { token: tokens.stu1 });            // 403
    await lib.call(srv.base, 'GET', '/api/reports', {});                                      // 401
    await lib.call(srv.base, 'POST', '/api/reports', { token: tokens.stu1, body: { type: 'x' } }); // 422
    const ready = await lib.call(srv.base, 'GET', '/ready');
    const metrics = await lib.call(srv.base, 'GET', '/api/metrics', { token: tokens.cust1 });
    const out = { ready: { status: ready.status, body: ready.body }, metrics: metrics.body };
    fs.writeFileSync(path.join(lib.ROOT, 'docs', 'w16', 'sample-monitoring.json'), JSON.stringify(out, null, 2));
    console.log('ready:', ready.status, JSON.stringify(ready.body));
    console.log('requests:', JSON.stringify(metrics.body.requests));
    console.log('top routes:', metrics.body.routes.slice(0, 4).map((r) => `${r.route} n=${r.count} p95=${r.p95Ms}ms 4xx=${r.clientErrors}`).join(' | '));
    console.log('process:', JSON.stringify(metrics.body.process), 'eventLoop:', JSON.stringify(metrics.body.eventLoop));
  } finally { await lib.stopServer(srv); }
})().catch((e) => { console.error(e); process.exit(1); });
