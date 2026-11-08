'use strict';
const log = require('./logger');
const { CATEGORIES, MATCH_THRESHOLD, fingerprint, score } = require('./matching');
const { deliver } = require('./notifier');

const DAY = 86400000;
const AGING = { reminderDays: 30, disposalDays: 90 };

class HttpError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

function audit(store, actor, action, refId, extra = {}) {
  store.data.audit.push({ ts: new Date().toISOString(), actor, action, refId, ...extra });
}

const CTRL = /(?![\t\n])\p{Cc}/u; // reject control characters (allow tab/newline)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EVENT_AGE_DAYS = 730;
// Parse "YYYY-MM-DD" strictly as a real calendar day (rejects 2026-02-30, month 13, day 00). Returns UTC midnight or null.
function parseDay(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return null;
  const [y, mo, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}
function validateReport(b, now = new Date()) {
  const errors = {};
  if (b === null || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(422, 'VALIDATION_FAILED', 'Body must be a JSON object');
  if (!['lost', 'found'].includes(b.type)) errors.type = 'type must be "lost" or "found"';
  if (!CATEGORIES.includes(b.category)) errors.category = `category must be one of: ${CATEGORIES.join(', ')}`;
  if (typeof b.description !== 'string' || b.description.trim().length < 5 || b.description.length > 300 || CTRL.test(b.description))
    errors.description = 'description must be 5-300 text characters';
  if (typeof b.location !== 'string' || b.location.trim().length < 2 || b.location.length > 100 || CTRL.test(b.location))
    errors.location = 'location must be 2-100 text characters';
  const day = parseDay(b.eventDate);
  if (!day) errors.eventDate = 'eventDate must be a real calendar date (YYYY-MM-DD)';
  else {
    // The user's local "today" can be one calendar day ahead of UTC (UTC+1..+14), so allow UTC today + 1 day.
    const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (day.getTime() > utcToday + DAY) errors.eventDate = 'eventDate cannot be in the future';
    else if (day.getTime() < utcToday - MAX_EVENT_AGE_DAYS * DAY) errors.eventDate = `eventDate cannot be more than ${MAX_EVENT_AGE_DAYS} days ago`;
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'VALIDATION_FAILED', 'Invalid report', errors);
}

async function createReport(store, actor, body, opts = {}) {
  const now = (opts.clock || (() => new Date()))();
  validateReport(body, now);
  const report = {
    id: store.nextId('R'),
    type: body.type, category: body.category,
    description: body.description.trim(), location: body.location.trim(), eventDate: body.eventDate,
    reporterId: actor.id, status: 'open', createdAt: now.toISOString(),
    remindedAt: null, disposalFlagged: false,
  };
  const fp = fingerprint(report);
  const dup = store.data.reports.find((r) => r.status === 'open' && fingerprint(r) === fp);
  if (dup) {
    log.warn('report.duplicate_rejected', { existingId: dup.id, reporterId: actor.id });
    throw new HttpError(409, 'DUPLICATE_REPORT', `A similar open report already exists (${dup.id})`, { existingId: dup.id });
  }
  store.data.reports.push(report);
  audit(store, actor.id, 'report.created', report.id, { type: report.type });
  log.info('report.created', { id: report.id, type: report.type, category: report.category });
  const sim = opts.allowTestHooks && ['ok', 'transient', 'permanent'].includes(body.simulateDelivery) ? body.simulateDelivery : opts.simulate;
  const matches = await runMatching(store, report, { ...opts, simulate: sim });
  store.changed();
  return { report, matches };
}

// Set of "lostId|foundId" pairs already matched, built once per store and kept in sync (replaces an O(matches) scan per candidate).
function pairIndex(store) {
  if (!store._pairs || store._pairsFor !== store.data.matches) {
    store._pairs = new Set(store.data.matches.map((m) => m.lostId + '|' + m.foundId));
    store._pairsFor = store.data.matches;
  }
  return store._pairs;
}

async function runMatching(store, report, opts) {
  const created = [];
  const pairs = pairIndex(store);
  for (const o of store.data.reports) {
    if (o.status !== 'open' || o.type === report.type || o.category !== report.category) continue; // cheap checks first
    const lost = report.type === 'lost' ? report : o;
    const found = report.type === 'found' ? report : o;
    const s = score(lost, found);
    if (s < MATCH_THRESHOLD) continue;
    if (pairs.has(lost.id + '|' + found.id)) continue;
    const match = {
      id: store.nextId('M'), lostId: lost.id, foundId: found.id, score: s,
      status: 'candidate', createdAt: new Date().toISOString(), verifiedBy: null, releasedTo: null,
    };
    store.data.matches.push(match);
    pairs.add(lost.id + '|' + found.id);
    log.info('match.candidate_created', { id: match.id, lostId: lost.id, foundId: found.id, score: s });
    const n = {
      id: store.nextId('N'), matchId: match.id, recipientId: lost.reporterId, kind: 'candidate_match', createdAt: new Date().toISOString(),
      status: 'queued', attempts: 0, lastError: null, sim: opts.simulate,
    };
    store.data.notifications.push(n);
    created.push(match);
    await deliver(store, n, opts.delivery);
  }
  return created;
}

// Integrity guards shared by verify and release:
//  - both reports must still be open (an item already released/disposed cannot be handed over again)
//  - separation of duties: staff may not decide a match for an item they themselves reported lost
function guardMatchActionable(store, actor, m) {
  const lost = store.data.reports.find((r) => r.id === m.lostId);
  const found = store.data.reports.find((r) => r.id === m.foundId);
  if (!lost || !found || lost.status !== 'open' || found.status !== 'open') throw new HttpError(409, 'ITEM_UNAVAILABLE', 'One of the reports is no longer open');
  if (lost.reporterId === actor.id) throw new HttpError(403, 'CONFLICT_OF_INTEREST', 'You cannot decide a match for an item you reported');
  return { lost, found };
}

// Manual verification: custodian decides after checking ownership proof (not stored; only a yes/no + note).
function verifyMatch(store, actor, id, body) {
  const m = store.data.matches.find((x) => x.id === id);
  if (!m) throw new HttpError(404, 'NOT_FOUND', 'Match not found');
  if (m.status !== 'candidate') throw new HttpError(409, 'INVALID_STATE', `Match is ${m.status}; only candidates can be verified`);
  guardMatchActionable(store, actor, m);
  if (typeof body.ownershipConfirmed !== 'boolean') throw new HttpError(422, 'VALIDATION_FAILED', 'ownershipConfirmed (boolean) is required');
  // The audit trail must say WHAT proof was checked (or why the claim was refused): a decision without a reason is not accepted.
  if (typeof body.note !== 'string' || body.note.trim().length < 5 || body.note.length > 200 || CTRL.test(body.note)) {
    throw new HttpError(422, 'VALIDATION_FAILED', 'A note of 5-200 characters is required: the proof checked, or the reason for refusing', { note: 'note must be 5-200 text characters describing the proof checked or the reason' });
  }
  m.status = body.ownershipConfirmed ? 'verified' : 'rejected';
  m.verifiedBy = actor.id;
  m.note = body.note.trim();
  audit(store, actor.id, `match.${m.status}`, m.id);
  log.info(`match.${m.status}`, { id: m.id, by: actor.id });
  store.changed();
  return m;
}

function releaseMatch(store, actor, id) {
  const m = store.data.matches.find((x) => x.id === id);
  if (!m) throw new HttpError(404, 'NOT_FOUND', 'Match not found');
  if (m.status !== 'verified') throw new HttpError(409, 'INVALID_STATE', 'Only verified matches can be released');
  const { lost, found } = guardMatchActionable(store, actor, m);
  m.status = 'released';
  m.releasedTo = lost.reporterId;
  lost.status = 'closed'; found.status = 'closed';
  // Withdraw every competing match (candidate OR already verified) for either report
  store.data.matches.filter((x) => x.id !== m.id && ['candidate', 'verified'].includes(x.status) && (x.lostId === lost.id || x.foundId === found.id))
    .forEach((x) => { x.status = 'withdrawn'; });
  audit(store, actor.id, 'match.released', m.id);
  log.info('match.released', { id: m.id, lostId: lost.id, foundId: found.id });
  store.changed();
  return m;
}

// Scheduled job: aging reminders (>=30 days) and disposal review (>=90 days) for found items.
function runAging(store, now = new Date()) {
  const result = { reminded: [], disposalFlagged: [] };
  for (const r of store.data.reports) {
    if (r.type !== 'found' || r.status !== 'open') continue;
    const age = Math.floor((now - new Date(r.createdAt)) / DAY);
    if (r.disposalFlagged) continue; // already escalated: no further reminders or duplicate flags
    if (age >= AGING.disposalDays) {
      r.disposalFlagged = true; r.remindedAt = r.remindedAt || now.toISOString();
      store.data.manualQueue.push({ id: store.nextId('MQ'), kind: 'disposal_review', refId: r.id, reason: `Unclaimed for ${age} days`, status: 'open', createdAt: now.toISOString() });
      log.warn('aging.disposal_flagged', { id: r.id, ageDays: age });
      result.disposalFlagged.push(r.id);
    } else if (age >= AGING.reminderDays && !r.remindedAt) {
      r.remindedAt = now.toISOString();
      store.data.notifications.push({ id: store.nextId('N'), matchId: null, recipientId: 'custodian', kind: 'aging_reminder', refId: r.id, createdAt: now.toISOString(), status: 'delivered', attempts: 1, lastError: null });
      log.info('aging.reminder_sent', { id: r.id, ageDays: age });
      result.reminded.push(r.id);
    }
  }
  store.changed();
  return result;
}

function resolveQueueItem(store, actor, id, body) {
  const q = store.data.manualQueue.find((x) => x.id === id);
  if (!q) throw new HttpError(404, 'NOT_FOUND', 'Queue item not found');
  if (q.status !== 'open') throw new HttpError(409, 'INVALID_STATE', 'Already resolved');
  q.status = 'resolved'; q.resolvedBy = actor.id; q.resolution = typeof body.resolution === 'string' ? body.resolution.replace(CTRL, '').slice(0, 200) : '';
  if (q.kind === 'disposal_review' && body.dispose === true) {
    const r = store.data.reports.find((x) => x.id === q.refId);
    if (r) r.status = 'disposed';
  }
  audit(store, actor.id, 'queue.resolved', q.id);
  log.info('queue.resolved', { id: q.id, kind: q.kind, by: actor.id });
  store.changed();
  return q;
}

module.exports = { HttpError, validateReport, createReport, verifyMatch, releaseMatch, runAging, resolveQueueItem, AGING };
