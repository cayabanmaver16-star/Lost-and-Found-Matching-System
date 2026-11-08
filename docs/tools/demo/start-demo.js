'use strict';
// One command to start everything needed for the live demonstration:
//   node demo/start-demo.js            fresh data (the main story starts from an empty system)
//   node demo/start-demo.js --seed     fresh data plus a little history (lists are not empty; one failed notice waits in the manual queue)
//   node demo/start-demo.js --keep     reuse the data from the last run
// Serves the demo build of the web app on http://localhost:8080 and the API on http://localhost:3000. Ctrl+C stops both.
const fs = require('fs');
const path = require('path');
const net = require('net');
const lib = require('../perf/lib');
const { createStaticServer } = require('../scripts/static-server');
const { seed } = require('./seed');

const ROOT = path.join(__dirname, '..');
const WORK = path.join(__dirname, 'work');
const BUILD = path.join(ROOT, 'app', 'build', 'demo');
const args = new Set(process.argv.slice(2));
const API_PORT = 3000; const WEB_PORT = 8080;
const accounts = JSON.parse(fs.readFileSync(path.join(ROOT, 'api', 'seed', 'demo-users.json'), 'utf8')).users;

const portFree = (port) => new Promise((resolve) => { const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true))).listen(port, '127.0.0.1'); });

(async () => {
  if (!fs.existsSync(path.join(BUILD, 'main.dart.js'))) {
    console.error('The demo build is missing. Create it with:\n  cd app && flutter build web --dart-define=API_BASE=http://localhost:3000 --dart-define=DEMO_TOOLS=true --output "' + BUILD.replace(/\\/g, '/') + '"');
    process.exit(1);
  }
  for (const port of [API_PORT, WEB_PORT]) if (!(await portFree(port))) { console.error(`Port ${port} is already in use. Close what is using it (an earlier demo, a dev server) and try again.`); process.exit(1); }
  fs.mkdirSync(WORK, { recursive: true });
  const dataFile = path.join(WORK, 'demo-db.json');
  if (!args.has('--keep')) for (const f of [dataFile, dataFile + '.bak', dataFile + '.tmp']) fs.rmSync(f, { force: true });

  const srv = await lib.startServer({
    label: 'demo', port: API_PORT, dataFile,
    extraEnv: { CORS_ORIGINS: `http://localhost:${WEB_PORT}`, ALLOW_SIM: '1', LOGIN_MAX_FAILURES: '5', LOGIN_IP_MAX: '100', RATE_LIMIT_PER_MIN: '1000', SLOW_REQUEST_MS: '500' },
  });
  const web = createStaticServer(BUILD);
  process.stdout.write('Preparing the web app files (pre-compressing, a few seconds)... ');
  await web.warm();
  console.log('done');
  await new Promise((r) => web.listen(WEB_PORT, r));
  if (args.has('--seed')) { await seed(srv.base); console.log('History seeded.'); }

  const pw = (id) => accounts.find((a) => a.id === id).password;
  console.log(`
=====================  LOST & FOUND DEMO IS RUNNING  =====================
  App (open in 3 tabs):   http://localhost:${WEB_PORT}
  API:                    http://localhost:${API_PORT}     (health: /health, ready: /ready, contract: /api/openapi.json)
  API log file:           ${srv.logFile}

  Test-only accounts (fictional):
    student    stu1   ${pw('stu1')}        (second student: stu2   ${pw('stu2')})
    security   sec1   ${pw('sec1')}
    custodian  cust1  ${pw('cust1')}

  Tip: sign in as stu1, sec1 and cust1 in three separate tabs before you start talking.
  Fallback if the screen misbehaves:   node demo/rehearse.js --pace 2500
  Stop everything:                     Ctrl+C
==========================================================================`);
  const stop = async () => { console.log('\nStopping demo...'); web.close(); web.closeAllConnections && web.closeAllConnections(); await lib.stopServer(srv); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
})().catch((e) => { console.error('Could not start the demo:', e.message); process.exit(1); });
