'use strict';
// Evidence generator: runs the SA7 scenarios against a live server (default :3055).
// Usage: PORT=3055 node src/server.js   then   node demo.js
const fs = require('fs');
const B = `http://127.0.0.1:${process.env.PORT || 3055}`;
const call = async (m, p, body, who = ['stu1', 'student']) => {
  const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json', 'x-user-id': who[0], 'x-role': who[1] }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const SEC = ['sec1', 'security'], CUST = ['cust1', 'custodian'];
(async () => {
  const lost = { type: 'lost', category: 'wallet', description: 'black leather wallet with student card', location: 'library 2nd floor', eventDate: '2026-11-01' };
  const found = { type: 'found', category: 'wallet', description: 'black leather wallet student card inside', location: 'library second floor', eventDate: '2026-11-02' };
  console.log('SCENARIO 1: duplicate control');
  console.log('first lost report ->', (await call('POST', '/api/reports', lost)).status);
  console.log('same lost report again ->', (await call('POST', '/api/reports', lost)).status, '(expected 409)');
  console.log('SCENARIO 2: transient delivery failure, recovered by retry');
  let r = await call('POST', '/api/reports', { ...found, simulateDelivery: 'transient' }, SEC);
  console.log('found report ->', r.status, 'candidate matches:', r.body.matches.length);
  console.log('SCENARIO 3: permanent delivery failure routed to manual queue');
  await call('POST', '/api/reports', { type: 'lost', category: 'keys', description: 'silver house keys blue tag', location: 'gym', eventDate: '2026-11-03' }, ['stu2', 'student']);
  await call('POST', '/api/reports', { type: 'found', category: 'keys', description: 'silver keys with blue tag', location: 'gym entrance', eventDate: '2026-11-04', simulateDelivery: 'permanent' }, SEC);
  const q = await call('GET', '/api/manual-queue', null, CUST);
  console.log('manual queue:', JSON.stringify(q.body));
  console.log('SCENARIO 4: operator re-sends after fixing cause');
  const rs = await call('POST', `/api/manual-queue/${q.body[0].id}/retry-notification`, {}, CUST);
  console.log('notification status ->', rs.body.notification.status, '| queue item ->', rs.body.queueItem.status);
  console.log('SCENARIO 5: manual verification then release');
  const ms = await call('GET', '/api/matches', null, CUST);
  const id = ms.body[0].id;
  console.log('verify ->', (await call('POST', `/api/matches/${id}/verify`, { ownershipConfirmed: true }, CUST)).body.status);
  console.log('release ->', (await call('POST', `/api/matches/${id}/release`, {}, CUST)).body.status);
  console.log('SCENARIO 6: aging job 40 days later');
  const later = new Date(Date.now() + 40 * 864e5).toISOString();
  console.log(JSON.stringify((await call('POST', '/api/jobs/aging', { now: later }, CUST)).body));
  const logs = await call('GET', '/api/logs?n=200', null, CUST);
  fs.writeFileSync('../docs/evidence-structured-logs.json', JSON.stringify(logs.body, null, 2));
  console.log('saved', logs.body.length, 'log entries');
})();
