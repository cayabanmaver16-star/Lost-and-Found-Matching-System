'use strict';
// Minimal JSON-file store (controlled data only). Swap for a real database before real deployment.
//
// Durability model ("group commit"):
//   - handlers mutate memory and call changed();
//   - the HTTP layer awaits commit() BEFORE sending the response, so an acknowledged write is on disk;
//   - concurrent requests share one write: while a write is in flight, later changes queue up and are
//     written together by the next one (one JSON serialisation + one file write per batch, not per request);
//   - every write is atomic (temp file + rename), asynchronous (the event loop is free during disk I/O),
//     and the previous good copy is rotated to ".bak" at most every BACKUP_INTERVAL_MS.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const log = require('./logger');

const EMPTY = () => ({ seq: 0, reports: [], matches: [], notifications: [], manualQueue: [], audit: [] });
const BACKUP_INTERVAL_MS = parseInt(process.env.BACKUP_INTERVAL_MS, 10) || 60000;

function readJson(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!d || typeof d !== 'object' || !Array.isArray(d.reports) || !Array.isArray(d.matches)) throw new Error('unexpected structure');
  return d;
}

class Store {
  constructor(file) {
    this.file = file; // null => in-memory (tests)
    this.lastSaveError = null; // readiness signal: set when a write fails, cleared by the next successful write
    this.stats = { writes: 0, commits: 0, lastWriteMs: 0, maxWriteMs: 0, lastBytes: 0 };
    this._gen = 0; this._writtenGen = 0; this._flushing = false; this._waiters = []; this._lastBackup = 0;
    this.data = EMPTY();
    if (file) { try { fs.rmSync(file + '.tmp', { force: true }); } catch { /* ignore */ } } // leftover from a crash mid-write; never read
    if (!file || !fs.existsSync(file)) return;
    try {
      this.data = readJson(file);
    } catch (e) {
      const bak = file + '.bak';
      if (fs.existsSync(bak)) {
        try {
          this.data = readJson(bak);
          log.warn('store.recovered_from_backup', { file: path.basename(file), reason: e.message });
          return;
        } catch { /* fall through */ }
      }
      throw new Error(`Data file ${path.basename(file)} is corrupt (${e.message}) and no valid backup exists. Restore it from a backup before starting.`);
    }
    this._lastBackup = Date.now();
  }
  nextId(prefix) { this.data.seq += 1; return `${prefix}-${String(this.data.seq).padStart(4, '0')}`; }

  /** Mark the in-memory data as modified. Cheap; does no I/O. */
  changed() { this._gen += 1; }

  /** Resolve once everything changed so far is durably on disk (joins an in-flight or schedules a new write). */
  commit() {
    if (!this.file || this._writtenGen >= this._gen) return Promise.resolve();
    this.stats.commits += 1;
    return new Promise((resolve, reject) => {
      this._waiters.push({ target: this._gen, resolve, reject });
      if (!this._flushing) { this._flushing = true; setImmediate(() => this._flushLoop()); }
    });
  }

  async _flushLoop() {
    try {
      while (this._writtenGen < this._gen) {
        const target = this._gen;
        const t0 = process.hrtime.bigint();
        try {
          const json = JSON.stringify(this.data);              // synchronous snapshot: consistent, no interleaving
          await this._writeAtomic(json);
          this._writtenGen = target; this.lastSaveError = null;
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          this.stats.writes += 1; this.stats.lastWriteMs = +ms.toFixed(1); this.stats.lastBytes = json.length;
          if (ms > this.stats.maxWriteMs) this.stats.maxWriteMs = +ms.toFixed(1);
          this._release(target, null);
        } catch (e) {
          this.lastSaveError = e.message;
          log.error('store.write_failed', { error: e.message });
          this._release(Infinity, e);                           // fail everyone waiting; a later commit() retries
          return;
        }
      }
    } finally { this._flushing = false; }
  }
  _release(upTo, err) {
    const keep = [];
    for (const w of this._waiters) { if (w.target <= upTo) (err ? w.reject(err) : w.resolve()); else keep.push(w); }
    this._waiters = keep;
  }
  async _writeAtomic(json) {
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    try {
      await fsp.writeFile(tmp, json);
      const now = Date.now();
      if (fs.existsSync(this.file) && (!fs.existsSync(this.file + '.bak') || now - this._lastBackup >= BACKUP_INTERVAL_MS)) {
        await fsp.copyFile(this.file, this.file + '.bak'); this._lastBackup = now;
      }
      await fsp.rename(tmp, this.file);
    } catch (e) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      throw e;
    }
  }

  /** Synchronous atomic write: used at shutdown and by tests. */
  save() {
    if (!this.file) return;
    const tmp = this.file + '.tmp';
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
      fs.renameSync(tmp, this.file);
      this._writtenGen = this._gen; this._lastBackup = Date.now(); this.lastSaveError = null;
    } catch (e) {
      this.lastSaveError = e.message;
      try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
      throw e;
    }
  }
}
module.exports = { Store };
