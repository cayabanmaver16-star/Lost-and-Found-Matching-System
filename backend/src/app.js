'use strict';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const log = require('./logger');
const wf = require('./workflow');
const { deliver } = require('./notifier');
const { createAuth } = require('./auth');
const { createMetrics } = require('./metrics');

const STAFF = ['security', 'custodian'];
const ID_RE = /^[A-Z]{1,2}-\d{4,}$/;

// Bounded paging for list endpoints: ?limit= (default 200, max 500) and ?offset=; junk values fall back to defaults.
function page(req, arr) {
  const lim = parseInt(req.query.limit, 10);
  const off = parseInt(req.query.offset, 10);
  const limit = Number.isFinite(lim) && lim > 0 ? Math.min(lim, 500) : 200;
  const offset = Number.isFinite(off) && off > 0 ? off : 0;
  return arr.slice(offset, offset + limit);
}

function createApp(store, { config, users, delivery, clock = () => new Date() } = {}) {
  const auth = createAuth(config, users);
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  const metrics = createMetrics({ slowRequestMs: config.slowRequestMs });
  app.locals.metrics = metrics;
  app.locals.shuttingDown = false;
  app.use(metrics.middleware);
  app.use(helmet({ hsts: config.prod || !!config.tls ? { maxAge: 15552000 } : false }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  }));
  app.use(rateLimit({ windowMs: 60 * 1000, limit: config.globalRatePerMin, standardHeaders: true, legacyHeaders: false,
    handler: (_req, _res, next) => next(new wf.HttpError(429, 'RATE_LIMITED', 'Too many requests, slow down')) }));
  app.use(express.json({ limit: '10kb', strict: true }));
  app.use(auth.authenticate);

  // Durability gate: the response to a state-changing request is sent only after the change is safely on disk.
  // Concurrent requests share one write (group commit, see store.js), so this costs one file write per batch, not per request.
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const send = res.json.bind(res);
    res.json = (body) => {
      store.commit().then(() => send(body), (e) => {
        log.error('server.commit_failed', { error: e.message });
        res.status(500); send({ error: { code: 'INTERNAL', message: 'Internal server error' } });
      });
      return res;
    };
    next();
  });

  // Authorization guard: authentication first (401), then role check (403). Roles come from the verified token only.
  const need = (...roles) => (req, _res, next) => {
    if (!req.actor) {
      log.warn('auth.token_rejected', { reason: req.authFailure, path: req.path });
      return next(new wf.HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
    }
    if (roles.length && !roles.includes(req.actor.role)) {
      log.warn('authz.denied', { userId: req.actor.id, role: req.actor.role, method: req.method, path: req.path });
      return next(new wf.HttpError(403, 'FORBIDDEN', 'Role not permitted'));
    }
    next();
  };
  const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  app.param('id', (_req, _res, next, id) => (ID_RE.test(id) ? next() : next(new wf.HttpError(404, 'NOT_FOUND', 'Not found'))));
  const opts = { allowTestHooks: config.allowTestHooks, delivery, clock };

  // Liveness: the process answers. Readiness: it can accept work (not shutting down, last write to storage succeeded).
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', (_req, res) => {
    if (app.locals.shuttingDown) return res.status(503).json({ status: 'not_ready', reason: 'shutting_down' });
    if (store.lastSaveError) return res.status(503).json({ status: 'not_ready', reason: 'storage_unavailable' });
    res.json({ status: 'ready' });
  });

  // API description (public, contains no secrets). Kept in sync with the routes by test/contract.test.js.
  app.get('/api/openapi.json', (_req, res) => res.json(require('../openapi/spec')));

  // ---- auth ----
  const loginIpLimiter = rateLimit({ windowMs: config.loginWindowMs, limit: config.loginIpMax, standardHeaders: true, legacyHeaders: false,
    handler: (_req, _res, next) => next(new wf.HttpError(429, 'RATE_LIMITED', 'Too many login attempts, try again later')) });
  app.post('/api/auth/login', loginIpLimiter, h(async (req, res) => {
    const { userId, password } = req.body || {};
    const r = await auth.login(userId, password);
    if (r.error === 'BAD_REQUEST') throw new wf.HttpError(422, 'VALIDATION_FAILED', 'userId and password are required');
    if (r.error === 'LOCKED') throw new wf.HttpError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
    if (r.error) throw new wf.HttpError(401, 'INVALID_CREDENTIALS', 'Invalid user ID or password'); // same message for unknown user / wrong password
    res.json(r);
  }));
  app.get('/api/auth/me', need(), (req, res) => res.json({ id: req.actor.id, role: req.actor.role, exp: req.actor.exp }));
  app.post('/api/auth/logout', need(), (req, res) => { auth.revoke(req.actor); res.status(204).end(); });

  // ---- reports ----
  app.post('/api/reports', need(), h(async (req, res) => {
    const out = await wf.createReport(store, req.actor, req.body, opts);
    res.status(201).json(out);
  }));
  app.get('/api/reports', need(), (req, res) => {
    const all = store.data.reports;
    res.json(page(req, STAFF.includes(req.actor.role) ? all : all.filter((r) => r.reporterId === req.actor.id)));
  });
  app.get('/api/reports/:id', need(), (req, res, next) => {
    const r = store.data.reports.find((x) => x.id === req.params.id);
    // Non-owners get 404 (not 403) so report ids cannot be probed.
    if (!r || (!STAFF.includes(req.actor.role) && r.reporterId !== req.actor.id)) return next(new wf.HttpError(404, 'NOT_FOUND', 'Report not found'));
    res.json(r);
  });

  // ---- matches ----
  // Item details travel with each match so the person deciding (or the owner) does not have to cross-reference ids.
  const brief = (r, withReporter) => (r ? { id: r.id, category: r.category, description: r.description, location: r.location, eventDate: r.eventDate, status: r.status, ...(withReporter ? { reporterId: r.reporterId } : {}) } : null);
  const reportsById = (ids) => { const m = new Map(); for (const r of store.data.reports) if (ids.has(r.id)) m.set(r.id, r); return m; };
  app.get('/api/matches', need(), (req, res) => {
    const ms = store.data.matches;
    if (STAFF.includes(req.actor.role)) {
      const rows = page(req, ms);
      const byId = reportsById(new Set(rows.flatMap((m) => [m.lostId, m.foundId])));
      return res.json(rows.map((m) => ({ ...m, lost: brief(byId.get(m.lostId), true), found: brief(byId.get(m.foundId), true) })));
    }
    const mine = new Set(store.data.reports.filter((r) => r.reporterId === req.actor.id).map((r) => r.id));
    const rows = page(req, ms.filter((m) => mine.has(m.lostId)));
    const byId = reportsById(new Set(rows.map((m) => m.lostId)));
    // Data minimisation: claimants see their OWN report and the match outcome, never the found-item id or details, the finder, the verifier or notes.
    res.json(rows.map(({ id, lostId, score, status, createdAt }) => ({ id, lostId, score, status, createdAt, lost: brief(byId.get(lostId), false) })));
  });
  app.post('/api/matches/:id/verify', need(...STAFF), (req, res) => res.json(wf.verifyMatch(store, req.actor, req.params.id, req.body || {})));
  app.post('/api/matches/:id/release', need(...STAFF), (req, res) => res.json(wf.releaseMatch(store, req.actor, req.params.id)));

  // ---- notifications / manual queue ----
  app.get('/api/notifications', need(), (req, res) => {
    const ns = store.data.notifications;
    res.json(page(req, STAFF.includes(req.actor.role) ? ns : ns.filter((n) => n.recipientId === req.actor.id).map(({ sim, ...rest }) => rest)));
  });
  app.get('/api/manual-queue', need(...STAFF), (req, res) => res.json(page(req, store.data.manualQueue)));
  app.post('/api/manual-queue/:id/resolve', need(...STAFF), (req, res) => res.json(wf.resolveQueueItem(store, req.actor, req.params.id, req.body || {})));
  app.post('/api/manual-queue/:id/retry-notification', need(...STAFF), h(async (req, res) => {
    const q = store.data.manualQueue.find((x) => x.id === req.params.id && x.kind === 'notification_failure');
    if (!q || q.status !== 'open') throw new wf.HttpError(404, 'NOT_FOUND', 'No open notification failure with that id');
    const n = store.data.notifications.find((x) => x.id === q.refId);
    // Guard against double-clicks / concurrent operators: only a notification that has finally failed may be re-sent.
    if (!n || n.status !== 'failed_permanent') throw new wf.HttpError(409, 'IN_PROGRESS', 'This notification is already being re-sent or is no longer failed');
    n.attempts = 0; n.sim = 'ok'; // operator fixed the cause, re-run delivery
    await deliver(store, n, delivery);
    if (n.status === 'delivered') { q.status = 'resolved'; q.resolvedBy = req.actor.id; q.resolution = 'Re-sent manually'; }
    store.changed();
    res.json({ notification: n, queueItem: q });
  }));

  // ---- operations ----
  app.post('/api/jobs/aging', need('custodian'), (req, res) => {
    const override = req.body && req.body.now;
    if (override !== undefined && !config.allowTestHooks) throw new wf.HttpError(403, 'FORBIDDEN', 'Clock override is disabled');
    const now = override ? new Date(override) : clock();
    if (isNaN(now)) throw new wf.HttpError(422, 'VALIDATION_FAILED', 'now must be a valid date');
    res.json(wf.runAging(store, now));
  });
  app.get('/api/metrics', need(...STAFF), (req, res) => res.json(metrics.snapshot({ reset: req.query.reset === '1' })));
  app.get('/api/logs', need(...STAFF), (req, res) => res.json(log.recent(Number(req.query.n) || 100)));
  app.get('/api/audit', need(...STAFF), (_req, res) => res.json(store.data.audit));

  app.use((_req, _res, next) => next(new wf.HttpError(404, 'NOT_FOUND', 'Route not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') err = new wf.HttpError(400, 'BAD_JSON', 'Malformed JSON body');
    if (err.type === 'entity.too.large') err = new wf.HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
    const status = err.status || 500;
    if (status === 500) log.error('server.unhandled', { error: err.message });
    if (status === 401) res.set('WWW-Authenticate', 'Bearer');
    res.status(status).json({ error: { code: err.code || 'INTERNAL', message: status === 500 ? 'Internal server error' : err.message, details: err.details } });
  });
  return app;
}
module.exports = { createApp };
