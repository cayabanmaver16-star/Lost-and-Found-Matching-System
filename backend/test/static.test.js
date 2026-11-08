'use strict';
// Week 17: the reference static host for the Flutter build (scripts/static-server.js). It defines how any real host/CDN must behave.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { createStaticServer } = require('./support/static-server');

async function withSite(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-static-'));
  fs.mkdirSync(path.join(dir, 'canvaskit'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html><title>Campus Lost &amp; Found</title>' + 'x'.repeat(2000) + '</html>');
  fs.writeFileSync(path.join(dir, 'main.dart.js'), 'console.log("app");\n'.repeat(500));
  fs.writeFileSync(path.join(dir, 'canvaskit', 'canvaskit.wasm'), Buffer.alloc(5000, 7));
  fs.writeFileSync(path.join(dir, 'favicon.png'), Buffer.from([137, 80, 78, 71]));
  const server = createStaticServer(dir); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  // node's fetch hides some headers and decodes bodies; use raw http for exact header control
  const get = (p, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request(base + p, { method, headers }, (res) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })); });
    req.on('error', reject); req.end();
  });
  try { await fn({ get, dir }); } finally { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); }
}

test('D01 [F9] non-fingerprinted app files are always revalidated (no max-age), renderer files cache for a day', async () => {
  await withSite(async ({ get }) => {
    for (const p of ['/', '/index.html', '/main.dart.js', '/favicon.png']) assert.equal((await get(p)).headers['cache-control'], 'no-cache', p);
    assert.equal((await get('/canvaskit/canvaskit.wasm')).headers['cache-control'], 'public, max-age=86400');
  });
});

test('D02 an unchanged file is answered 304 via its ETag; a changed file is served again', async () => {
  await withSite(async ({ get, dir }) => {
    const first = await get('/main.dart.js'); const etag = first.headers.etag; assert.ok(etag);
    assert.equal((await get('/main.dart.js', { 'if-none-match': etag })).status, 304);
    await new Promise((r) => setTimeout(r, 20)); fs.writeFileSync(path.join(dir, 'main.dart.js'), 'console.log("new release");\n');
    const after = await get('/main.dart.js', { 'if-none-match': etag });
    assert.equal(after.status, 200, 'a new release must not be hidden behind the old ETag'); assert.match(after.body.toString(), /new release/);
  });
});

test('D03 content is compressed when the browser accepts it (brotli preferred, then gzip) and is identical after decoding', async () => {
  await withSite(async ({ get }) => {
    const plain = await get('/main.dart.js');
    const gz = await get('/main.dart.js', { 'accept-encoding': 'gzip' }); const br = await get('/main.dart.js', { 'accept-encoding': 'gzip, br' });
    assert.equal(gz.headers['content-encoding'], 'gzip'); assert.equal(br.headers['content-encoding'], 'br');
    assert.ok(gz.body.length < plain.body.length / 5, 'compression is effective');
    assert.deepEqual(zlib.gunzipSync(gz.body), plain.body); assert.deepEqual(zlib.brotliDecompressSync(br.body), plain.body);
    assert.equal(plain.headers['content-encoding'], undefined); assert.equal(plain.headers.vary, 'Accept-Encoding');
    assert.equal((await get('/favicon.png', { 'accept-encoding': 'gzip' })).headers['content-encoding'], undefined, 'already-compressed images are not recompressed');
  });
});

test('D04 safety: security headers on every response, path traversal refused, only GET/HEAD, unknown paths fall back to the app', async () => {
  await withSite(async ({ get }) => {
    const r = await get('/main.dart.js');
    assert.equal(r.headers['x-content-type-options'], 'nosniff'); assert.equal(r.headers['x-frame-options'], 'DENY'); assert.equal(r.headers['referrer-policy'], 'no-referrer');
    for (const p of ['/../../etc/passwd', '/%2e%2e/%2e%2e/secret', '/..%2f..%2fpackage.json']) { const t = await get(p); assert.ok([403, 200].includes(t.status), p); assert.ok(!/root:|"name"/.test(t.body.toString()), 'no file outside the site root is ever returned: ' + p); }
    assert.equal((await get('/x', {}, 'POST')).status, 405);
    const spa = await get('/matches/some/deep/link'); assert.equal(spa.status, 200); assert.match(spa.body.toString(), /Campus Lost/);
    assert.equal((await get('/%00')).status, 400);
    const head = await get('/main.dart.js', {}, 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body.length, 0);
  });
});

test('D05 [Week 18] compressing a large binary never blocks other requests and returns correct bytes (max-quality sync brotli took 35 s for the 7 MB renderer)', async () => {
  await withSite(async ({ get, dir }) => {
    // Binary-like data (random 64 KB chunks re-used in random order), like a WebAssembly file. Brotli quality 11 needs about
    // 4 s per MB for this; quality 5 about 0.05 s. Text-like test data would NOT reproduce the problem (it compresses fast either way).
    const crypto = require('node:crypto');
    const chunks = Array.from({ length: 24 }, () => crypto.randomBytes(65536)); const parts = [];
    for (let i = 0; i < 48; i++) parts.push(Math.random() < 0.5 ? chunks[Math.floor(Math.random() * chunks.length)] : crypto.randomBytes(65536));
    const data = Buffer.concat(parts);                                          // about 3 MB
    fs.writeFileSync(path.join(dir, 'big.wasm'), data);
    const t0 = Date.now();
    const big = get('/big.wasm', { 'accept-encoding': 'br' });                  // first request: triggers compression
    await new Promise((r) => setTimeout(r, 30));
    const t1 = Date.now(); const small = await get('/index.html');              // must be answered while the big one is still compressing
    const smallMs = Date.now() - t1;
    const res = await big; const bigMs = Date.now() - t0;
    assert.equal(res.status, 200); assert.equal(res.headers['content-encoding'], 'br');
    assert.deepEqual(zlib.brotliDecompressSync(res.body), data, 'decoded bytes equal the original');
    assert.equal(small.status, 200); assert.ok(smallMs < 1000, 'a small request waited ' + smallMs + ' ms behind compression of a large file');
    assert.ok(bigMs < 5000, 'first compressed delivery of 3 MB took ' + bigMs + ' ms');
    const t2 = Date.now(); await get('/big.wasm', { 'accept-encoding': 'br' }); assert.ok(Date.now() - t2 < 1500, 'second request is served from the cache');
  });
});

test('D06 [Week 18] warm() pre-compresses the first-visit files so the first real request is served at once', async () => {
  await withSite(async ({ get, dir }) => {
    const crypto = require('node:crypto');
    fs.writeFileSync(path.join(dir, 'big.wasm'), Buffer.concat(Array.from({ length: 48 }, () => crypto.randomBytes(65536))));
    // a second server over the same folder, warmed before the first request arrives
    const warmed = createStaticServer(dir); await new Promise((r) => warmed.listen(0, '127.0.0.1', r));
    try {
      const tw = Date.now(); await warmed.warm(['/index.html', '/big.wasm', '/does-not-exist.js']); const warmMs = Date.now() - tw;
      const port = warmed.address().port;
      const t0 = Date.now();
      const res = await new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: '/big.wasm', headers: { 'accept-encoding': 'br' } }, (r) => { const c = []; r.on('data', (x) => c.push(x)); r.on('end', () => resolve({ status: r.statusCode, enc: r.headers['content-encoding'], n: Buffer.concat(c).length })); }).on('error', reject));
      const firstMs = Date.now() - t0;
      assert.equal(res.status, 200); assert.equal(res.enc, 'br');
      assert.ok(firstMs < 500, 'first request after warm-up took ' + firstMs + ' ms (warm-up itself took ' + warmMs + ' ms)');
    } finally { warmed.close(); warmed.closeAllConnections(); }
  });
});
