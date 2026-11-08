'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { start } = require('./helpers');
const log = require('../src/logger');

const CUST = 'cust1';
const lost = { type: 'lost', category: 'wallet', description: 'black leather wallet with student card', location: 'library 2nd floor', eventDate: '2026-11-01' };
const found = { type: 'found', category: 'wallet', description: 'black leather wallet student card inside', location: 'library second floor', eventDate: '2026-11-02' };

test('T01 valid lost report is created (201)', async () => {
  const s = await start();
  const r = await s.call('POST', '/api/reports', lost);
  assert.equal(r.status, 201); assert.equal(r.body.report.status, 'open'); s.close();
});
test('T02 invalid report is rejected with field errors (422)', async () => {
  const s = await start();
  const r = await s.call('POST', '/api/reports', { type: 'x', category: 'nope', description: 'a', location: '', eventDate: '2999-01-01' });
  assert.equal(r.status, 422); assert.ok(r.body.error.details.type && r.body.error.details.category && r.body.error.details.eventDate); s.close();
});
test('T03 duplicate report by same reporter is blocked (409)', async () => {
  const s = await start();
  await s.call('POST', '/api/reports', lost);
  const r = await s.call('POST', '/api/reports', { ...lost, description: 'Black LEATHER wallet, with student card!' });
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'DUPLICATE_REPORT'); s.close();
});
test('T04 matching lost+found creates candidate and delivers notification', async () => {
  const s = await start();
  await s.call('POST', '/api/reports', lost);
  const r = await s.call('POST', '/api/reports', found, 'sec1');
  assert.equal(r.body.matches.length, 1); assert.ok(r.body.matches[0].score >= 50);
  assert.equal(s.store.data.notifications[0].status, 'delivered'); s.close();
});
test('T05 different category never matches', async () => {
  const s = await start();
  await s.call('POST', '/api/reports', lost);
  const r = await s.call('POST', '/api/reports', { ...found, category: 'keys' }, 'sec1');
  assert.equal(r.body.matches.length, 0); s.close();
});
test('T06 transient failure is retried and delivered on attempt 3 (recovered)', async () => {
    const s = await start(); log.clear();
  await s.call('POST', '/api/reports', lost);
  await s.call('POST', '/api/reports', { ...found, simulateDelivery: 'transient' }, 'sec1');
  const n = s.store.data.notifications[0];
  assert.equal(n.status, 'delivered'); assert.equal(n.attempts, 3);
  assert.equal(log.recent().filter((l) => l.event === 'notification.attempt_failed').length, 2);
  assert.equal(s.store.data.manualQueue.length, 0); s.close();
});
test('T07 permanent failure is routed to manual queue after bounded attempts', async () => {
    const s = await start();
  await s.call('POST', '/api/reports', lost);
  await s.call('POST', '/api/reports', { ...found, simulateDelivery: 'permanent' }, 'sec1');
  const n = s.store.data.notifications[0];
  assert.equal(n.status, 'failed_permanent'); assert.ok(n.attempts <= 3);
  assert.equal(s.store.data.manualQueue[0].kind, 'notification_failure');
  const fix = await s.call('POST', `/api/manual-queue/${s.store.data.manualQueue[0].id}/retry-notification`, {}, CUST);
  assert.equal(fix.body.notification.status, 'delivered'); assert.equal(fix.body.queueItem.status, 'resolved'); s.close();
});
test('T08 verification then release closes both reports', async () => {
  const s = await start();
  await s.call('POST', '/api/reports', lost);
  const r = await s.call('POST', '/api/reports', found, 'sec1');
  const id = r.body.matches[0].id;
  assert.equal((await s.call('POST', `/api/matches/${id}/release`, {}, CUST)).status, 409); // cannot skip verification
  assert.equal((await s.call('POST', `/api/matches/${id}/verify`, { ownershipConfirmed: true, note: 'ID card and contents checked' }, CUST)).body.status, 'verified');
  assert.equal((await s.call('POST', `/api/matches/${id}/release`, {}, CUST)).body.status, 'released');
  assert.ok(s.store.data.reports.every((x) => x.status === 'closed')); s.close();
});
test('T09 students cannot verify matches (403); anonymous gets 401', async () => {
  const s = await start();
  assert.equal((await s.call('POST', '/api/matches/M-0001/verify', { ownershipConfirmed: true, note: 'ID card and contents checked' })).status, 403);
  assert.equal((await s.call('GET', '/api/reports', null, null)).status, 401); s.close();
});
test('T10 aging job: reminder at 30 days, disposal review at 90 days, each only once', async () => {
  const s = await start();
  await s.call('POST', '/api/reports', found, 'sec1');
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
  assert.equal((await s.call('POST', '/api/jobs/aging', { now: day(10) }, CUST)).body.reminded.length, 0);
  assert.equal((await s.call('POST', '/api/jobs/aging', { now: day(31) }, CUST)).body.reminded.length, 1);
  assert.equal((await s.call('POST', '/api/jobs/aging', { now: day(32) }, CUST)).body.reminded.length, 0);
  assert.equal((await s.call('POST', '/api/jobs/aging', { now: day(91) }, CUST)).body.disposalFlagged.length, 1);
  assert.equal(s.store.data.manualQueue.filter((q) => q.kind === 'disposal_review').length, 1); s.close();
});
test('T11 malformed JSON returns 400 with no stack trace', async () => {
  const s = await start();
  const res = await s.raw('POST', '/api/reports', { rawBody: '{bad json', headers: { authorization: 'Bearer ' + (await s.tokenFor('stu1')) } });
  assert.equal(res.status, 400); assert.equal(res.body.error.code, 'BAD_JSON'); assert.ok(!res.text.includes(' at ')); s.close();
});
test('T12 claimants cannot see found-item link in their matches', async () => {
  const s = await start();
  await s.call('POST', '/api/reports', lost);
  await s.call('POST', '/api/reports', found, 'sec1');
  const m = await s.call('GET', '/api/matches');
  assert.equal(m.body.length, 1); assert.equal(m.body[0].foundId, undefined); s.close();
});
