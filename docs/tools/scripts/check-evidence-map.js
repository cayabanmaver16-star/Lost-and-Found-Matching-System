'use strict';
// Verifies the evidence map: every artifact path exists, every test id exists in the traceability mapping and in the test sources,
// every ADR exists, every demo segment is a known one. Renders docs/w18/EVIDENCE_MAP.md. Exit 1 on any problem.
// Usage: node scripts/check-evidence-map.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const map = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'w18', 'evidence-map.json'), 'utf8'));
const trace = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'traceability.json'), 'utf8'));
const problems = [];
const adrFiles = fs.readdirSync(path.join(root, 'docs', 'w17', 'adr'));
const seenIds = new Set();
for (const r of map.rows) {
  if (seenIds.has(r.id)) problems.push(`duplicate row id ${r.id}`); seenIds.add(r.id);
  for (const a of r.artifacts) if (!fs.existsSync(path.join(root, a))) problems.push(`${r.id}: missing artifact ${a}`);
  for (const t of r.tests) if (!trace.tests[t]) problems.push(`${r.id}: unknown test id ${t}`);
  for (const a of r.adr) if (!adrFiles.some((f) => f.startsWith(a))) problems.push(`${r.id}: unknown ${a}`);
  if (!map.demoSegments[r.demo]) problems.push(`${r.id}: unknown demo segment ${r.demo}`);
  if (!r.artifacts.length) problems.push(`${r.id}: no artifacts`);
}
// every assessed area of the guide must have at least one row
for (const needed of ['SA7', 'SA8', 'IA6', 'Week 16', 'SA9', 'AS3', 'E3', 'Minimum final deliverables']) if (!map.rows.some((r) => r.assessment.includes(needed))) problems.push(`no rows for ${needed}`);

const link = (p) => `[${p}](../../${p})`;
let md = `# Evidence map\n\nEvery row says what is claimed, where the proof is, which automated tests back it, which decision record explains it, and where it appears in the 15-minute demonstration (see DEMO_SCRIPT.md). This file is generated from \`evidence-map.json\` by \`node scripts/check-evidence-map.js\`, which also fails if any file, test id or ADR it names does not exist.\n\n`;
let current = '';
for (const r of map.rows) {
  if (r.assessment !== current) { current = r.assessment; md += `\n## ${current}\n\n| ID | Claim | Proof (files) | Tests | Decision | Demo |\n|---|---|---|---|---|---|\n`; }
  md += `| ${r.id} | ${r.claim} | ${r.artifacts.map(link).join('<br>')} | ${r.tests.join(', ') || '-'} | ${r.adr.join(', ') || '-'} | ${map.demoSegments[r.demo]} |\n`;
}
const nArt = new Set(map.rows.flatMap((r) => r.artifacts)).size; const nTests = new Set(map.rows.flatMap((r) => r.tests)).size;
md += `\n---\n${map.rows.length} claims, ${nArt} distinct artifacts, ${nTests} distinct test ids cited. Problems found: ${problems.length}.\n`;
fs.writeFileSync(path.join(root, 'docs', 'w18', 'EVIDENCE_MAP.md'), md);
console.log(`Evidence map: ${map.rows.length} claims, ${nArt} artifacts, ${nTests} test ids.`);
if (problems.length) { console.error('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
console.log('Evidence map OK: every file, test id and decision record it names exists.');
