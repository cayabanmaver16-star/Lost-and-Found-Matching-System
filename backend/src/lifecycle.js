'use strict';
// Graceful shutdown: stop being "ready" first (so a load balancer drains us), let in-flight requests finish,
// flush storage, then close. A hard deadline guarantees the process still exits if something hangs.
const log = require('./logger');

function createShutdown({ server, app, store, timeoutMs = 10000, exit = (code) => process.exit(code) }) {
  let running = null;
  return function shutdown(reason = 'signal') {
    if (running) return running;
    app.locals.shuttingDown = true;                       // /ready now answers 503
    log.info('server.shutdown_started', { reason });
    running = new Promise((resolve) => {
      let finished = false;
      const done = (code, how) => {
        if (finished) return; finished = true;
        clearTimeout(timer);
        log.info('server.shutdown_complete', { how, code });
        resolve(code); exit(code);
      };
      const timer = setTimeout(() => { try { server.closeAllConnections(); } catch { /* ignore */ } done(1, 'deadline'); }, timeoutMs);
      timer.unref();
      server.close(async () => {                          // fires when all connections have ended
        try { await store.commit(); store.save(); done(0, 'drained'); } catch (e) { log.error('server.shutdown_flush_failed', { error: e.message }); done(1, 'flush_failed'); }
      });
      server.closeIdleConnections && server.closeIdleConnections();  // keep-alive sockets with no request in flight
    });
    return running;
  };
}
module.exports = { createShutdown };
