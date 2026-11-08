'use strict';
// Traceability gate: requirements <-> tests. Fails (exit 1) if
//  - a test in the source has no requirement mapping,
//  - a mapped test id does not exist in the source,
//  - a requirement has no test.
// Writes docs/w15/traceability-matrix.md and docs/w15/traceability-summary.json.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const map = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'traceability.json'), 'utf8'));

const sources = [
  ['api/test/workflow.test.js', /\btest\('([THSOPACD]\d{2})\b/g, 'API functional'],
  ['api/test/security.test.js', /\btest\('([THSOPACD]\d{2})\b/g, 'API security'],
  ['api/test/hardening.test.js', /\btest\('([THSOPACD]\d{2})\b/g, 'API hardening / integration'],
  ['api/test/ops.test.js', /\btest\('([THSOPACD]\d{2})\b/g, 'API operability'],
  ['api/test/perf.test.js', /\btest\('([THSOPACD]\d{2})\b/g, 'API performance / lifecycle'],
  ['api/test/acceptance.test.js', /\btest\('([THSOPACD]\d{2})\b/g, 'API acceptance (UAT fixes)'],
  ['api/test/contract.test.js', /\btest\('([THSOPACD]\d{2})\b/g, 'API contract (OpenAPI)'],
  ['api/test/static.test.js', /\btest\('([THSOPACD]\d{2})\b/g, 'Static host (deployment)'],
  ['app/test/widget_test.dart', /\btestWidgets\('([UW]\d{2})\b/g, 'Flutter widget'],
  ['app/test/ui_state_test.dart', /\btestWidgets\('([UW]\d{2})\b/g, 'Flutter UI state'],
];
const found = {}; // id -> {file, kind, title}
for (const [file, re, kind] of sources) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const m of text.matchAll(new RegExp(re.source + "[^']*", 'g'))) {
    const id = m[1];
    if (found[id]) { console.error(`Duplicate test id ${id} in ${file} and ${found[id].file}`); process.exitCode = 1; }
    found[id] = { file, kind, title: m[0].replace(/^[^']*'/, '').replace(/^[A-Z]\d{2}\s*/, '') };
  }
}
const problems = [];
for (const id of Object.keys(found)) if (!map.tests[id]) problems.push(`Unmapped test: ${id} (${found[id].file})`);
for (const id of Object.keys(map.tests)) if (!found[id]) problems.push(`Mapping references missing test: ${id}`);
const byReq = {};
for (const r of Object.keys(map.requirements)) byReq[r] = [];
for (const [id, reqs] of Object.entries(map.tests)) for (const r of reqs) { if (!byReq[r]) problems.push(`Unknown requirement ${r} for ${id}`); else byReq[r].push(id); }
for (const [r, ids] of Object.entries(byReq)) if (!ids.length) problems.push(`Requirement without a test: ${r}`);

const rank = (id) => id[0] + id.slice(1).padStart(3, '0');
let md = '# Traceability matrix (requirements to tests)\n\n| Requirement | Statement | Tests | Count |\n|---|---|---|---|\n';
for (const [r, text] of Object.entries(map.requirements)) md += `| ${r} | ${text} | ${byReq[r].sort((a, b) => rank(a).localeCompare(rank(b))).join(', ')} | ${byReq[r].length} |\n`;
md += '\n## Test catalogue\n\n| ID | Suite | Test | Requirements |\n|---|---|---|---|\n';
for (const id of Object.keys(found).sort()) md += `| ${id} | ${found[id].kind} | ${found[id].title.replace(/\|/g, '/')} | ${(map.tests[id] || []).join(', ')} |\n`;
fs.mkdirSync(path.join(root, 'docs', 'w15'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'w15', 'traceability-matrix.md'), md);
const summary = {
  requirements: Object.keys(map.requirements).length, tests: Object.keys(found).length,
  perSuite: Object.values(found).reduce((a, t) => { a[t.kind] = (a[t.kind] || 0) + 1; return a; }, {}),
  byReq, found, problems,
};
fs.writeFileSync(path.join(root, 'docs', 'w15', 'traceability-summary.json'), JSON.stringify(summary, null, 2));
console.log(`${summary.requirements} requirements, ${summary.tests} tests`, summary.perSuite);
if (problems.length) { console.error('TRACEABILITY PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
console.log('Traceability OK: every test maps to a requirement and every requirement has tests.');
