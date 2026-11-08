'use strict';
const log = require('./logger');

// Retry policy (documented in SA7 evidence): max 3 attempts, exponential backoff, then manual review.
const POLICY = { maxAttempts: 3, baseDelayMs: 1000, factor: 2 };

// Simulated delivery channel. Failure injection is controlled by "sim" for repeatable evidence:
//  sim = 'ok' | 'transient' (fails first 2 attempts) | 'permanent' (always fails)
function makeChannel() {
  return async function send(notification, attempt) {
    const sim = notification.sim || 'ok';
    if (sim === 'permanent') throw Object.assign(new Error('Recipient mailbox unavailable'), { permanent: true });
    if (sim === 'transient' && attempt < 3) throw new Error('Gateway timeout');
    return { delivered: true };
  };
}

// Process one notification with bounded retries. Delay is injectable so tests run fast.
async function deliver(store, n, { channel = makeChannel(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), policy = POLICY } = {}) {
  n.status = 'sending';
  while (n.attempts < policy.maxAttempts) {
    n.attempts += 1;
    try {
      await channel(n, n.attempts);
      n.status = 'delivered';
      n.lastError = null;
      log.info('notification.delivered', { id: n.id, matchId: n.matchId, attempts: n.attempts });
      store.changed();
      return n;
    } catch (err) {
      n.lastError = err.message;
      const final = err.permanent || n.attempts >= policy.maxAttempts;
      log.warn('notification.attempt_failed', { id: n.id, attempt: n.attempts, error: err.message, willRetry: !final });
      if (final) break;
      await sleep(policy.baseDelayMs * policy.factor ** (n.attempts - 1));
    }
  }
  n.status = 'failed_permanent';
  store.data.manualQueue.push({
    id: store.nextId('MQ'), kind: 'notification_failure', refId: n.id, matchId: n.matchId,
    reason: n.lastError, status: 'open', createdAt: new Date().toISOString(),
  });
  log.error('notification.routed_to_manual', { id: n.id, matchId: n.matchId, attempts: n.attempts });
  store.changed();
  return n;
}
module.exports = { POLICY, deliver, makeChannel };
