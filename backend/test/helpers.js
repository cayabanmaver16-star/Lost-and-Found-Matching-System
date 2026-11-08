'use strict';
process.env.LOG_QUIET = '1';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Store } = require('../src/store');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { buildUserTable } = require('../src/auth');

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed', 'demo-users.json'), 'utf8')).users;
const SECRET = 'test-secret-test-secret-test-secret-0123456789';
const passwordOf = (id) => SEED.find((u) => u.id === id).password;

async function start({ env = {}, delivery = { sleep: async () => {} }, clock, store: givenStore } = {}) {
  const config = loadConfig({ JWT_SECRET: SECRET, LOGIN_IP_MAX: '1000', ...env }, () => {});
  const store = givenStore || new Store(null);
  const users = buildUserTable(SEED);
  const app = createApp(store, { config, users, delivery, clock });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokens = {};
  const raw = async (method, p, { body, headers = {}, rawBody } = {}) => {
    const res = await fetch(base + p, {
      // No keep-alive: every test starts its own server on an ephemeral port, and a pooled connection to an earlier, already closed
      // server can be reused when a later server gets the same port number, which shows up as a random "fetch failed".
      method, headers: { 'content-type': 'application/json', connection: 'close', ...headers },
      body: method === 'GET' ? undefined : rawBody !== undefined ? rawBody : body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, body: json, headers: res.headers, text };
  };
  const tokenFor = async (id) => {
    if (!tokens[id]) {
      const r = await raw('POST', '/api/auth/login', { body: { userId: id, password: passwordOf(id) } });
      tokens[id] = r.body.token;
    }
    return tokens[id];
  };
  // who: user id (logs in), null (anonymous), or {token}
  const call = async (method, p, body, who = 'stu1') => {
    const headers = {};
    if (who && typeof who === 'object') headers.authorization = `Bearer ${who.token}`;
    else if (who) headers.authorization = `Bearer ${await tokenFor(who)}`;
    return raw(method, p, { body, headers });
  };
  const close = () => { server.close(); server.closeAllConnections(); };
  open.add(close);
  return { store, config, users, app, server, base, call, raw, tokenFor, close };
}
// Safety net: a test that fails before calling close() must not keep the runner alive.
const open = new Set();
require('node:test').after(() => { for (const c of open) { try { c(); } catch { /* already closed */ } } });
module.exports = { start, SECRET, passwordOf, SEED };
