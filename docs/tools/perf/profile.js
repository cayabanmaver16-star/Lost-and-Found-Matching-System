'use strict';
// Micro-profile of the hot path of POST /api/reports at a given dataset size (in-process, no HTTP).
// Usage: node perf/profile.js [nReports]
process.env.LOG_QUIET = '1';
const path = require('path');
const fs = require('fs');
const lib = require('./lib');
const api = (p) => require(path.join(lib.API, 'src', p));
const { Store } = api('store');
const { fingerprint, score, MATCH_THRESHOLD } = api('matching');
const wf = api('workflow');

const n = parseInt(process.argv[2] || '10000', 10);
const dataFile = path.join(lib.WORK, `profile-${n}.json`);
fs.mkdirSync(lib.WORK, { recursive: true });
fs.writeFileSync(dataFile, JSON.stringify(lib.makeDb(n)));
const store = new Store(dataFile);
const t = (label, fn, reps = 5) => { const t0 = process.hrtime.bigint(); for (let i = 0; i < reps; i++) fn(); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / reps; console.log(`${label.padEnd(52)} ${ms.toFixed(1)} ms`); return ms; };

const body = { type: 'lost', category: 'wallet', description: 'black leather wallet student card', location: 'library', eventDate: lib.dayAgo(1) };
const probe = { ...body, id: 'R-X', reporterId: 'stu1', status: 'open' };
console.log(`dataset: ${n} reports (${store.data.reports.filter((r) => r.status === 'open').length} open)`);
t('duplicate scan: fingerprint() of every open report', () => { const fp = fingerprint(probe); store.data.reports.find((r) => r.status === 'open' && fingerprint(r) === fp); });
t('matching scan: score() against every open opposite', () => { for (const o of store.data.reports) if (o.status === 'open' && o.type === 'found') score(probe, o); });
t('save(): pretty JSON + write + .bak copy + rename', () => store.save(), 3);
t('JSON.stringify(data, null, 2) only', () => JSON.stringify(store.data, null, 2), 3);
t('JSON.stringify(data) compact only', () => JSON.stringify(store.data), 3);
t('GET list: filter by reporter + slice', () => { store.data.reports.filter((r) => r.reporterId === 'stu1').slice(0, 200); });
