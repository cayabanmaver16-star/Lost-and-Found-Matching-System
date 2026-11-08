'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
// Optional local .env (never committed). Real deployments inject real environment variables.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined && m[2] !== '') process.env[m[1]] = m[2];
  }
}
const { loadConfig } = require('./config');
const { Store } = require('./store');
const { createApp } = require('./app');
const { buildUserTable } = require('./auth');
const { runAging } = require('./workflow');
const { createShutdown } = require('./lifecycle');
const log = require('./logger');

const config = loadConfig();
const store = new Store(process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json'));
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed', 'demo-users.json'), 'utf8'));
const users = buildUserTable(seed.users);

// Event-driven: matching + notification run when a report is created.
// Scheduled: aging job runs hourly (and on demand via POST /api/jobs/aging for custodians).
setInterval(() => { try { runAging(store); store.commit().catch((e) => log.error('aging.commit_failed', { error: e.message })); } catch (e) { log.error('aging.job_failed', { error: e.message }); } }, 60 * 60 * 1000).unref();

const app = createApp(store, { config, users });
const server = config.tls ? https.createServer(config.tls, app) : http.createServer(app);
server.listen(config.port, () => log.info('server.started', { port: config.port, https: !!config.tls, env: config.prod ? 'production' : 'development' }));

const shutdown = createShutdown({ server, app, store });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => shutdown(sig));
