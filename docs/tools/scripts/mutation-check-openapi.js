'use strict';
// Proves the contract tests detect documentation drift: applies deliberate mistakes to api/openapi/spec.js one at a time,
// runs test/contract.test.js, expects a FAILURE each time, and always restores the original file.
// Usage: node scripts/mutation-check-openapi.js     -> docs/w17/contract-mutation-check.txt
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const apiDir = path.join(__dirname, '..', 'api');
const specFile = path.join(apiDir, 'openapi', 'spec.js');
const original = fs.readFileSync(specFile, 'utf8');
const mutations = [
  ['Report.status loses "closed"', "status: { type: 'string', enum: ['open', 'closed', 'disposed'] },\n        createdAt", "status: { type: 'string', enum: ['open', 'disposed'] },\n        createdAt"],
  ['Report.status loses "disposed"', "status: { type: 'string', enum: ['open', 'closed', 'disposed'] },\n        createdAt", "status: { type: 'string', enum: ['open', 'closed'] },\n        createdAt"],
  ['ClaimantMatch wrongly requires foundId', "required: ['id', 'lostId', 'score', 'status', 'createdAt', 'lost'], additionalProperties: false", "required: ['id', 'lostId', 'foundId', 'score', 'status', 'createdAt', 'lost'], additionalProperties: false"],
  ['Match.score documented as string', "score: { type: 'integer', minimum: 0, maximum: 100 },\n        status", "score: { type: 'string' },\n        status"],
  ['/api/audit documented as open to students', "'/api/audit': { get: { tags: ['Operations'], summary: 'Audit trail of state changes (staff)', security: bearer, 'x-roles': ['security', 'custodian']", "'/api/audit': { get: { tags: ['Operations'], summary: 'Audit trail of state changes (staff)', security: bearer, 'x-roles': ROLES"],
  ['a phantom operation is documented', "'/api/audit': { get:", "'/api/ghost': { get: { tags: ['Operations'], summary: 'does not exist', security: bearer, 'x-roles': ROLES, responses: { 200: ok('x', ref('Health')) } } },\n    '/api/audit': { get:"],
  ['409 removed from the verify operation', "409: { description: 'INVALID_STATE (not a candidate) or ITEM_UNAVAILABLE (a report is no longer open)', content: json(ref('Error')) }, ", ''],
  ['Notification.attempts documented as boolean', "attempts: { type: 'integer' }, lastError", "attempts: { type: 'boolean' }, lastError"],
];

const lines = []; let caught = 0;
try {
  for (const [name, find, replace] of mutations) {
    if (!original.includes(find)) { lines.push(`SKIPPED  ${name}  (anchor text not found)`); continue; }
    fs.writeFileSync(specFile, original.split(find).join(replace));
    const r = spawnSync(process.execPath, ['--test', 'test/contract.test.js'], { cwd: apiDir, encoding: 'utf8', timeout: 120000 });
    const failed = r.status !== 0;
    const which = (r.stdout.match(/not ok \d+ - (C0\d)/g) || []).map((x) => x.replace(/not ok \d+ - /, '')).join(', ');
    if (failed) caught += 1;
    lines.push(`${failed ? 'CAUGHT ' : 'MISSED '} ${name}${failed ? `   (failing: ${which || 'file error'})` : ''}`);
    console.log(lines[lines.length - 1]);
  }
} finally { fs.writeFileSync(specFile, original); }
const check = spawnSync(process.execPath, ['--test', 'test/contract.test.js'], { cwd: apiDir, encoding: 'utf8', timeout: 120000 });
lines.push('', `${caught} of ${mutations.length} deliberate documentation errors were caught.`, `Original spec restored; contract tests on the restored spec: ${check.status === 0 ? 'all pass' : 'FAIL'}.`);
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'w17', 'contract-mutation-check.txt'), lines.join('\n') + '\n');
console.log(lines.slice(-2).join('\n'));
process.exit(check.status === 0 && caught === mutations.length ? 0 : 1);
