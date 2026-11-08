'use strict';
// Run this 30-60 minutes before the defence and again just before you start:  node demo/preflight.js
// Prints GO / NO-GO with the reason for each failed check. Exit code 1 on NO-GO.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const results = [];
const check = (name, ok, detail = '', fix = '') => { results.push({ name, ok, detail, fix }); console.log(`${ok ? '[ok]  ' : '[FAIL]'} ${name}${detail ? '  -  ' + detail : ''}${!ok && fix ? '\n         fix: ' + fix : ''}`); };
const portFree = (port) => new Promise((resolve) => { const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true))).listen(port, '127.0.0.1'); });

(async () => {
  console.log('PREFLIGHT for the Lost & Found defence\n');
  const major = parseInt(process.versions.node.split('.')[0], 10);
  check('Node.js 20 or newer', major >= 20, process.version, 'install Node 20 LTS');
  const demoJs = path.join(ROOT, 'app', 'build', 'demo', 'main.dart.js');
  check('Demo web build exists', fs.existsSync(demoJs), fs.existsSync(demoJs) ? `${(fs.statSync(demoJs).size / 1048576).toFixed(1)} MB main.dart.js` : '', 'cd app && flutter build web --dart-define=API_BASE=http://localhost:3000 --dart-define=DEMO_TOOLS=true --output "<full path>/app/build/demo"');
  if (fs.existsSync(demoJs)) {
    const js = fs.readFileSync(demoJs, 'utf8');
    check('Demo build has the failure simulator (needed for the retry story)', js.includes('Demo: simulate notification delivery'), '', 'rebuild with --dart-define=DEMO_TOOLS=true');
    check('Demo build has the newest screens (item details, proof dialog)', js.includes('Confirm ownership') && js.includes('Your lost item'), '', 'rebuild the demo build from the current source');
    check('Demo build points at the demo API (http://localhost:3000)', js.includes('http://localhost:3000'), '', 'rebuild with --dart-define=API_BASE=http://localhost:3000');
  }
  check('Dependencies installed (api/node_modules)', fs.existsSync(path.join(ROOT, 'api', 'node_modules', 'express')), '', 'cd api && npm install');
  check('Test accounts file present', fs.existsSync(path.join(ROOT, 'api', 'seed', 'demo-users.json')));
  for (const port of [3000, 8080]) check(`Port ${port} is free`, await portFree(port), '', `close whatever uses port ${port} (an earlier demo?) - on Windows: netstat -ano | findstr :${port}`);
  const freeGb = os.freemem() / 2 ** 30; check('At least 1 GB free memory', freeGb > 1, `${freeGb.toFixed(1)} GB free`, 'close other applications');
  check('Fallback evidence pack present (screens, diagrams, UAT results)', ['docs/w17/screens', 'docs/w17/diagrams/architecture.png', 'docs/w17/uat-results-after-fixes.md'].every((p) => fs.existsSync(path.join(ROOT, p))), '', 'restore docs/w17 from the submission bundle');
  console.log('\nRunning the narrated rehearsal (about 10 s) as a smoke test of the whole story ...');
  const r = spawnSync(process.execPath, ['demo/rehearse.js'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const last = (r.stdout || '').split('\n').filter((l) => /^Summary:/.test(l))[0] || (r.stderr || '').slice(0, 200);
  check('Narrated rehearsal passes every check', r.status === 0, last, 'run  node demo/rehearse.js  and read the first [FAIL] line');
  const bad = results.filter((x) => !x.ok);
  console.log(`\n${bad.length ? 'NO-GO' : 'GO'}: ${results.length - bad.length} of ${results.length} checks passed.`);
  if (!bad.length) console.log('Next:  node demo/start-demo.js --seed   (then open http://localhost:8080 in three tabs)');
  process.exit(bad.length ? 1 : 0);
})();
