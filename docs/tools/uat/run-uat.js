'use strict';
// Scripted user acceptance scenarios against a LIVE server process (fresh data), one persona per step.
// Each scenario lists acceptance criteria; each step records expected vs actual so the results can go into the UAT report.
// Usage: node uat/run-uat.js [label]   -> docs/w17/uat-results-<label>.json and .md
const fs = require('fs');
const path = require('path');
const lib = require('../perf/lib');

const label = process.argv[2] || 'run';
const OUT = path.join(lib.ROOT, 'docs', 'w17');
fs.mkdirSync(OUT, { recursive: true });
const day = (n = 0) => lib.dayAgo(n);
const lost = (o = {}) => ({ type: 'lost', category: 'wallet', description: 'black leather wallet with student card and red sticker', location: 'library second floor', eventDate: day(1), ...o });
const found = (o = {}) => ({ ...lost(), type: 'found', description: 'black leather wallet, student card inside, red sticker on back', location: 'library 2nd floor study desk', eventDate: day(0), ...o });

const results = [];
let cur = null;
const scenario = (id, title, persona, criteria) => { cur = { id, title, persona, criteria, steps: [], pass: true }; results.push(cur); return cur; };
const step = (name, expected, ok, actual) => { cur.steps.push({ name, expected, actual: String(actual), pass: !!ok }); if (!ok) cur.pass = false; };

(async () => {
  const srv = await lib.startServer({ label: 'uat', extraEnv: { ALLOW_SIM: '1' } });
  const B = srv.base;
  const tok = {}; for (const id of ['stu1', 'stu2', 'emp1', 'sec1', 'cust1']) tok[id] = await lib.login(B, id);
  const api = (who, m, p, body) => lib.call(B, m, p, { token: typeof who === 'string' ? tok[who] : who && who.token, body });
  try {
    // UAT-01 sign-in
    scenario('UAT-01', 'Sign-in, wrong password, lockout and sign-out', 'Any user', ['Valid users reach their role; errors do not reveal whether the user exists; repeated failures lock the account; sign-out ends the session']);
    for (const [id, role] of [['stu1', 'student'], ['emp1', 'employee'], ['sec1', 'security'], ['cust1', 'custodian']]) { const r = await api(id, 'GET', '/api/auth/me'); step(`${id} identifies as ${role}`, `200, role ${role}`, r.status === 200 && r.body.role === role, `${r.status} ${r.body && r.body.role}`); }
    const bad1 = await lib.call(B, 'POST', '/api/auth/login', { body: { userId: 'stu2', password: 'wrong' } });
    const bad2 = await lib.call(B, 'POST', '/api/auth/login', { body: { userId: 'nobody', password: 'wrong' } });
    step('wrong password and unknown user look identical', '401 with same message', bad1.status === 401 && bad2.status === 401 && bad1.body.error.message === bad2.body.error.message, `${bad1.body.error.message} | ${bad2.body.error.message}`);
    const lockSrv = await lib.startServer({ label: 'uat-lock', extraEnv: { LOGIN_MAX_FAILURES: '5' } });
    for (let i = 0; i < 5; i++) await lib.call(lockSrv.base, 'POST', '/api/auth/login', { body: { userId: 'stu2', password: 'bad' + i } });
    const locked = await lib.call(lockSrv.base, 'POST', '/api/auth/login', { body: { userId: 'stu2', password: lib.pw('stu2') } });
    step('account locks after 5 failures, even with the right password', '429 ACCOUNT_LOCKED', locked.status === 429 && locked.body.error.code === 'ACCOUNT_LOCKED', `${locked.status} ${locked.body.error.code}`);
    await lib.stopServer(lockSrv);
    const t = await lib.login(B, 'emp1'); await lib.call(B, 'POST', '/api/auth/logout', { token: t });
    const after = await lib.call(B, 'GET', '/api/reports', { token: t });
    step('token is refused after sign-out', '401', after.status === 401, after.status);

    // UAT-02 / 03 / 04 / 05: the main journey
    scenario('UAT-02', 'Student reports a lost item (validation and success)', 'Student (stu1)', ['Invalid input is explained field by field; a valid report is accepted and visible only to its owner and staff']);
    const inv = await api('stu1', 'POST', '/api/reports', { type: 'lost', category: 'wallet', description: 'x', location: '', eventDate: day(0) });
    step('too-short description and empty location are rejected with field messages', '422 with description and location details', inv.status === 422 && inv.body.error.details.description && inv.body.error.details.location, `${inv.status} ${Object.keys(inv.body.error.details || {})}`);
    const r1 = await api('stu1', 'POST', '/api/reports', lost());
    step('valid lost report accepted', '201 status open', r1.status === 201 && r1.body.report.status === 'open', `${r1.status} ${r1.body.report && r1.body.report.id}`);
    const mine = await api('stu1', 'GET', '/api/reports'); const theirs = await api('stu2', 'GET', '/api/reports');
    step('owner sees it, another student does not', 'stu1: 1 report, stu2: 0', mine.body.length === 1 && theirs.body.length === 0, `stu1 ${mine.body.length}, stu2 ${theirs.body.length}`);

    scenario('UAT-03', 'Security officer reports a matching found item', 'Security officer (sec1)', ['A found item that resembles an open lost item creates exactly one candidate match and notifies the owner']);
    const f1 = await api('sec1', 'POST', '/api/reports', found());
    step('found report accepted and one candidate created', '201, 1 match, score >= 50', f1.status === 201 && f1.body.matches.length === 1 && f1.body.matches[0].score >= 50, `${f1.status} matches=${f1.body.matches && f1.body.matches.length} score=${f1.body.matches && f1.body.matches[0] && f1.body.matches[0].score}`);
    const m1 = f1.body.matches[0];

    scenario('UAT-04', 'Student sees the match and notification', 'Student (stu1)', ['The owner is told a candidate exists without seeing the finder or the found item\'s identifier']);
    const sm = await api('stu1', 'GET', '/api/matches'); const sn = await api('stu1', 'GET', '/api/notifications');
    step('student sees the candidate match without the found-report id', '1 match, no foundId', sm.body.length === 1 && sm.body[0].foundId === undefined && sm.body[0].status === 'candidate', JSON.stringify(sm.body[0]));
    step('notification delivered', 'delivered on attempt 1', sn.body.length === 1 && sn.body[0].status === 'delivered' && sn.body[0].attempts === 1, JSON.stringify({ s: sn.body[0] && sn.body[0].status, a: sn.body[0] && sn.body[0].attempts }));

    scenario('UAT-05', 'Custodian verifies ownership and releases the item', 'Custodian (cust1)', ['Release is impossible before verification; after release both reports are closed and the owner sees the outcome; every step is audited']);
    const early = await api('cust1', 'POST', `/api/matches/${m1.id}/release`, {});
    step('release before verification is blocked', '409', early.status === 409, early.status);
    const ver = await api('cust1', 'POST', `/api/matches/${m1.id}/verify`, { ownershipConfirmed: true, note: 'Student ID and wallet contents matched' });
    step('ownership verified', '200 verified', ver.status === 200 && ver.body.status === 'verified', `${ver.status} ${ver.body.status}`);
    const rel = await api('cust1', 'POST', `/api/matches/${m1.id}/release`, {});
    step('item released to the owner', '200 released to stu1', rel.status === 200 && rel.body.releasedTo === 'stu1', `${rel.status} ${rel.body.releasedTo}`);
    const after1 = await api('stu1', 'GET', '/api/matches');
    step('owner sees the match as released', 'released', after1.body[0].status === 'released', after1.body[0].status);
    const aud = await api('cust1', 'GET', '/api/audit');
    step('audit trail has created, verified, released', 'all three actions present', ['report.created', 'match.verified', 'match.released'].every((a) => aud.body.some((x) => x.action === a)), aud.body.map((x) => x.action).join(','));

    // UAT-06 duplicates
    scenario('UAT-06', 'Duplicate and different reports', 'Student (stu2)', ['Re-submitting the same report is refused with a pointer to the original; a different item is accepted']);
    const a = await api('stu2', 'POST', '/api/reports', lost({ category: 'keys', description: 'silver house keys with blue tag', location: 'gym' }));
    const dup = await api('stu2', 'POST', '/api/reports', lost({ category: 'keys', description: 'Silver HOUSE keys, with blue tag!', location: 'gym' }));
    step('same report again is refused', '409 DUPLICATE_REPORT naming the original', a.status === 201 && dup.status === 409 && dup.body.error.details.existingId === a.body.report.id, `${dup.status} ${dup.body.error.code} ${dup.body.error.details && dup.body.error.details.existingId}`);
    const diff = await api('stu2', 'POST', '/api/reports', lost({ category: 'keys', description: 'brass padlock key with green tag', location: 'gym' }));
    step('a different item is accepted', '201', diff.status === 201, diff.status);

    // UAT-07 access control
    scenario('UAT-07', 'People cannot do or see what their role does not allow', 'Student, anonymous', ['Staff functions and other people\'s data are not available to students; missing or forged identity is refused']);
    const sv = await api('stu1', 'POST', `/api/matches/${m1.id}/verify`, { ownershipConfirmed: true, note: 'ID card and contents checked' }); const sq = await api('stu1', 'GET', '/api/manual-queue'); const anon = await lib.call(B, 'GET', '/api/reports');
    step('student cannot verify', '403', sv.status === 403, sv.status); step('student cannot open the manual queue', '403', sq.status === 403, sq.status); step('no token', '401', anon.status === 401, anon.status);
    const other = await api('stu1', 'GET', `/api/reports/${a.body.report.id}`);
    step('student cannot open another student\'s report', '404 (existence not revealed)', other.status === 404, other.status);

    // UAT-08/09 notification failures
    scenario('UAT-08', 'A notification that cannot be delivered reaches a human', 'Security officer, custodian', ['A permanent delivery failure creates a manual-queue item; the custodian can re-send and the item resolves']);
    await api('stu1', 'POST', '/api/reports', lost({ category: 'bag', description: 'grey backpack with zipper pouch', location: 'canteen' }));
    const fp = await api('sec1', 'POST', '/api/reports', found({ category: 'bag', description: 'grey backpack zipper pouch', location: 'canteen', simulateDelivery: 'permanent' }));
    const q = (await api('cust1', 'GET', '/api/manual-queue')).body.find((x) => x.kind === 'notification_failure');
    step('failure is routed to the manual queue', 'open notification_failure with a reason', !!q && q.status === 'open' && !!q.reason, JSON.stringify(q && { id: q.id, reason: q.reason }));
    const rs = await api('cust1', 'POST', `/api/manual-queue/${q.id}/retry-notification`, {});
    step('re-send delivers and resolves the item', 'delivered + resolved', rs.status === 200 && rs.body.notification.status === 'delivered' && rs.body.queueItem.status === 'resolved', `${rs.status} ${rs.body.notification && rs.body.notification.status}`);
    scenario('UAT-09', 'A temporary delivery problem fixes itself', 'Security officer', ['A transient failure is retried automatically and no staff action is needed']);
    await api('stu1', 'POST', '/api/reports', lost({ category: 'electronics', description: 'blue phone case with cracked corner', location: 'lab 3' }));
    const ft = await api('sec1', 'POST', '/api/reports', found({ category: 'electronics', description: 'blue phone case cracked corner', location: 'lab 3', simulateDelivery: 'transient' }));
    const nts = (await api('cust1', 'GET', '/api/notifications')).body.filter((n) => n.matchId === ft.body.matches[0].id);
    step('delivered after retries without staff action', 'delivered on attempt 3', nts.length === 1 && nts[0].status === 'delivered' && nts[0].attempts === 3, JSON.stringify({ s: nts[0] && nts[0].status, a: nts[0] && nts[0].attempts }));

    // UAT-10 conflict of interest
    scenario('UAT-10', 'Staff cannot decide a match for their own lost item', 'Security officer (sec1) and custodian', ['A staff member who lost something cannot verify or release its match; another staff member can']);
    await api('sec1', 'POST', '/api/reports', lost({ category: 'clothing', description: 'navy blue hoodie with university crest', location: 'chapel' }));
    const fc = await api('cust1', 'POST', '/api/reports', found({ category: 'clothing', description: 'navy hoodie university crest', location: 'chapel' }));
    const own = await api('sec1', 'POST', `/api/matches/${fc.body.matches[0].id}/verify`, { ownershipConfirmed: true, note: 'ID card and contents checked' });
    step('own match cannot be verified', '403 CONFLICT_OF_INTEREST', own.status === 403 && own.body.error.code === 'CONFLICT_OF_INTEREST', `${own.status} ${own.body.error && own.body.error.code}`);
    const ok = await api('cust1', 'POST', `/api/matches/${fc.body.matches[0].id}/verify`, { ownershipConfirmed: true, note: 'checked' });
    step('another staff member can', '200', ok.status === 200, ok.status);

    // UAT-11 rejection and two claimants
    scenario('UAT-11', 'Wrong claimant rejected; one item, two claimants', 'Custodian, two students', ['Rejecting a match leaves the reports open; an item can only be released to one person']);
    await api('stu1', 'POST', '/api/reports', lost({ category: 'id-card', description: 'student id card holder lanyard', location: 'main gate' }));
    await api('stu2', 'POST', '/api/reports', lost({ category: 'id-card', description: 'lanyard with student id card holder', location: 'main gate' }));
    const fi = await api('sec1', 'POST', '/api/reports', found({ category: 'id-card', description: 'student id card holder on lanyard', location: 'main gate' }));
    step('both claimants become candidates', '2 matches', fi.body.matches.length === 2, fi.body.matches.length);
    const [c1, c2] = fi.body.matches;
    const rej = await api('cust1', 'POST', `/api/matches/${c1.id}/verify`, { ownershipConfirmed: false, note: 'could not describe the card' });
    step('first claimant rejected', 'rejected', rej.body.status === 'rejected', rej.body.status);
    const v2 = await api('cust1', 'POST', `/api/matches/${c2.id}/verify`, { ownershipConfirmed: true, note: 'described correctly' });
    const r2 = await api('cust1', 'POST', `/api/matches/${c2.id}/release`, {});
    step('second claimant verified and released', '200 released', v2.status === 200 && r2.status === 200, `${v2.status}/${r2.status}`);
    const again = await api('cust1', 'POST', `/api/matches/${c1.id}/verify`, { ownershipConfirmed: true, note: 'ID card and contents checked' });
    step('rejected claimant cannot be verified afterwards', '409', again.status === 409, again.status);

    // UAT-12 precision and recall
    scenario('UAT-12', 'Unrelated items are not matched; brief descriptions still are', 'Security officer', ['Different categories or generic shared words (a colour, "tag") do not create a candidate; a short lost description still matches a detailed found one']);
    const books = await api('stu1', 'POST', '/api/reports', lost({ category: 'books', description: 'organic chemistry textbook green cover', location: 'library' }));
    const unrelated = await api('sec1', 'POST', '/api/reports', found({ category: 'keys', description: 'organic chemistry textbook green cover', location: 'library' }));
    step('different category never matches the books report', 'no match references the books report', !unrelated.body.matches.some((m) => m.lostId === books.body.report.id), unrelated.body.matches.map((m) => m.lostId).join(',') || 'none');
    const noshared = await api('sec1', 'POST', '/api/reports', found({ category: 'books', description: 'pink umbrella with duck handle', location: 'library' }));
    step('same category, nothing in common: no match', '0 matches', noshared.body.matches.length === 0, noshared.body.matches.length);
    // 'a' is stu2's open lost report "silver house keys with blue tag" from UAT-06
    const generic = await api('sec1', 'POST', '/api/reports', found({ category: 'keys', description: 'brass padlock key with blue tag', location: 'gym entrance' }));
    step('found keys sharing only generic words ("blue", "tag") are NOT a candidate for the silver house keys', 'no match references that report', !generic.body.matches.some((m) => m.lostId === a.body.report.id), 'matched lost reports: ' + (generic.body.matches.map((m) => m.lostId + ' (score ' + m.score + ')').join(', ') || 'none'));
    await api('emp1', 'POST', '/api/reports', lost({ category: 'wallet', description: 'brown wallet', location: 'admin office' }));
    const brief = await api('sec1', 'POST', '/api/reports', found({ category: 'wallet', description: 'brown leather wallet with student card and some cash', location: 'admin office lobby' }));
    step('a brief lost description still matches a detailed found one', '1 match', brief.body.matches.length === 1, brief.body.matches.length);

    // UAT-13 aging
    scenario('UAT-13', 'Unclaimed items: reminder then disposal review', 'Custodian', ['At 30 days one reminder is raised; at 90 days a disposal review appears; the custodian can dispose; nothing repeats']);
    await api('sec1', 'POST', '/api/reports', found({ category: 'other', description: 'silver thermos flask engraved initials', location: 'cafeteria' }));
    const d = (n) => new Date(Date.now() + n * 86400000).toISOString();
    const a31 = await api('cust1', 'POST', '/api/jobs/aging', { now: d(31) }); const a31b = await api('cust1', 'POST', '/api/jobs/aging', { now: d(32) });
    step('30-day reminder raised once', '1 then 0', a31.body.reminded.length >= 1 && a31b.body.reminded.length === 0, `${a31.body.reminded.length} then ${a31b.body.reminded.length}`);
    const a91 = await api('cust1', 'POST', '/api/jobs/aging', { now: d(91) });
    const rev = (await api('cust1', 'GET', '/api/manual-queue')).body.find((x) => x.kind === 'disposal_review');
    step('90-day disposal review appears', 'open disposal_review', a91.body.disposalFlagged.length >= 1 && !!rev, a91.body.disposalFlagged.length);
    const disp = await api('cust1', 'POST', `/api/manual-queue/${rev.id}/resolve`, { resolution: 'Donated to charity', dispose: true });
    step('custodian disposes', 'resolved', disp.status === 200 && disp.body.status === 'resolved', `${disp.status} ${disp.body.status}`);

    // UAT-14 forged identity
    scenario('UAT-14', 'Forged or expired sign-in is refused', 'Any', ['A tampered token is rejected and never grants a higher role']);
    const [h, , s] = tok.stu1.split('.');
    const forged = [h, Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(tok.stu1.split('.')[1], 'base64url')), role: 'custodian' })).toString('base64url'), s].join('.');
    const fr = await lib.call(B, 'GET', '/api/manual-queue', { token: forged });
    step('token with role changed to custodian', '401', fr.status === 401, fr.status);
  } finally { await lib.stopServer(srv); }

  const passed = results.filter((r) => r.pass).length;
  const out = { label, ranAt: new Date().toISOString(), scenarios: results, summary: { scenarios: results.length, passed, failed: results.length - passed, steps: results.reduce((a, r) => a + r.steps.length, 0), stepsFailed: results.reduce((a, r) => a + r.steps.filter((x) => !x.pass).length, 0) } };
  fs.writeFileSync(path.join(OUT, `uat-results-${label}.json`), JSON.stringify(out, null, 2));
  let md = `# Scripted UAT results (${label})\n\n${passed}/${results.length} scenarios passed; ${out.summary.steps - out.summary.stepsFailed}/${out.summary.steps} steps.\n\n`;
  for (const r of results) { md += `## ${r.id} ${r.title} - ${r.pass ? 'PASS' : 'FAIL'}\nPersona: ${r.persona}\n\n| Step | Expected | Actual | Result |\n|---|---|---|---|\n`; for (const st of r.steps) md += `| ${st.name} | ${st.expected} | ${st.actual.replace(/\|/g, '/')} | ${st.pass ? 'pass' : 'FAIL'} |\n`; md += '\n'; }
  fs.writeFileSync(path.join(OUT, `uat-results-${label}.md`), md);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id} ${r.title}${r.pass ? '' : '\n' + r.steps.filter((x) => !x.pass).map((x) => `      - ${x.name}: expected ${x.expected}, got ${x.actual}`).join('\n')}`);
  console.log(`\n${passed}/${results.length} scenarios, ${out.summary.steps - out.summary.stepsFailed}/${out.summary.steps} steps passed`);
})().catch((e) => { console.error('UAT runner failed:', e); process.exit(1); });
