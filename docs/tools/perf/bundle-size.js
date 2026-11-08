'use strict';
// Measures the deployed Flutter Web bundle (raw and gzip) from app/build/web -> docs/w16/frontend-bundle.json
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const root = path.join(__dirname, '..', 'app', 'build', 'web');
const rows = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else { const b = fs.readFileSync(p); rows.push({ file: path.relative(root, p).split(path.sep).join('/'), bytes: b.length, gzip: zlib.gzipSync(b).length }); }
  }
})(root);
rows.sort((a, b) => b.bytes - a.bytes);
const tot = rows.reduce((a, r) => ({ bytes: a.bytes + r.bytes, gzip: a.gzip + r.gzip }), { bytes: 0, gzip: 0 });
// What a first visit actually downloads: the Flutter loader, the app script and the renderer (canvaskit) it picks
const firstLoad = rows.filter((r) => /^(index\.html|flutter_bootstrap\.js|flutter\.js|main\.dart\.js|manifest\.json|canvaskit\/canvaskit\.js|canvaskit\/canvaskit\.wasm)$/.test(r.file));
const fl = firstLoad.reduce((a, r) => ({ bytes: a.bytes + r.bytes, gzip: a.gzip + r.gzip }), { bytes: 0, gzip: 0 });
const out = { totalBytes: tot.bytes, totalGzip: tot.gzip, files: rows.length, firstLoadApprox: { files: firstLoad.map((r) => r.file), bytes: fl.bytes, gzip: fl.gzip }, top: rows.slice(0, 6) };
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'w16', 'frontend-bundle.json'), JSON.stringify(out, null, 2));
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log(`bundle: ${rows.length} files, total ${mb(tot.bytes)} (gzip ${mb(tot.gzip)}); first load approx ${mb(fl.bytes)} (gzip ${mb(fl.gzip)})`);
rows.slice(0, 6).forEach((r) => console.log(`  ${r.file.padEnd(40)} ${(r.bytes / 1024).toFixed(0)} KB, gzip ${(r.gzip / 1024).toFixed(0)} KB`));
