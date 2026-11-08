'use strict';
// Week 17: tests that lock in the fixes agreed after user acceptance testing (see docs/w17 UAT report, findings F1-F4).
const test = require('node:test');
const assert = require('node:assert');
const { start } = require('./helpers');
const { score, MATCH_THRESHOLD } = require('../src/matching');

const today = () => new Date().toISOString().slice(0, 10);
const lost = (o = {}) => ({ type: 'lost', category: 'keys', description: 'silver house keys with blue tag', location: 'gym', eventDate: today(), ...o });
const found = (o = {}) => ({ ...lost(), type: 'found', ...o });

test('A01 [F3] one or two generic shared words are not enough for a candidate; brief lost descriptions still match', async () => {
  const s = await start();
  await s.call('POST', '/api/reports', lost(), 'stu2');                       // silver house keys with blue tag
  const generic = await s.call('POST', '/api/reports', found({ description: 'brass padlock key with blue tag', location: 'gym entrance' }), 'sec1');
  assert.equal(generic.body.matches.length, 0, 'sharing only "blue" and "tag" must not create a candidate');
  const one = await s.call('POST', '/api/reports', found({ description: 'green bike lock key chain', location: 'gym' }), 'sec1');
  assert.equal(one.body.matches.length, 0);
  await s.call('POST', '/api/reports', lost({ category: 'wallet', description: 'brown wallet', location: 'admin office' }), 'emp1');
  const brief = await s.call('POST', '/api/reports', found({ category: 'wallet', description: 'brown leather wallet with student card and some cash', location: 'admin office lobby' }), 'sec1');
  assert.equal(brief.body.matches.length, 1, 'a short lost description fully contained in the found one must still match');
  const same = await s.call('POST', '/api/reports', found({ description: 'silver house keys blue tag', location: 'gym' }), 'sec1');
  assert.equal(same.body.matches.length, 1, 'a genuine match is unaffected'); s.close();
});
test('A02 [F3] scoring unit: overlap rule boundary (shorter description must be at least 50% covered)', () => {
  const l = (d) => ({ type: 'lost', category: 'bag', description: d, location: 'x', eventDate: '2026-11-01' });
  const f = (d) => ({ type: 'found', category: 'bag', description: d, location: 'x', eventDate: '2026-11-01' });
  assert.ok(score(l('red nylon backpack'), f('red nylon backpack large')) >= MATCH_THRESHOLD);   // 3 of 3
  assert.ok(score(l('red nylon backpack'), f('red cotton tote handles')) === 0);                  // 1 of 3 = 33%
  assert.ok(score(l('red nylon'), f('red cotton tote handles')) >= MATCH_THRESHOLD);              // 1 of 2 = 50% (boundary, accepted)
  assert.ok(score(l('backpack'), f('red nylon backpack')) >= MATCH_THRESHOLD);                    // brief but fully contained
});
test('A03 [F2] verifying or rejecting requires a note recording the proof checked / reason (audit trail)', async () => {
  const s = await start();
  await s.call('POST', '/api/reports', lost(), 'stu1');
  const f = await s.call('POST', '/api/reports', found(), 'sec1');
  const id = f.body.matches[0].id;
  for (const body of [{ ownershipConfirmed: true }, { ownershipConfirmed: true, note: '' }, { ownershipConfirmed: true, note: 'ok' }, { ownershipConfirmed: false, note: '   ' }, { ownershipConfirmed: true, note: 'x'.repeat(201) }, { ownershipConfirmed: true, note: 'bad\u0000note here' }, { ownershipConfirmed: true, note: 12345 }]) {
    const r = await s.call('POST', `/api/matches/${id}/verify`, body, 'cust1');
    assert.equal(r.status, 422, JSON.stringify(body).slice(0, 60)); assert.ok(r.body.error.details && r.body.error.details.note);
  }
  assert.equal(s.store.data.matches[0].status, 'candidate', 'rejected requests must not change the match');
  const ok = await s.call('POST', `/api/matches/${id}/verify`, { ownershipConfirmed: true, note: '  Student ID matched and described the red sticker  ' }, 'cust1');
  assert.equal(ok.status, 200); assert.equal(ok.body.note, 'Student ID matched and described the red sticker', 'note stored trimmed');
  await s.close();
});
test('A04 [F2] a refusal needs a reason too, and the match is then rejected with that reason on record', async () => {
  const s = await start();
  await s.call('POST', '/api/reports', lost(), 'stu1');
  const f = await s.call('POST', '/api/reports', found(), 'sec1'); const id = f.body.matches[0].id;
  assert.equal((await s.call('POST', `/api/matches/${id}/verify`, { ownershipConfirmed: false }, 'cust1')).status, 422);
  const r = await s.call('POST', `/api/matches/${id}/verify`, { ownershipConfirmed: false, note: 'Could not describe the tag colour' }, 'cust1');
  assert.equal(r.body.status, 'rejected'); assert.equal(r.body.note, 'Could not describe the tag colour'); s.close();
});
test('A05 [F1] staff matches carry both item summaries; claimants get only their own report; others get nothing', async () => {
  const s = await start();
  await s.call('POST', '/api/reports', lost(), 'stu1');
  await s.call('POST', '/api/reports', found({ location: 'gym lockers' }), 'sec1');
  const staff = (await s.call('GET', '/api/matches', null, 'cust1')).body[0];
  assert.equal(staff.lost.description, 'silver house keys with blue tag'); assert.equal(staff.lost.reporterId, 'stu1');
  assert.equal(staff.found.location, 'gym lockers'); assert.equal(staff.found.reporterId, 'sec1');
  const own = (await s.call('GET', '/api/matches', null, 'stu1')).body[0];
  assert.equal(own.lost.description, 'silver house keys with blue tag'); assert.equal(own.found, undefined); assert.equal(own.foundId, undefined);
  assert.ok(!JSON.stringify(own).includes('gym lockers') && !JSON.stringify(own).includes('sec1'));
  assert.equal((await s.call('GET', '/api/matches', null, 'stu2')).body.length, 0); s.close();
});
test('A06 [F4] notifications carry a creation time so they can be shown in plain language', async () => {
  const s = await start();
  await s.call('POST', '/api/reports', lost(), 'stu1');
  await s.call('POST', '/api/reports', found(), 'sec1');
  const n = (await s.call('GET', '/api/notifications', null, 'stu1')).body[0];
  assert.ok(n.createdAt && !isNaN(Date.parse(n.createdAt)), 'candidate notification has createdAt');
  await s.call('POST', '/api/reports', found({ category: 'bag', description: 'unclaimed grey bag zipper' }), 'sec1');
  const later = new Date(Date.now() + 40 * 86400000).toISOString();
  await s.call('POST', '/api/jobs/aging', { now: later }, 'cust1');
  const rem = (await s.call('GET', '/api/notifications', null, 'cust1')).body.find((x) => x.kind === 'aging_reminder');
  assert.ok(rem && rem.createdAt === later, 'aging reminder has createdAt'); s.close();
});
