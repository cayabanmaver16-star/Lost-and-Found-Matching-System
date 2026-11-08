'use strict';
// Writes the architecture, data-flow and state-machine diagrams as SVG into docs/w17/diagrams/.
// (PNG copies for the Word reports are rendered from these SVGs.) No dependencies.
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'docs', 'w17', 'diagrams');
fs.mkdirSync(out, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const C = { ink: '#1b3a52', line: '#5b7a93', blue: '#dcebf7', green: '#dff2e1', amber: '#fdf0d5', red: '#fbe3e1', grey: '#eef2f5', white: '#ffffff', accent: '#1b5e8c' };

class Svg {
  constructor(w, h, title) { this.w = w; this.h = h; this.parts = []; this.title = title; }
  text(x, y, s, { size = 13, weight = 'normal', anchor = 'start', fill = C.ink, italic = false } = {}) {
    this.parts.push(`<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" ${italic ? 'font-style="italic"' : ''} text-anchor="${anchor}" fill="${fill}">${esc(s)}</text>`);
  }
  box(x, y, w, h, title, lines = [], { fill = C.blue, stroke = C.line, dash = false, rx = 8, titleSize = 14, size = 12, align = 'start', titleFill = C.ink } = {}) {
    this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" ${dash ? 'stroke-dasharray="7 5"' : ''}/>`);
    const tx = align === 'middle' ? x + w / 2 : x + 10;
    if (title) this.text(tx, y + 20, title, { size: titleSize, weight: 'bold', anchor: align, fill: titleFill });
    lines.forEach((l, i) => this.text(tx, y + 40 + i * (size + 4), l, { size, anchor: align }));
  }
  arrow(x1, y1, x2, y2, label = '', { dash = false, color = C.accent, lx = 0, ly = -6, anchor = 'middle' } = {}) {
    this.parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2" ${dash ? 'stroke-dasharray="6 4"' : ''} marker-end="url(#arr)"/>`);
    if (label) this.text((x1 + x2) / 2 + lx, (y1 + y2) / 2 + ly, label, { size: 11, anchor, fill: color, weight: 'bold' });
  }
  poly(points, label, { color = C.accent, lx = 0, ly = -6, dash = false } = {}) {
    this.parts.push(`<polyline points="${points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2" ${dash ? 'stroke-dasharray="6 4"' : ''} marker-end="url(#arr)"/>`);
    if (label) { const m = points[Math.floor(points.length / 2)]; this.text(m[0] + lx, m[1] + ly, label, { size: 11, fill: color, weight: 'bold', anchor: 'middle' }); }
  }
  render() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}"><title>${esc(this.title)}</title>
<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.accent}"/></marker></defs>
<rect width="100%" height="100%" fill="${C.white}"/>
${this.parts.join('\n')}
</svg>\n`;
  }
}

// ---------------------------------------------------------------- 1. Architecture
(() => {
  const s = new Svg(1240, 825, 'Lost-and-Found architecture and trust boundaries');
  s.text(620, 30, 'Campus Lost-and-Found: final architecture (single-instance pilot)', { size: 20, weight: 'bold', anchor: 'middle' });
  // trust boundary 1
  s.box(20, 50, 300, 700, 'Browsers (untrusted)', [], { fill: C.grey, dash: true, stroke: '#9b6b2f', titleFill: '#7a4d12' });
  s.text(32, 90, 'TB1: network and client', { size: 11, italic: true, fill: '#7a4d12' });
  s.box(40, 110, 260, 90, 'Student / employee', ['Report lost or found items', 'See own matches and notices'], { fill: C.white });
  s.box(40, 215, 260, 90, 'Security officer', ['Report found items', 'Verify or refuse claims'], { fill: C.white });
  s.box(40, 320, 260, 90, 'Custodian', ['Verify, release, dispose', 'Re-send failed notices'], { fill: C.white });
  s.box(40, 440, 260, 130, 'Flutter Web app', ['Runs in the browser; token kept', 'in memory only (never stored)', 'Client checks are convenience:', 'the server validates everything'], { fill: C.green });
  s.box(40, 595, 260, 130, 'Static host / CDN', ['Serves the app files', 'gzip/brotli, ETag revalidation', '(no stale app code after deploy)', 'security headers, SPA fallback'], { fill: C.amber });
  s.arrow(170, 570, 170, 595, 'downloads app', { lx: 52 });
  // API
  s.box(380, 50, 520, 700, 'API server: Node.js + Express (one process)', [], { fill: '#f6fafd', stroke: C.accent });
  s.text(392, 90, 'Every request passes the same pipeline, in this order:', { size: 12, italic: true });
  const steps = [
    ['1  Metrics + slow-request log', 'counts, latency, event-loop delay'],
    ['2  Security headers (helmet) + CORS allow-list', 'HSTS, nosniff, CSP; only configured origins'],
    ['3  Rate limits', 'global per IP (proxy-aware), login per IP, lockout per account'],
    ['4  JSON parser', '10 KB limit, malformed JSON -> 400'],
    ['5  Authentication', 'signed token (HS256), expiry, revocation; role from token only'],
    ['6  Durability gate', 'a 2xx is sent only after the change is on disk'],
    ['7  Routes + role checks + ownership checks', '401 / 403 / 404; staff-only operations'],
  ];
  steps.forEach(([t, d], i) => s.box(400, 104 + i * 50, 480, 44, t, [], { fill: C.blue, size: 11, titleSize: 12 }) || s.text(412, 104 + i * 50 + 36, d, { size: 11 }));
  s.box(400, 462, 230, 128, 'Workflow', ['Strict validation (type, length,', 'real dates), duplicate control,', 'state machine, separation of', 'duties, audit trail'], { fill: C.green, size: 11 });
  s.box(650, 462, 230, 128, 'Matching (cached tokens)', ['Category + description overlap', '+ location + date -> score;', 'candidate needs score >= 50 and', '>= 50% word overlap'], { fill: C.green, size: 11 });
  s.box(400, 605, 230, 125, 'Store (group commit)', ['Concurrent writes share one', 'async atomic file write; .bak', 'rotated; recovers from crash', 'or corruption automatically'], { fill: C.amber, size: 11 });
  s.box(650, 605, 230, 125, 'Notifier', ['3 attempts, 1 s then 2 s backoff,', 'then the manual queue; staff can', 're-send (guarded against', 'double delivery)'], { fill: C.green, size: 11 });
  // right column
  s.box(960, 50, 260, 320, 'Outside the API process', [], { fill: C.grey, dash: true, stroke: '#9b6b2f', titleFill: '#7a4d12' });
  s.text(972, 90, 'TB2 and TB3', { size: 11, italic: true, fill: '#7a4d12' });
  s.box(975, 105, 230, 100, 'Data file: db.json (+ .bak)', ['Single writer; JSON; ~0.4 KB per', 'report. Replace with a database', 'before ~10,000 stored reports'], { fill: C.amber, size: 11 });
  s.box(975, 225, 230, 125, 'Notification channel', ['Simulated in the pilot. A real', 'e-mail/SMS gateway must move', 'out of the request (queue) so', 'a slow gateway cannot slow users'], { fill: C.red, size: 11 });
  s.box(960, 390, 260, 190, 'Operations (read-only probes)', ['GET /health   liveness', 'GET /ready    readiness (503 when', '              storage fails / draining)', 'GET /api/metrics (staff only)', 'GET /api/openapi.json  API contract', 'Graceful shutdown (SIGTERM)', 'Health-gated deploy + rollback'], { fill: C.blue, size: 11 });
  s.box(960, 600, 260, 130, 'Alerts to set (see runbook)', ['event-loop delay p99 > 100 ms', 'CPU > 100% for 5 min', '/ready not 200, 5xx rate > 1%', 'data file > 8 MB'], { fill: C.red, size: 11 });
  // connectors (routed so none cross a box)
  s.poly([[300, 505], [350, 505], [350, 126], [400, 126]], 'HTTPS (TLS 1.2+)', { lx: -2, ly: 110 });
  s.arrow(170, 570, 170, 595, 'downloads app', { lx: 52 });
  s.arrow(630, 526, 650, 526, '');
  s.arrow(515, 590, 515, 605, '', { color: C.line });
  s.arrow(765, 590, 765, 605, '', { color: C.line });
  s.poly([[515, 730], [515, 765], [938, 765], [938, 155], [975, 155]], 'persist', { lx: 0, ly: -6, color: '#8a5a12' });
  s.poly([[880, 668], [915, 668], [915, 290], [975, 290]], 'notify', { lx: -22, ly: 140, color: '#a33a2f' });
  s.arrow(960, 470, 900, 470, '', { dash: true, color: C.line });
  s.text(620, 805, 'TB1: client to API (TLS, auth, validation, rate limits)   TB2: API to data file (atomic writes, single writer)   TB3: API to notification channel (ids only, bounded retries)', { size: 11, anchor: 'middle', italic: true });
  fs.writeFileSync(path.join(out, 'architecture.svg'), s.render());
})();

// ---------------------------------------------------------------- 2. Journey / data flow (swimlanes)
(() => {
  const s = new Svg(1240, 720, 'Lost-and-Found main journey and data flow');
  s.text(620, 30, 'Main journey and automation (data flow)', { size: 20, weight: 'bold', anchor: 'middle' });
  const lanes = [['Student / owner', 60], ['Security officer', 195], ['API (automatic)', 330], ['Custodian', 520]];
  const laneH = [135, 135, 190, 150];
  lanes.forEach(([name, y], i) => { s.box(20, y, 1200, laneH[i], '', [], { fill: i % 2 ? C.grey : C.white, rx: 4 }); s.text(30, y + 22, name, { size: 14, weight: 'bold', fill: C.accent }); });
  const step = (x, y, n, t, lines, fill = C.blue) => { s.box(x, y, 200, 78, `${n}  ${t}`, lines, { fill, size: 11, titleSize: 12 }); };
  step(150, 90, 1, 'Report lost item', ['category, description, place, date', 'owner sees only their own data']);
  step(150, 225, 2, 'Report found item', ['same form (found); any signed-in', 'user may report a found item']);
  step(380, 360, 3, 'Validate + de-duplicate', ['real date, lengths, text only;', 'same reporter, same item -> 409'], C.green);
  step(620, 360, 4, 'Match + notify', ['score >= 50 and >= 50% word', 'overlap; notice to the owner,', '3 attempts with backoff'], C.green);
  step(860, 360, 5, 'Failed notice?', ['permanent failure -> Manual queue', '(staff re-send; no double send)'], C.red);
  step(890, 90, 6, 'See possible match', ['plain-language status;', 'only their own item shown']);
  step(380, 555, 7, 'Review the match', ['both items side by side;', 'cannot decide own item'], C.amber);
  step(620, 555, 8, 'Verify / refuse', ['proof or reason required (5-200', 'characters), recorded in the audit'], C.amber);
  step(860, 555, 9, 'Release (confirm)', ['both reports close; competing', 'matches withdrawn; audited'], C.amber);
  s.box(150, 375, 200, 78, '10  Aging job (hourly)', ['30 days: one reminder to staff;', '90 days: disposal review in the', 'Manual queue (once each)'], { fill: C.green, size: 11, titleSize: 12 });
  s.poly([[350, 129], [362, 129], [362, 385], [380, 385]], ''); s.poly([[350, 264], [372, 264], [372, 413], [380, 413]], '');
  s.arrow(580, 399, 620, 399, ''); s.arrow(820, 399, 860, 399, '');
  s.poly([[720, 360], [720, 300], [990, 300], [990, 168]], 'candidate notice', { ly: -6 });
  s.arrow(720, 438, 480, 555, '', { dash: true, color: C.line });
  s.arrow(580, 594, 620, 594, ''); s.arrow(820, 594, 860, 594, '');
  s.poly([[1060, 594], [1195, 594], [1195, 150], [1090, 150]], ''); s.text(1188, 420, 'released / closed', { size: 11, anchor: 'end', weight: 'bold', fill: C.accent });
  
  s.text(620, 712, 'Every state change writes an audit entry; every 2xx response is sent only after the data is on disk.', { size: 11, anchor: 'middle', italic: true });
  fs.writeFileSync(path.join(out, 'data-flow.svg'), s.render());
})();

// ---------------------------------------------------------------- 3. State machines
(() => {
  const s = new Svg(1240, 560, 'Lost-and-Found state machines');
  s.text(620, 30, 'State machines', { size: 20, weight: 'bold', anchor: 'middle' });
  const st = (x, y, name, fill = C.blue, w = 130) => s.box(x, y, w, 40, name, [], { fill, rx: 20, titleSize: 13, align: 'middle' }) || s.parts.pop() && null;
  // helper to draw a rounded state with centred label
  const state = (x, y, name, fill = C.blue, w = 130) => { s.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="40" rx="20" fill="${fill}" stroke="${C.line}" stroke-width="1.5"/>`); s.text(x + w / 2, y + 25, name, { size: 13, weight: 'bold', anchor: 'middle' }); };
  void st;
  // Match
  s.text(30, 70, 'Match', { size: 16, weight: 'bold', fill: C.accent });
  state(40, 100, 'candidate', C.amber); state(300, 100, 'verified', C.green); state(560, 100, 'released', C.green);
  state(300, 220, 'rejected', C.red); state(560, 220, 'withdrawn', C.grey);
  s.arrow(170, 120, 300, 120, 'verify (proof note)', { ly: -8 }); s.arrow(430, 120, 560, 120, 'release', { ly: -8 });
  s.arrow(110, 140, 300, 235, ''); s.text(40, 215, 'refuse (reason)', { size: 11, weight: 'bold', fill: C.accent });
  s.arrow(365, 140, 590, 222, '', { dash: true });
  s.arrow(130, 140, 560, 238, '', { dash: true, color: C.line }); s.text(700, 280, 'withdrawn: another claimant was released first', { size: 11, weight: 'bold', fill: C.accent, anchor: 'middle' });
  s.text(40, 300, 'Rules: staff only; never for an item you reported lost; both reports must still be open; release only after verification.', { size: 12, italic: true });
  // Report
  s.text(740, 70, 'Report', { size: 16, weight: 'bold', fill: C.accent });
  state(760, 100, 'open', C.blue, 110); state(990, 100, 'closed', C.green, 110); state(990, 220, 'disposed', C.grey, 110);
  s.arrow(870, 120, 990, 120, 'item released', { ly: -8 }); s.arrow(840, 140, 990, 236, ''); s.text(770, 205, 'custodian disposes', { size: 11, weight: 'bold', fill: C.accent }); s.text(770, 220, '(after 90 days)', { size: 11, weight: 'bold', fill: C.accent });
  s.text(740, 300, 'Closed and disposed reports are never matched again.', { size: 12, italic: true });
  // Notification
  s.text(30, 360, 'Notification', { size: 16, weight: 'bold', fill: C.accent });
  state(40, 390, 'queued', C.blue, 110); state(230, 390, 'sending', C.amber, 110); state(430, 390, 'delivered', C.green, 120); state(430, 480, 'failed_permanent', C.red, 150); state(700, 480, 'manual queue item', C.red, 170);
  s.arrow(150, 410, 230, 410, ''); s.arrow(340, 410, 430, 410, 'ok', { ly: -8 });
  s.poly([[285, 390], [285, 360], [340, 360], [340, 390]], 'retry (1 s, 2 s)', { lx: 20, ly: -5, dash: true });
  s.arrow(285, 430, 460, 480, '3 attempts or permanent error', { lx: -40, ly: 22 });
  s.arrow(580, 500, 700, 500, 'routed', { ly: -8 });
  s.poly([[785, 480], [785, 440], [550, 440], [550, 410]], ''); s.text(670, 432, 'staff re-send succeeds', { size: 11, weight: 'bold', fill: C.accent, anchor: 'middle' });
  s.text(40, 545, 'A re-send is refused (409) unless the notification has finally failed, so double-clicks cannot deliver twice.', { size: 12, italic: true });
  fs.writeFileSync(path.join(out, 'state-machines.svg'), s.render());
})();
console.log('SVG diagrams written to', out);
