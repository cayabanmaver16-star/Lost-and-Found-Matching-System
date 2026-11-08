'use strict';
// Reference static file server for the Flutter Web build (app/build/web): gzip/brotli, safe caching for non-fingerprinted
// assets, SPA fallback and baseline security headers. Used for UAT and as the specification for the real static host/CDN.
// Usage: node scripts/static-server.js [port] [dir]     (default port 8080, dir app/build/web)
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gzipAsync = promisify(zlib.gzip);
// Moderate brotli quality: the default (11) took 35 s for the 7 MB renderer on the first request AND blocked every other request,
// because it ran synchronously (found while preparing the Week 18 demo). Quality 5 is about 20x faster for ~10% larger output.
const brotliAsync = (buf) => new Promise((res, rej) => zlib.brotliCompress(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }, (e, r) => (e ? rej(e) : res(r))));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.ico': 'image/x-icon', '.css': 'text/css', '.otf': 'font/otf', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.map': 'application/json' };
const COMPRESSIBLE = new Set(['.html', '.js', '.json', '.wasm', '.css', '.svg', '.otf', '.ttf']);

// Returns a promise of the compressed bytes for one encoding, computed once per file version.
function encoded(entry, kind) {
  if (!entry[kind]) entry[kind] = kind === 'br' ? brotliAsync(entry.raw) : gzipAsync(entry.raw, { level: 6 });
  return entry[kind];
}

function createStaticServer(rootDir) {
  const root = path.resolve(rootDir);
  const cache = new Map(); // path -> {raw, gzip, br, mtime}
  function load(file) {
    const st = fs.statSync(file);
    const hit = cache.get(file);
    if (hit && hit.mtime === st.mtimeMs) return hit;
    const raw = fs.readFileSync(file);
    const ext = path.extname(file);
    const entry = { raw, mtime: st.mtimeMs, compressible: COMPRESSIBLE.has(ext), gzip: null, br: null }; // compressed lazily, per encoding, asynchronously
    cache.set(file, entry);
    return entry;
  }
  const server = http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    if (rel.includes('\0')) { res.writeHead(400).end(); return; }
    let file = path.normalize(path.join(root, rel));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end('Forbidden'); return; } // path traversal guard
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');       // SPA fallback
    const ext = path.extname(file);
    const entry = load(file);
    const accept = String(req.headers['accept-encoding'] || '');
    let body = entry.raw;
    const headers = {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      'Vary': 'Accept-Encoding',
      // Flutter's app files (main.dart.js, assets, ...) are NOT fingerprinted, so any max-age would let browsers keep running OLD app code
      // against a NEW API after a deploy (found during the Week 17 UAT retest with max-age=3600). "no-cache" = always revalidate with the
      // ETag (a cheap 304 when unchanged). Only the renderer files, which change only when Flutter itself is upgraded, get a day.
      'Cache-Control': rel.startsWith('/canvaskit/') ? 'public, max-age=86400' : 'no-cache',
      'ETag': `"${entry.mtime.toString(36)}-${entry.raw.length.toString(36)}"`,
    };
    if (req.headers['if-none-match'] === headers.ETag) { res.writeHead(304, headers).end(); return; }
    try {
      if (entry.compressible && /\bbr\b/.test(accept)) { body = await encoded(entry, 'br'); headers['Content-Encoding'] = 'br'; }
      else if (entry.compressible && /\bgzip\b/.test(accept)) { body = await encoded(entry, 'gzip'); headers['Content-Encoding'] = 'gzip'; }
    } catch { body = entry.raw; delete headers['Content-Encoding']; }  // if compression ever fails, serve the file uncompressed rather than fail
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : body);
  });
  // Pre-compress the files a first visit needs, so the first user does not wait (the 7 MB renderer takes seconds to compress).
  server.warm = async (files = ['/index.html', '/flutter_bootstrap.js', '/flutter.js', '/main.dart.js', '/canvaskit/canvaskit.js', '/canvaskit/canvaskit.wasm']) => {
    for (const rel of files) {
      const file = path.join(root, rel);
      if (!fs.existsSync(file)) continue;
      const entry = load(file);
      if (entry.compressible) await Promise.all([encoded(entry, 'br'), encoded(entry, 'gzip')]);
    }
  };
  return server;
}

module.exports = { createStaticServer };

if (require.main === module) {
  const port = parseInt(process.argv[2], 10) || 8080;
  const dir = process.argv[3] || path.join(__dirname, '..', 'app', 'build', 'web');
  const server = createStaticServer(dir);
  server.listen(port, () => { console.log(`static server on http://localhost:${port} serving ${path.resolve(dir)}`); server.warm().catch(() => {}); });
}
