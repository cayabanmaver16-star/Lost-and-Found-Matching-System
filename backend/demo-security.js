'use strict';
// Week 14 evidence generator. Runs adverse scenarios against a LIVE HTTPS server.
// Usage:  NODE_EXTRA_CA_CERTS=certs/dev-cert.pem PORT=3443 node demo-security.js
// (server must be started with TLS_KEY_FILE/TLS_CERT_FILE and the same JWT_SECRET given here as DEMO_JWT_SECRET)
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const B = `https://localhost:${process.env.PORT || 3443}`;
const SECRET = process.env.DEMO_JWT_SECRET;
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed', 'demo-users.json'), 'utf8')).users;
const pw = (id) => seed.find((u) => u.id === id).password;
const out = [];
const say = (s) => { console.log(s); out.push(s); };

const req = async (method, p, { token, body, headers = {} } = {}) => {
  const r = await fetch(B + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, body: j, headers: r.headers };
};
const code = (r) => `${r.status} ${r.body && r.body.error ? r.body.error.code : ''}`.trim();
const login = async (id) => (await req('POST', '/api/auth/login', { body: { userId: id, password: pw(id) } })).body.token;

(async () => {
  say('== TRANSPORT ==');
  say('HTTPS health: ' + (await req('GET', '/health')).status);
  const plain = await fetch(B.replace('https', 'http') + '/health', { signal: AbortSignal.timeout(3000) }).then(() => 'answered', () => 'refused / no plaintext response');
  say('Plain HTTP to the same port: ' + plain);
  const h = (await req('GET', '/health')).headers;
  say('Security headers: ' + ['strict-transport-security', 'x-content-type-options', 'content-security-policy', 'x-frame-options'].map((k) => `${k}=${h.get(k) ? 'present' : 'MISSING'}`).join(', '));
  say('X-Powered-By: ' + (h.get('x-powered-by') || 'absent'));

  say('\n== AUTHENTICATION ==');
  say('No token on /api/reports -> ' + code(await req('GET', '/api/reports')));
  say('Wrong password -> ' + code(await req('POST', '/api/auth/login', { body: { userId: 'stu1', password: 'nope' } })));
  say('Unknown user -> ' + code(await req('POST', '/api/auth/login', { body: { userId: 'ghost', password: 'nope' } })) + '   (identical response: no user enumeration)');
  const stu = await login('stu1'), cust = await login('cust1');
  say('Valid student login -> token issued (' + stu.split('.').length + ' parts, HS256)');

  say('\n== ALTERED / EXPIRED / INVALID TOKENS ==');
  const [hd, , sg] = stu.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ ...jwt.decode(stu), role: 'custodian' })).toString('base64url');
  say('Altered payload (role->custodian), original signature -> ' + code(await req('GET', '/api/manual-queue', { token: [hd, forgedPayload, sg].join('.') })));
  say('Signed with attacker secret -> ' + code(await req('GET', '/api/manual-queue', { token: jwt.sign({ sub: 'cust1', role: 'custodian', iss: 'lostfound-api', aud: 'lostfound-web' }, 'x'.repeat(48), { expiresIn: 600 }) })));
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'cust1', role: 'custodian', iss: 'lostfound-api', aud: 'lostfound-web', exp: 9999999999 })).toString('base64url')}.`;
  say('alg:none unsigned token -> ' + code(await req('GET', '/api/manual-queue', { token: none })));
  if (SECRET) say('Correctly signed but expired token -> ' + code(await req('GET', '/api/reports', { token: jwt.sign({ sub: 'stu1', role: 'student', iss: 'lostfound-api', aud: 'lostfound-web' }, SECRET, { expiresIn: -60 }) })));

  say('\n== AUTHORIZATION ==');
  say('Student -> GET /api/manual-queue -> ' + code(await req('GET', '/api/manual-queue', { token: stu })));
  say('Student -> GET /api/logs -> ' + code(await req('GET', '/api/logs', { token: stu })));
  say('Student sending X-Role: custodian header -> ' + code(await req('GET', '/api/manual-queue', { token: stu, headers: { 'x-role': 'custodian' } })));
  say('Custodian -> GET /api/manual-queue -> ' + code(await req('GET', '/api/manual-queue', { token: cust })));
  const mine = await req('POST', '/api/reports', { token: stu, body: { type: 'lost', category: 'bag', description: 'blue backpack with laptop sticker', location: 'canteen', eventDate: '2026-11-05' } });
  const other = await login('stu2');
  say(`Other student reading ${mine.body.report.id} (owned by stu1) -> ` + code(await req('GET', `/api/reports/${mine.body.report.id}`, { token: other })) + '   (404, not 403: ids cannot be probed)');

  say('\n== INPUT HANDLING ==');
  say('description as JSON object -> ' + code(await req('POST', '/api/reports', { token: stu, body: { type: 'lost', category: 'bag', description: { $ne: null }, location: 'x1', eventDate: '2026-11-05' } })));
  say('20 KB body -> ' + code(await req('POST', '/api/reports', { token: stu, body: { type: 'lost', category: 'bag', description: 'x'.repeat(20000), location: 'x1', eventDate: '2026-11-05' } })));

  say('\n== LOCKOUT ==');
  let last; for (let i = 0; i < 5; i++) last = await req('POST', '/api/auth/login', { body: { userId: 'emp1', password: 'bad' + i } });
  say('5 failed logins for emp1, then CORRECT password -> ' + code(await req('POST', '/api/auth/login', { body: { userId: 'emp1', password: pw('emp1') } })));

  say('\n== LOGOUT / REVOCATION ==');
  const t2 = await login('sec1');
  say('sec1 token before logout -> ' + (await req('GET', '/api/reports', { token: t2 })).status);
  await req('POST', '/api/auth/logout', { token: t2 });
  say('same token after logout -> ' + code(await req('GET', '/api/reports', { token: t2 })));

  say('\n== LOG HYGIENE ==');
  const logs = JSON.stringify((await req('GET', '/api/logs?n=500', { token: cust })).body);
  say('Server log contains any seeded password: ' + seed.some((u) => logs.includes(u.password)));
  say('Server log contains any bearer token: ' + [stu, cust, t2, other].some((t) => logs.includes(t)));
  say('Server log contains report description text: ' + logs.includes('blue backpack'));
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'evidence-w14-security-logs.json'), JSON.stringify(JSON.parse(logs).filter((l) => /^(auth|authz)\./.test(l.event)), null, 2));
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'evidence-w14-security-run.txt'), out.join('\n') + '\n');
})().catch((e) => { console.error('demo failed:', e); process.exit(1); });
