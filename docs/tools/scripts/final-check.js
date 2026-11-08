'use strict';
// Final delivery check: every quality gate, a secrets scan, the deliverables checklist. Writes docs/w18/final-check.json and
// docs/w18/FINAL_DELIVERY_CHECK.md. Exit code 1 if anything fails.
//   node scripts/final-check.js          everything (about 4 minutes)
//   node scripts/final-check.js --quick  skips the slow gates (Flutter, scripted UAT, contract mutation check)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const QUICK = process.argv.includes('--quick');
const flutterBin = process.env.FLUTTER_BIN || 'C:/develop/flutter/bin';
const env = { ...process.env, PATH: `${process.env.PATH}${path.delimiter}${flutterBin}` };
const results = [];
function gate(name, fn) {
  const t0 = Date.now(); let r;
  try { r = fn(); } catch (e) { r = { ok: false, detail: `error: ${e.message}` }; }
  r.name = name; r.seconds = +((Date.now() - t0) / 1000).toFixed(1); results.push(r);
  console.log(`${r.ok ? '[ok]  ' : '[FAIL]'} ${name}  -  ${r.detail}  (${r.seconds}s)`);
}
const sh = (cmd, args, cwd, timeout = 600000) => spawnSync(cmd, args, { cwd, env, encoding: 'utf8', shell: process.platform === 'win32' && cmd !== process.execPath, timeout, maxBuffer: 64 * 1024 * 1024 });
const out = (r) => (r.stdout || '') + (r.stderr || '');
const num = (s, re) => { const m = re.exec(s); return m ? parseInt(m[1], 10) : null; };
const meta = {};

gate('API tests (functional, security, hardening, operability, performance, acceptance, contract, static host)', () => {
  const r = sh('npm', ['test'], path.join(ROOT, 'api')); const o = out(r);
  const tests = num(o, /# tests (\d+)/), pass = num(o, /# pass (\d+)/), fail = num(o, /# fail (\d+)/);
  meta.apiTests = tests; return { ok: r.status === 0 && fail === 0 && tests > 0, detail: `${pass} of ${tests} pass` };
});
if (!QUICK) {
  gate('Flutter analyzer', () => { const r = sh('flutter', ['analyze'], path.join(ROOT, 'app')); return { ok: /No issues found/.test(out(r)), detail: /No issues found/.test(out(r)) ? 'no issues' : out(r).split('\n').slice(-4).join(' | ') }; });
  gate('Flutter tests', () => { const r = sh('flutter', ['test', '--reporter', 'expanded'], path.join(ROOT, 'app')); const o = out(r); const n = num(o, /\+(\d+): All tests passed/); meta.flutterTests = n; return { ok: r.status === 0 && n > 0, detail: n ? `${n} of ${n} pass` : o.split('\n').slice(-3).join(' | ') }; });
}
gate('Traceability: every test maps to a requirement, every requirement has a test', () => {
  const r = sh(process.execPath, ['scripts/trace-check.js'], ROOT); const o = out(r); const m = /(\d+) requirements, (\d+) tests/.exec(o);
  if (m) { meta.requirements = +m[1]; meta.traceTests = +m[2]; } return { ok: r.status === 0, detail: m ? `${m[1]} requirements, ${m[2]} tests, no gaps` : o.slice(-200) };
});
gate('OpenAPI export is current (regenerating changes nothing)', () => {
  const files = ['docs/w17/openapi.json', 'docs/w17/openapi.yaml'].map((f) => path.join(ROOT, f)); const before = files.map((f) => fs.readFileSync(f, 'utf8'));
  const r = sh(process.execPath, ['scripts/gen-openapi.js'], ROOT); const after = files.map((f) => fs.readFileSync(f, 'utf8'));
  const same = before.every((b, i) => b === after[i]); return { ok: r.status === 0 && same, detail: same ? 'exports identical to the spec module' : 'exports were stale and have been regenerated: commit them' };
});
if (!QUICK) {
  gate('Contract tests catch deliberate OpenAPI mistakes (mutation check)', () => { const r = sh(process.execPath, ['scripts/mutation-check-openapi.js'], ROOT, 900000); const m = /(\d+) of (\d+) deliberate/.exec(out(r)); return { ok: r.status === 0, detail: m ? `${m[1]} of ${m[2]} caught; original spec restored and passing` : out(r).slice(-200) }; });
  gate('Scripted user acceptance scenarios', () => { const r = sh(process.execPath, ['uat/run-uat.js', 'final-check'], ROOT, 600000); const m = /(\d+)\/(\d+) scenarios, (\d+)\/(\d+) steps/.exec(out(r)); fs.rmSync(path.join(ROOT, 'docs/w17/uat-results-final-check.json'), { force: true }); fs.rmSync(path.join(ROOT, 'docs/w17/uat-results-final-check.md'), { force: true }); return { ok: r.status === 0 && m && m[1] === m[2], detail: m ? `${m[1]} of ${m[2]} scenarios, ${m[3]} of ${m[4]} steps` : out(r).slice(-200) }; });
}
gate('Narrated end-to-end run (the prepared fallback) passes every check', () => {
  const r = sh(process.execPath, ['demo/rehearse.js', '--save', 'docs/w18/fallback-transcript.txt'], ROOT, 300000); const m = /Summary: (\d+) of (\d+) checks passed/.exec(out(r)); return { ok: r.status === 0, detail: m ? `${m[1]} of ${m[2]} checks` : out(r).slice(-200) };
});
gate('Evidence map: every file, test id and decision record it names exists', () => { const r = sh(process.execPath, ['scripts/check-evidence-map.js'], ROOT); return { ok: r.status === 0, detail: r.status === 0 ? (/Evidence map: (.*)\./.exec(out(r)) || [])[1] || 'ok' : out(r).split('\n').filter((l) => /missing|unknown|no rows|duplicate/.test(l)).join('; ').slice(0, 400) }; });
gate('Dependency audit (runtime dependencies)', () => { const r = sh('npm', ['audit', '--omit=dev'], path.join(ROOT, 'api')); const ok = /found 0 vulnerabilities/.test(out(r)); return { ok, detail: ok ? '0 known vulnerabilities' : out(r).split('\n').slice(-3).join(' | ') }; });

// ---- secrets scan
gate('No secrets or private keys in the deliverable files', () => {
  const skipDirs = new Set(['node_modules', 'build', '.dart_tool', 'work', 'certs', '.git', 'data']);
  const allowFiles = new Set(['api/seed/demo-users.json']); // fictional test-only accounts, documented as such
  const patterns = [[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'], [/JWT_SECRET[ \t]*=[ \t]*[A-Za-z0-9+\/=_-]{16,}/, 'JWT_SECRET with a value'], [/AKIA[0-9A-Z]{16}/, 'AWS access key id'], [/(?:api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9+\/=_-]{24,}['"]/i, 'long credential-like string'], [/Demo-[A-Za-z0-9]+-Pass#2026/, 'demo account password']];
  const hits = []; let scanned = 0;
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name); const rel = path.relative(ROOT, p).split(path.sep).join('/');
      if (e.isDirectory()) { if (!skipDirs.has(e.name)) walk(p); continue; }
      if (!/\.(js|json|md|txt|dart|yaml|yml|sh|html|env|example|gitignore|editorconfig)$/i.test(e.name) && !/^\.(env|gitignore)/.test(e.name)) continue;
      if (fs.statSync(p).size > 3 * 1024 * 1024) continue; scanned += 1;
      if (allowFiles.has(rel)) continue;
      const text = fs.readFileSync(p, 'utf8');
      for (const [re, what] of patterns) {
        // Test fixtures (api/test/) hold obviously fake constants such as the test signing key; they are not secrets.
        if (what === 'long credential-like string' && rel.startsWith('api/test/')) continue;
        if (re.test(text)) hits.push(`${rel}: ${what}`);
      }
    }
  })(ROOT);
  const envFiles = ['api/.env', '.env', 'app/.env'].filter((f) => fs.existsSync(path.join(ROOT, f)));
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  const needed = ['.env', 'api/certs/', 'api/data/', 'node_modules/', 'perf/work/', 'uat/work/'].filter((x) => !gi.includes(x));
  const example = fs.readFileSync(path.join(ROOT, 'api', '.env.example'), 'utf8'); const exampleOk = /^JWT_SECRET=\s*$/m.test(example);
  const problems = [...hits.map((h) => 'found ' + h), ...envFiles.map((f) => `${f} exists (must not be shipped)`), ...needed.map((n) => `.gitignore lacks ${n}`), ...(exampleOk ? [] : ['api/.env.example has a JWT_SECRET value'])];
  return { ok: problems.length === 0, detail: problems.length ? problems.join('; ') : `${scanned} files scanned; only the documented test-only accounts file contains passwords; .env.example has no secret` };
});

// ---- deliverables
gate('Minimum final deliverables and the six weekly reports exist', () => {
  const need = ['app/lib/main.dart', 'app/test/ui_state_test.dart', 'api/src/app.js', 'api/.env.example', 'api/openapi/spec.js', 'docs/w17/openapi.yaml', 'docs/w17/diagrams/architecture.png', 'docs/w17/diagrams/data-flow.png', 'docs/w17/adr/ADR-001-storage.md', 'README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'docs/w17/KNOWN_LIMITATIONS.md', 'docs/w17/MAINTENANCE.md', 'docs/w16/RUNBOOK.md',
    'docs/Project18_Week13_SA7_Evidence.docx', 'docs/Project18_Week14_SA8_IA5_Evidence.docx', 'docs/Project18_Week15_IA6_Hardening_Report.docx', 'docs/Project18_Week16_Performance_Deployment_Evaluation.docx', 'docs/Project18_Week17_SA9_UAT_and_Evaluation.docx', 'docs/Project18_Week17_AS3_Advanced_Technical_Report.docx',
    'docs/w18/DEMO_SCRIPT.md', 'docs/w18/FALLBACK_PLAN.md', 'docs/w18/VIVA_PREP.md', 'docs/w18/REFLECTION_TEMPLATE.md', 'docs/Project18_Week18_E3_Defense_Pack.docx'];
  const missing = need.filter((f) => !fs.existsSync(path.join(ROOT, f))); return { ok: !missing.length, detail: missing.length ? 'missing: ' + missing.join(', ') : `${need.length} required files present` };
});

const failed = results.filter((r) => !r.ok);
const summary = { ranAt: new Date().toISOString(), quick: QUICK, node: process.version, gates: results, meta, passed: results.length - failed.length, failed: failed.length };
fs.writeFileSync(path.join(ROOT, 'docs', 'w18', 'final-check.json'), JSON.stringify(summary, null, 2));
let md = `# Final delivery check\n\nRun: ${summary.ranAt} (Node ${process.version}${QUICK ? ', quick mode: slow gates skipped' : ''}). Reproduce with \`node scripts/final-check.js\`.\n\n| Gate | Result | Detail | Time |\n|---|---|---|---|\n`;
for (const r of results) md += `| ${r.name} | ${r.ok ? 'PASS' : '**FAIL**'} | ${String(r.detail).replace(/\|/g, '/')} | ${r.seconds}s |\n`;
md += `\n**${summary.passed} of ${results.length} gates pass.**` + (meta.apiTests ? ` Tests: ${meta.apiTests} API${meta.flutterTests ? ` + ${meta.flutterTests} Flutter = ${meta.apiTests + meta.flutterTests}` : ''}.` : '') + '\n';
fs.writeFileSync(path.join(ROOT, 'docs', 'w18', 'FINAL_DELIVERY_CHECK.md'), md);
console.log(`\n${failed.length ? 'NOT READY' : 'READY'}: ${summary.passed} of ${results.length} gates pass.`);
process.exit(failed.length ? 1 : 0);
