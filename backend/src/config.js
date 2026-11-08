'use strict';
// Protected configuration: every secret comes from the environment, never from source control.
// Production fails fast if a required secret is missing or weak.
const crypto = require('crypto');
const fs = require('fs');

function int(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; }

function loadConfig(env = process.env, warn = (m) => console.warn(m)) {
  const prod = env.NODE_ENV === 'production';
  let secret = env.JWT_SECRET;
  if (!secret) {
    if (prod) throw new Error('JWT_SECRET is required when NODE_ENV=production');
    secret = crypto.randomBytes(48).toString('hex'); // dev only: tokens die on restart
    warn('[config] JWT_SECRET not set - using a random per-process development secret');
  }
  if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  const tls = env.TLS_KEY_FILE && env.TLS_CERT_FILE
    ? { key: fs.readFileSync(env.TLS_KEY_FILE), cert: fs.readFileSync(env.TLS_CERT_FILE) }
    : null;
  if (prod && !tls && env.TRUST_PROXY_TLS !== '1') throw new Error('Production requires TLS_KEY_FILE/TLS_CERT_FILE (or TRUST_PROXY_TLS=1 behind a TLS-terminating proxy)');
  return Object.freeze({
    prod,
    port: int(env.PORT, 3000),
    jwtSecret: secret,
    tokenTtlSec: int(env.TOKEN_TTL_SEC, 900),
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:8080,http://localhost:5000').split(',').map((s) => s.trim()).filter(Boolean),
    tls,
    // Test hooks (simulated delivery outcome, aging "now" override) are never honoured in production.
    allowTestHooks: !prod && env.ALLOW_SIM !== '0',
    loginMaxFailures: int(env.LOGIN_MAX_FAILURES, 5),
    loginWindowMs: int(env.LOGIN_WINDOW_MS, 15 * 60 * 1000),
    globalRatePerMin: int(env.RATE_LIMIT_PER_MIN, 300),
    loginIpMax: int(env.LOGIN_IP_MAX, 30),
    maxTrackedLogins: int(env.MAX_TRACKED_LOGINS, 10000),
    slowRequestMs: int(env.SLOW_REQUEST_MS, 1000),
    // Number of reverse-proxy hops in front of the API (0 = none). Needed so rate limits use the real client IP, not the proxy's.
    trustProxy: parseInt(env.TRUST_PROXY, 10) > 0 ? parseInt(env.TRUST_PROXY, 10) : 0,
  });
}
module.exports = { loadConfig };
