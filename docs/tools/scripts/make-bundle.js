'use strict';
// Builds the submission bundle ../Project18_Submission.zip from a clean staged copy, inspects the archive for anything that must not
// be shipped, and (with --verify) proves it works from scratch by extracting it and running its tests.
//   node scripts/make-bundle.js            build + inspect
//   node scripts/make-bundle.js --verify   build + inspect + extract to a temp folder, npm install, npm test, flutter test, narrated run
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '..', 'Project18_Submission.zip');
const VERIFY = process.argv.includes('--verify');
const stage = path.join(os.tmpdir(), 'lf-bundle-stage'); const staged = path.join(stage, 'lostfound');
const flutterBin = process.env.FLUTTER_BIN || 'C:/develop/flutter/bin';
const env = { ...process.env, PATH: `${process.env.PATH}${path.delimiter}${flutterBin}` };

const EXCLUDE_DIRS = new Set(['node_modules', '.dart_tool', 'certs', '.git', 'data', 'work', '.idea', '.vscode']);
const keep = (src) => {
  const rel = path.relative(ROOT, src).split(path.sep).join('/'); const base = path.basename(src);
  if (EXCLUDE_DIRS.has(base)) return false;
  if (/^\.env($|\.)/.test(base) && base !== '.env.example') return false;
  if (/\.(bak|tmp)$/.test(base)) return false;
  if (rel === 'app/build/web' || rel.startsWith('app/build/web/')) return false;                  // duplicate of the demo build
  if (rel.startsWith('app/build/') && !rel.startsWith('app/build/demo') && rel !== 'app/build') return false;
  if (rel === 'demo-run.log' || rel === 'demo-run.err') return false;
  return true;
};

fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage, { recursive: true });
fs.cpSync(ROOT, staged, { recursive: true, filter: keep });
fs.rmSync(OUT, { force: true });
const ps = spawnSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${staged}' -DestinationPath '${OUT}' -CompressionLevel Optimal -Force`], { encoding: 'utf8', timeout: 600000 });
if (ps.status !== 0 || !fs.existsSync(OUT)) { console.error('zip failed:', ps.stderr || ps.stdout); process.exit(1); }

// ---- inspect the archive
const list = spawnSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${OUT}'); $z.Entries | ForEach-Object { $_.FullName }; $z.Dispose()`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const names = list.stdout.split(/\r?\n/).filter(Boolean).map((n) => n.replace(/\\/g, '/'));
const forbidden = names.filter((n) => /\/(node_modules|certs|\.git|\.dart_tool)\//.test(n) || /\/\.env$/.test(n) || /\/(perf|uat|demo)\/work\//.test(n) || /\.(pem|key|bak|tmp)$/.test(n) || /\/api\/data\//.test(n));
const required = ['lostfound/README.md', 'lostfound/CONTRIBUTING.md', 'lostfound/api/package.json', 'lostfound/api/.env.example', 'lostfound/api/openapi/spec.js', 'lostfound/app/lib/main.dart', 'lostfound/app/pubspec.yaml', 'lostfound/docs/w18/DEMO_SCRIPT.md', 'lostfound/docs/Project18_Week18_E3_Defense_Pack.docx', 'lostfound/demo/start-demo.js'];
const missing = required.filter((r) => !names.includes(r));
const sha = crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex');
const size = fs.statSync(OUT).size;
const manifest = [`Project18_Submission.zip`, `size: ${(size / 1048576).toFixed(1)} MB`, `files: ${names.filter((n) => !n.endsWith('/')).length}`, `sha256: ${sha}`, `built: ${new Date().toISOString()}`, `forbidden entries: ${forbidden.length}`, `missing required entries: ${missing.length}`, '', ...names.filter((n) => !n.endsWith('/') && !/\/app\/build\/demo\/(canvaskit|assets)\//.test(n))].join('\n');
fs.writeFileSync(path.join(ROOT, '..', 'Project18_Submission.manifest.txt'), manifest + '\n');
console.log(`bundle: ${(size / 1048576).toFixed(1)} MB, ${names.filter((n) => !n.endsWith('/')).length} files, sha256 ${sha.slice(0, 16)}...`);
console.log(`forbidden entries: ${forbidden.length}${forbidden.length ? '\n  ' + forbidden.slice(0, 10).join('\n  ') : ''}`);
console.log(`required entries missing: ${missing.length}${missing.length ? '\n  ' + missing.join('\n  ') : ''}`);
let ok = !forbidden.length && !missing.length;

if (VERIFY && ok) {
  const dir = path.join(os.tmpdir(), 'lf-bundle-verify'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const ex = spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${OUT}' -DestinationPath '${dir}' -Force`], { encoding: 'utf8', timeout: 600000 });
  const base = path.join(dir, 'lostfound'); console.log(`\nverifying from a clean extract: ${base}`);
  const run = (label, cmd, args, cwd, timeout = 900000) => { const t0 = Date.now(); const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', shell: process.platform === 'win32' && cmd !== process.execPath, timeout, maxBuffer: 64 * 1024 * 1024 }); const o = (r.stdout || '') + (r.stderr || ''); return { label, r, o, s: ((Date.now() - t0) / 1000).toFixed(0) }; };
  const steps = [];
  if (ex.status !== 0) { console.error('extract failed', ex.stderr); process.exit(1); }
  let x = run('npm install (api)', 'npm', ['install', '--no-audit', '--no-fund'], path.join(base, 'api')); steps.push([x.label, x.r.status === 0, `${x.s}s`]);
  x = run('npm test (api)', 'npm', ['test'], path.join(base, 'api')); steps.push([x.label, x.r.status === 0, `${(/# pass (\d+)/.exec(x.o) || [])[1]} of ${(/# tests (\d+)/.exec(x.o) || [])[1]} pass, ${x.s}s`]);
  x = run('flutter pub get (app)', 'flutter', ['pub', 'get'], path.join(base, 'app')); steps.push([x.label, x.r.status === 0, `${x.s}s`]);
  x = run('flutter test (app)', 'flutter', ['test'], path.join(base, 'app')); steps.push([x.label, x.r.status === 0, `${(/\+(\d+): All tests passed/.exec(x.o) || [])[1] || '?'} pass, ${x.s}s`]);
  x = run('traceability gate', process.execPath, ['scripts/trace-check.js'], base); steps.push([x.label, x.r.status === 0, (/(\d+ requirements, \d+ tests)/.exec(x.o) || [])[1] || x.o.slice(-100)]);
  x = run('narrated end-to-end run', process.execPath, ['demo/rehearse.js'], base); steps.push([x.label, x.r.status === 0, (/Summary: (.*) in/.exec(x.o) || [])[1] || x.o.slice(-100)]);
  console.log('\nClean-extract verification:'); for (const [l, good, d] of steps) { console.log(`${good ? '[ok]  ' : '[FAIL]'} ${l}  -  ${d}`); if (!good) ok = false; }
  fs.writeFileSync(path.join(ROOT, '..', 'Project18_Submission.verification.txt'), `Verified ${new Date().toISOString()} from a clean extract of Project18_Submission.zip (sha256 ${sha})\n` + steps.map(([l, g, d]) => `${g ? 'PASS' : 'FAIL'}  ${l}  ${d}`).join('\n') + '\n');
}
console.log(ok ? '\nBUNDLE OK' : '\nBUNDLE PROBLEMS');
process.exit(ok ? 0 : 1);
