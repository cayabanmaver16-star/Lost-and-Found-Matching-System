'use strict';
// Authentication and role-based access control.
//  - Passwords: scrypt with per-user random salt, compared in constant time (hashing is justified: we must verify, never recover).
//  - Sessions: HS256-signed JWT (HMAC provides integrity/authenticity; algorithm pinned so "none"/RS swaps are rejected).
//  - Role comes ONLY from the verified token, never from request headers or body.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const log = require('./logger');

const ISSUER = 'lostfound-api';
const AUDIENCE = 'lostfound-web';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const h = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(actual, expected);
}
const DUMMY_HASH = hashPassword('dummy-password-for-timing-equalisation');

// Non-blocking verification: scrypt runs on the libuv thread pool, so a burst of logins cannot freeze the event loop
// (the synchronous version stalled every other request for ~50 ms per login).
const scryptAsync = (pw, salt, keylen, opts) => new Promise((res, rej) => crypto.scrypt(pw, salt, keylen, opts, (e, k) => (e ? rej(e) : res(k))));
async function verifyPasswordAsync(password, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(actual, expected);
}

// seedUsers: [{id, role, password}] (controlled demo data) -> in-memory user table holding only hashes.
function buildUserTable(seedUsers) {
  const t = new Map();
  for (const u of seedUsers) t.set(u.id, { id: u.id, role: u.role, passwordHash: hashPassword(u.password) });
  return t;
}

function createAuth(config, users) {
  const failures = new Map();      // userId -> {count, firstAt}
  const revoked = new Map();       // jti -> exp (seconds); logout denylist, purged once the token would have expired anyway

  const sign = (claims, opts = {}) => jwt.sign(claims, config.jwtSecret, {
    algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE, expiresIn: config.tokenTtlSec, ...opts,
  });

  function locked(id, now) {
    const f = failures.get(id);
    if (!f) return false;
    if (now - f.firstAt > config.loginWindowMs) { failures.delete(id); return false; }
    return f.count >= config.loginMaxFailures;
  }

  // Bound memory under a user-id spraying attack: drop expired windows first, then the oldest entries.
  function evictFailures(now) {
    for (const [k, v] of failures) if (now - v.firstAt > config.loginWindowMs) failures.delete(k);
    while (failures.size >= config.maxTrackedLogins) failures.delete(failures.keys().next().value);
  }

  async function login(userId, password, now = Date.now()) {
    if (typeof userId !== 'string' || typeof password !== 'string' || userId.length > 64 || password.length > 128) {
      return { error: 'BAD_REQUEST' };
    }
    if (locked(userId, now)) { log.warn('auth.locked_out', { userId }); return { error: 'LOCKED' }; }
    const user = users.get(userId);
    // Always run one scrypt so unknown users and wrong passwords take similar time (no user enumeration).
    const ok = (await verifyPasswordAsync(password, user ? user.passwordHash : DUMMY_HASH)) && !!user;
    if (!ok) {
      const f = failures.get(userId) || { count: 0, firstAt: now };
      f.count += 1;
      if (!failures.has(userId) && failures.size >= config.maxTrackedLogins) evictFailures(now);
      failures.set(userId, f);
      log.warn('auth.login_failed', { userId, failures: f.count });
      return { error: 'INVALID' };
    }
    failures.delete(userId);
    const token = sign({ sub: user.id, role: user.role }, { jwtid: crypto.randomUUID() });
    log.info('auth.login_succeeded', { userId: user.id, role: user.role });
    return { token, user: { id: user.id, role: user.role }, expiresIn: config.tokenTtlSec };
  }

  // Express middleware: sets req.actor from a verified token, or leaves it null.
  function authenticate(req, _res, next) {
    req.actor = null;
    const h = req.get('authorization') || '';
    const m = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/i.exec(h); // scheme is case-insensitive (RFC 7235)
    if (!m) { req.authFailure = h ? 'malformed' : 'missing'; return next(); }
    try {
      const c = jwt.verify(m[1], config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
      const user = users.get(c.sub);
      if (!user || user.role !== c.role) { req.authFailure = 'unknown_user'; return next(); }
      if (revoked.has(c.jti)) { req.authFailure = 'revoked'; return next(); }
      req.actor = { id: user.id, role: user.role, jti: c.jti, exp: c.exp };
    } catch (e) {
      req.authFailure = e.name === 'TokenExpiredError' ? 'expired' : 'invalid_signature_or_claims';
    }
    next();
  }
  const revoke = (actor) => {
    const nowSec = Math.floor(Date.now() / 1000);
    for (const [jti, exp] of revoked) if (exp <= nowSec) revoked.delete(jti);
    revoked.set(actor.jti, actor.exp || nowSec + config.tokenTtlSec);
    log.info('auth.logout', { userId: actor.id });
  };
  return { login, authenticate, revoke, sign, _failures: failures, _revokedSize: () => revoked.size };
}

module.exports = { hashPassword, verifyPassword, buildUserTable, createAuth, ISSUER, AUDIENCE };
