'use strict';
// Prints mean createReport cost at several dataset sizes (in-process, no HTTP, no disk): shows how cost grows with stored data.
process.env.LOG_QUIET = '1';
const path = require('path');
const lib = require('./lib');
const { Store } = require(path.join(lib.API, 'src', 'store'));
const wf = require(path.join(lib.API, 'src', 'workflow'));
const today = () => new Date().toISOString().slice(0, 10);
(async () => {
  const actor = { id: 'stu1', role: 'student' }; const opts = { delivery: { sleep: async () => {} } };
  for (const n of [500, 2000, 10000, 25000]) {
    const store = new Store(null); store.data = lib.makeDb(n);
    const mk = (i) => ({ type: i % 2 ? 'lost' : 'found', category: lib.pick(lib.CATEGORIES), description: lib.words(4) + ' probe' + i, location: lib.pick(lib.PLACES), eventDate: today() });
    for (let i = 0; i < 10; i++) await wf.createReport(store, actor, mk(i), opts);          // warm-up (fills the token cache)
    const t0 = process.hrtime.bigint(); const N = 60;
    for (let i = 0; i < N; i++) await wf.createReport(store, actor, mk(100 + i), opts);
    console.log(`${String(n).padStart(6)} reports: ${(Number(process.hrtime.bigint() - t0) / 1e6 / N).toFixed(2)} ms per createReport`);
  }
})();
