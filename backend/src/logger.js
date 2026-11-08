'use strict';
// Structured JSON logs with defensive redaction. Callers should only pass ids/counts/reasons;
// the redactor is a safety net so a mistake can never write credentials or tokens to a log.
const lines = [];
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|jwt|hash|description|contact|email|phone/i;
const JWT_LIKE = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;

function clean(v, depth = 0) {
  if (typeof v === 'string') return v.replace(JWT_LIKE, '[REDACTED_TOKEN]').slice(0, 300);
  if (v && typeof v === 'object' && depth < 3) {
    const out = Array.isArray(v) ? [] : {};
    for (const [k, val] of Object.entries(v)) out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : clean(val, depth + 1);
    return out;
  }
  return v;
}

function log(level, event, fields = {}) {
  const entry = { ts: new Date().toISOString(), level, event, ...clean(fields) };
  lines.push(entry);
  if (lines.length > 500) lines.shift();
  if (process.env.LOG_QUIET !== '1') console.log(JSON.stringify(entry));
  return entry;
}
module.exports = {
  info: (e, f) => log('info', e, f),
  warn: (e, f) => log('warn', e, f),
  error: (e, f) => log('error', e, f),
  recent: (n = 100) => lines.slice(-Math.min(Math.max(n, 1), 500)),
  clear: () => { lines.length = 0; },
};
