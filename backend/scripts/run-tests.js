'use strict';
// Runs every test/*.test.js file as its own node process (in parallel), with a hard per-file timeout.
// Why not plain `node --test`? During the Week 18 clean-copy verification the `node --test` child-process mode occasionally left a
// finished test process spinning at 100% CPU, so `npm test` never returned (3 times in about 35 runs; 0 times in 72 direct runs).
// A stuck file now FAILS after TEST_FILE_TIMEOUT_MS (default 180 s) instead of hanging for ever. Output ends with TAP-style totals
// ("# tests", "# pass", "# fail", "# skipped") so other tools can parse it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const dir = path.join(__dirname, '..');
const TIMEOUT = parseInt(process.env.TEST_FILE_TIMEOUT_MS, 10) || 180000;
const CONC = Math.max(2, Math.min(4, os.cpus().length - 1));
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const files = fs.readdirSync(path.join(dir, 'test')).filter((f) => f.endsWith('.test.js') && (!only.length || only.some((o) => f.includes(o)))).sort().map((f) => `test/${f}`);

function runFile(file) {
  return new Promise((resolve) => {
    const t0 = Date.now(); let out = ''; let timedOut = false;
    const child = spawn(process.execPath, [file], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, TIMEOUT);
    child.on('close', (code) => {
      clearTimeout(timer);
      const num = (k) => { const m = new RegExp(`^# ${k} (\\d+)`, 'm').exec(out); return m ? parseInt(m[1], 10) : 0; };
      resolve({ file, code, timedOut, out, seconds: ((Date.now() - t0) / 1000).toFixed(1), tests: num('tests'), pass: num('pass'), fail: num('fail'), skipped: num('skipped') });
    });
  });
}

(async () => {
  const queue = [...files]; const results = [];
  await Promise.all(Array.from({ length: CONC }, async () => { while (queue.length) results.push(await runFile(queue.shift())); }));
  results.sort((a, b) => a.file.localeCompare(b.file));
  let tests = 0; let pass = 0; let fail = 0; let skipped = 0; let bad = 0;
  for (const r of results) {
    tests += r.tests; pass += r.pass; fail += r.fail; skipped += r.skipped;
    const ok = r.code === 0 && !r.timedOut && r.fail === 0 && r.tests > 0; if (!ok) bad += 1;
    console.log(`${ok ? 'ok    ' : 'FAILED'} ${r.file}  ${r.pass}/${r.tests} pass${r.skipped ? `, ${r.skipped} skipped` : ''}  (${r.seconds}s)`);
    if (r.timedOut) console.log(`       TIMED OUT after ${TIMEOUT / 1000} s: the file finished or stalled and its process did not exit (see scripts/run-tests.js for why this runner exists)`);
    if (!ok) { const lines = r.out.split('\n').filter((l) => /^not ok|^\s+error:|^\s+(expected|actual):|AssertionError|Error:/.test(l)).slice(0, 12); lines.forEach((l) => console.log('       ' + l.trim().slice(0, 200))); }
  }
  console.log(`\n# tests ${tests}\n# pass ${pass}\n# fail ${fail + bad - results.filter((r) => r.fail > 0).length}\n# skipped ${skipped}`);
  process.exit(bad ? 1 : 0);
})();
