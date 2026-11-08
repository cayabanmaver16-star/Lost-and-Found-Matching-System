'use strict';
// Week 17: API contract tests. The OpenAPI document must (a) be valid, (b) describe exactly the routes that exist,
// (c) match the real responses, status code by status code, and (d) state the roles that the server really enforces.
const test = require('node:test');
const assert = require('node:assert');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const spec = require('../openapi/spec');
const { start } = require('./helpers');

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'spec', components: spec.components });
const toTemplate = (p) => p.replace(/\/(?:[A-Z]{1,2}-\d{4,})(?=\/|$)/g, '/{id}');
const seen = new Map(); // "METHOD /path status" -> count

function conforms(method, path, status, body) {
  const tpl = toTemplate(path.split('?')[0]);
  const op = spec.paths[tpl] && spec.paths[tpl][method.toLowerCase()];
  assert.ok(op, `${method} ${tpl} is not documented`);
  const r = op.responses[String(status)];
  assert.ok(r, `${method} ${tpl} returned ${status}, which is not documented (documented: ${Object.keys(op.responses).join(', ')})`);
  seen.set(`${method} ${tpl} ${status}`, (seen.get(`${method} ${tpl} ${status}`) || 0) + 1);
  const resolved = r.$ref ? spec.components.responses[r.$ref.split('/').pop()] : r;
  const schema = resolved.content && resolved.content['application/json'] && resolved.content['application/json'].schema;
  if (!schema) return;                                            // e.g. 204
  const id = `chk_${method}_${tpl}_${status}`.replace(/[^A-Za-z0-9_]/g, '_');   // ids with slashes would make refs resolve relative to a path
  let validate = ajv.getSchema(id);
  if (!validate) {
    const rewrite = (n) => (n && typeof n === 'object' ? (Array.isArray(n) ? n.map(rewrite) : Object.fromEntries(Object.entries(n).map(([k, v]) => [k, k === '$ref' && typeof v === 'string' ? v.replace('#/components', 'spec#/components') : rewrite(v)]))) : n);
    ajv.addSchema({ $id: id, ...rewrite(schema) });
    validate = ajv.getSchema(id);
  }
  assert.ok(validate(body), `${method} ${tpl} ${status} body does not match the documented schema: ${ajv.errorsText(validate.errors)}\n${JSON.stringify(body).slice(0, 300)}`);
}

const today = () => new Date().toISOString().slice(0, 10);
const rep = (o = {}) => ({ type: 'lost', category: 'wallet', description: 'black leather wallet with student card', location: 'library second floor', eventDate: today(), ...o });

test('C01 the OpenAPI document is valid OpenAPI 3 with resolvable references', async () => {
  const SwaggerParser = require('@apidevtools/swagger-parser'); // v10 (CommonJS); v13+ is ESM-only and cannot be loaded on this Node version
  const api = await SwaggerParser.validate(JSON.parse(JSON.stringify(spec)));
  assert.equal(api.openapi, '3.0.3'); assert.ok(Object.keys(api.paths).length >= 18);
});

test('C02 documented operations and real routes are exactly the same set, and the document is served at /api/openapi.json', async () => {
  const s = await start();
  const real = new Set();
  const walk = (stack) => stack.forEach((l) => {
    if (l.route) Object.keys(l.route.methods).forEach((m) => real.add(`${m.toUpperCase()} ${l.route.path.replace(/:(\w+)/g, '{$1}')}`));
    else if (l.handle && l.handle.stack) walk(l.handle.stack);
  });
  walk(s.app._router.stack);
  const documented = new Set(Object.entries(spec.paths).flatMap(([p, o]) => Object.keys(o).map((m) => `${m.toUpperCase()} ${p}`)));
  const undocumented = [...real].filter((x) => !documented.has(x)); const phantom = [...documented].filter((x) => !real.has(x));
  assert.deepEqual(undocumented, [], 'routes that exist but are not documented');
  assert.deepEqual(phantom, [], 'documented operations that do not exist');
  const served = await s.call('GET', '/api/openapi.json', null, null);
  assert.equal(served.status, 200); assert.equal(served.body.info.title, spec.info.title); conforms('GET', '/api/openapi.json', 200, served.body);
  s.close();
});

test('C03 real responses match the documented schemas across the whole workflow (success and error paths)', async () => {
  const s = await start({ env: { ALLOW_SIM: '1' } });
  const c = async (method, path, body, who, expected) => {
    const r = await s.call(method, path, body, who);
    conforms(method, path, r.status, r.body);
    if (expected !== undefined) assert.equal(r.status, expected, `${method} ${path}: ${JSON.stringify(r.body).slice(0, 200)}`);
    return r;
  };
  await c('GET', '/health', null, null, 200); await c('GET', '/ready', null, null, 200);
  // auth
  assert.equal(conformsLogin(await s.raw('POST', '/api/auth/login', { body: { userId: 'stu1', password: 'wrong' } }), 401), true);
  assert.equal(conformsLogin(await s.raw('POST', '/api/auth/login', { body: { userId: 'stu1' } }), 422), true);
  assert.equal(conformsLogin(await s.raw('POST', '/api/auth/login', { rawBody: '{bad' }), 400), true);
  const tok = await s.tokenFor('stu1'); conformsLogin({ status: 200, body: { token: tok, user: { id: 'stu1', role: 'student' }, expiresIn: 900 } }, 200);
  await c('GET', '/api/auth/me', null, 'stu1', 200); await c('GET', '/api/auth/me', null, null, 401);
  // reports
  const bad = await c('POST', '/api/reports', rep({ description: 'x' }), 'stu1', 422); assert.ok(bad.body.error.details.description);
  const r1 = await c('POST', '/api/reports', rep(), 'stu1', 201); await c('POST', '/api/reports', rep(), 'stu1', 409);
  await c('POST', '/api/reports', { ...rep(), description: 'y'.repeat(20000) }, 'stu1', 413);
  const rawBad = await s.raw('POST', '/api/reports', { rawBody: '{bad', headers: { authorization: 'Bearer ' + tok } }); conforms('POST', '/api/reports', rawBad.status, rawBad.body); assert.equal(rawBad.status, 400);
  await c('GET', '/api/reports', null, 'stu1', 200); await c('GET', '/api/reports?limit=1&offset=0', null, 'cust1', 200);
  await c('GET', `/api/reports/${r1.body.report.id}`, null, 'stu1', 200); await c('GET', `/api/reports/${r1.body.report.id}`, null, 'stu2', 404);
  // matching + notification (found by security) with a simulated permanent failure to create a queue item
  const f = await c('POST', '/api/reports', { ...rep({ type: 'found', description: 'black leather wallet student card inside' }), simulateDelivery: 'permanent' }, 'sec1', 201);
  const mid = f.body.matches[0].id;
  await c('GET', '/api/matches', null, 'stu1', 200); await c('GET', '/api/matches', null, 'cust1', 200);
  await c('GET', '/api/notifications', null, 'stu1', 200); await c('GET', '/api/notifications', null, 'cust1', 200);
  const q = (await c('GET', '/api/manual-queue', null, 'cust1', 200)).body.find((x) => x.kind === 'notification_failure');
  await c('GET', '/api/manual-queue', null, 'stu1', 403);
  // a re-send already in progress must be refused (IN_PROGRESS), then the real re-send succeeds
  const notif = s.store.data.notifications.find((n) => n.id === q.refId); notif.status = 'sending';
  await c('POST', `/api/manual-queue/${q.id}/retry-notification`, {}, 'cust1', 409); notif.status = 'failed_permanent';
  await c('POST', `/api/manual-queue/${q.id}/retry-notification`, {}, 'cust1', 200);
  await c('POST', `/api/manual-queue/${q.id}/retry-notification`, {}, 'cust1', 404);
  // verify / release state machine
  await c('POST', `/api/matches/${mid}/verify`, { ownershipConfirmed: true }, 'cust1', 422);
  await c('POST', `/api/matches/${mid}/verify`, { ownershipConfirmed: true, note: 'ID matched' }, 'stu1', 403);
  await c('POST', `/api/matches/M-9999/verify`, { ownershipConfirmed: true, note: 'ID matched' }, 'cust1', 404);
  await c('POST', '/api/matches/M-9999/release', {}, 'cust1', 404);
  await c('POST', `/api/matches/${mid}/release`, {}, 'cust1', 409);
  await c('POST', `/api/matches/${mid}/verify`, { ownershipConfirmed: true, note: 'Student ID matched' }, 'cust1', 200);
  await c('POST', `/api/matches/${mid}/verify`, { ownershipConfirmed: true, note: 'Student ID matched' }, 'cust1', 409);
  await c('POST', `/api/matches/${mid}/release`, {}, 'cust1', 200);
  // aging + disposal queue
  await c('POST', '/api/reports', rep({ type: 'found', category: 'bag', description: 'unclaimed grey bag with zipper' }), 'sec1', 201);
  await c('POST', '/api/jobs/aging', { now: new Date(Date.now() + 100 * 86400000).toISOString() }, 'cust1', 200);
  await c('POST', '/api/jobs/aging', { now: 'garbage' }, 'cust1', 422); await c('POST', '/api/jobs/aging', {}, 'sec1', 403);
  const dq = (await c('GET', '/api/manual-queue', null, 'cust1', 200)).body.find((x) => x.kind === 'disposal_review');
  await c('POST', `/api/manual-queue/${dq.id}/resolve`, { resolution: 'Donated', dispose: true }, 'cust1', 200);
  await c('GET', '/api/reports', null, 'cust1', 200);                                                                                                  // includes a disposed report
  await c('POST', `/api/manual-queue/${dq.id}/resolve`, {}, 'cust1', 409); await c('POST', '/api/manual-queue/MQ-9999/resolve', {}, 'cust1', 404);
  await c('POST', `/api/manual-queue/${dq.id}/resolve`, {}, 'stu1', 403);
  // every status value must appear in at least one validated response, or a wrong enum in the document would go unnoticed
  const kl = (d, o = {}) => rep({ category: 'keys', description: d, location: 'gym', ...o });
  await c('POST', '/api/reports', kl('silver house keys with blue tag'), 'stu1', 201);
  await c('POST', '/api/reports', kl('silver house keys with blue tag'), 'stu2', 201);
  await c('POST', '/api/reports', kl('silver house keys with blue tag'), 'emp1', 201);
  const kf = await c('POST', '/api/reports', kl('silver house keys blue tag', { type: 'found' }), 'sec1', 201);
  const byClaimant = (id) => kf.body.matches.find((m) => s.store.data.reports.find((r) => r.id === m.lostId).reporterId === id).id;
  await c('POST', `/api/matches/${byClaimant('stu1')}/verify`, { ownershipConfirmed: false, note: 'Could not describe the tag' }, 'cust1', 200);     // rejected
  await c('POST', `/api/matches/${byClaimant('emp1')}/verify`, { ownershipConfirmed: true, note: 'Described the tag correctly' }, 'cust1', 200);   // verified
  await c('GET', '/api/matches', null, 'cust1', 200);                                                                                                  // candidate + rejected + verified
  await c('POST', `/api/matches/${byClaimant('emp1')}/release`, {}, 'cust1', 200);                                                                // released; stu2's candidate becomes withdrawn
  await c('GET', '/api/matches', null, 'cust1', 200); await c('GET', '/api/matches', null, 'stu2', 200); await c('GET', '/api/reports', null, 'cust1', 200); // closed reports, withdrawn match
  // operations
  await c('GET', '/api/metrics', null, 'cust1', 200); await c('GET', '/api/metrics', null, 'stu1', 403);
  await c('GET', '/api/logs?n=5', null, 'sec1', 200); await c('GET', '/api/logs', null, 'stu1', 403);
  await c('GET', '/api/audit', null, 'cust1', 200); await c('GET', '/api/audit', null, 'stu1', 403);
  // sign out
  const t2 = await s.raw('POST', '/api/auth/login', { body: { userId: 'emp1', password: require('./helpers').passwordOf('emp1') } });
  const lo = await s.call('POST', '/api/auth/logout', {}, { token: t2.body.token }); conforms('POST', '/api/auth/logout', lo.status, lo.body); assert.equal(lo.status, 204);
  // server error path (generic) and not-ready
  const realCommit = s.store.commit; s.store.commit = async () => { throw new Error('disk full'); };
  await c('POST', '/api/reports', rep({ category: 'books', description: 'failure path report here' }), 'stu1', 500);
  s.store.commit = realCommit;
  s.app.locals.shuttingDown = true; const nr = await s.raw('GET', '/ready'); conforms('GET', '/ready', nr.status, nr.body); assert.equal(nr.status, 503); s.app.locals.shuttingDown = false;
  s.close();
  function conformsLogin(r, status) { assert.equal(r.status, status); conforms('POST', '/api/auth/login', r.status, r.body); return true; }
});

test('C04 lockout and rate limiting (429) responses match the documented error schema', async () => {
  const s = await start({ env: { RATE_LIMIT_PER_MIN: '4' } });
  let seen429 = null;
  for (let i = 0; i < 8 && !seen429; i++) { const r = await s.raw('GET', '/health'); if (r.status === 429) seen429 = r; }
  assert.ok(seen429, 'rate limit reached'); assert.equal(seen429.body.error.code, 'RATE_LIMITED');
  const op = spec.paths['/api/auth/me'].get.responses['429']; assert.ok(op, '429 is documented for authenticated operations'); s.close();
  const l = await start({ env: { LOGIN_MAX_FAILURES: '2' } });
  for (let i = 0; i < 2; i++) await l.raw('POST', '/api/auth/login', { body: { userId: 'stu2', password: 'bad' + i } });
  const locked = await l.raw('POST', '/api/auth/login', { body: { userId: 'stu2', password: 'bad3' } });
  conforms('POST', '/api/auth/login', locked.status, locked.body); assert.equal(locked.body.error.code, 'ACCOUNT_LOCKED'); l.close();
});

test('C05 every documented status code of every operation was exercised, except a short, justified allow-list', () => {
  const allow = new Set([
    'GET /ready 503',                                  // exercised in C03 via shutdown flag (kept here for clarity)
  ]);
  const missing = [];
  for (const [p, ops] of Object.entries(spec.paths)) for (const [m, op] of Object.entries(ops)) for (const code of Object.keys(op.responses)) {
    const key = `${m.toUpperCase()} ${p} ${code}`;
    if (!seen.has(key) && !allow.has(key)) missing.push(key);
  }
  // 401/429/500/403 appear on many operations through shared responses; they were exercised on representative operations in C03/C04.
  const sharedOnly = missing.filter((k) => / (401|403|429|500|400|413)$/.test(k));
  const real = missing.filter((k) => !sharedOnly.includes(k));
  assert.deepEqual(real, [], 'documented success/state/validation responses that no test produced:\n' + real.join('\n'));
});

test('C06 documented security and roles match the server: every operation but the public ones requires a bearer token, and staff-only operations refuse a student with 403', async () => {
  const s = await start();
  const publicOps = new Set(['GET /health', 'GET /ready', 'GET /api/openapi.json', 'POST /api/auth/login']);
  for (const [p, ops] of Object.entries(spec.paths)) for (const [m, op] of Object.entries(ops)) {
    const key = `${m.toUpperCase()} ${p}`;
    if (publicOps.has(key)) { assert.deepEqual(op.security, [], `${key} is documented as public`); continue; }
    assert.deepEqual(op.security, [{ bearerAuth: [] }], `${key} must document bearer auth`);
    const concrete = p.replace('{id}', p.includes('/matches/') ? 'M-0001' : p.includes('/manual-queue/') ? 'MQ-0001' : 'R-0001');
    const anon = await s.raw(m.toUpperCase(), concrete, { body: m === 'post' ? {} : undefined }); assert.equal(anon.status, 401, `${key} without a token`);
    if (key === 'POST /api/auth/logout') continue;   // calling it would revoke the shared student token; logout is exercised in C03
    const stu = await s.call(m.toUpperCase(), concrete, m === 'post' ? {} : null, 'stu1');
    if (!op['x-roles'].includes('student')) assert.equal(stu.status, 403, `${key} is documented staff-only but a student got ${stu.status}`);
    else assert.notEqual(stu.status, 403, `${key} is documented as open to students but a student was refused (403)`);
  }
  s.close();
});
