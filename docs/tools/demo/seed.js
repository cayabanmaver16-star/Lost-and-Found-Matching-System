'use strict';
// Optional background history so lists are not empty during the demo. The main story (a lost and a found wallet)
// is deliberately NOT seeded: it is performed live. Everything here is fictional.
const lib = require('../perf/lib');
const day = (n = 0) => lib.dayAgo(n);

async function seed(base) {
  const tok = {}; for (const id of ['stu1', 'stu2', 'emp1', 'sec1', 'cust1']) tok[id] = await lib.login(base, id);
  const post = (who, body) => lib.call(base, 'POST', '/api/reports', { token: tok[who], body });
  const rep = (type, category, description, location, ago) => ({ type, category, description, location, eventDate: day(ago) });

  // 1. A completed case (history): lost + found + verify + release
  await post('emp1', rep('lost', 'books', 'organic chemistry textbook green cover with name label', 'library reading room', 6));
  const f = await post('sec1', rep('found', 'books', 'green organic chemistry textbook name label inside', 'library reading room desk', 5));
  const m = f.body.matches[0];
  await lib.call(base, 'POST', `/api/matches/${m.id}/verify`, { token: tok.cust1, body: { ownershipConfirmed: true, note: 'Name label matched staff ID; described the cover' } });
  await lib.call(base, 'POST', `/api/matches/${m.id}/release`, { token: tok.cust1, body: {} });

  // 2. An open lost report with no match yet, and an unclaimed found item
  await post('stu2', rep('lost', 'keys', 'silver house keys with blue tag and bottle opener', 'gym lockers', 3));
  await post('sec1', rep('found', 'clothing', 'navy blue hoodie with university crest size medium', 'chapel steps', 2));

  // 3. A notification that could not be delivered: waits in the manual queue so the re-send can be shown live
  await post('stu1', rep('lost', 'bag', 'grey backpack with zipper pouch and a laptop sticker', 'canteen', 1));
  await lib.call(base, 'POST', '/api/reports', { token: tok.sec1, body: { ...rep('found', 'bag', 'grey backpack zipper pouch laptop sticker', 'canteen tables', 0), simulateDelivery: 'permanent' } });
}
module.exports = { seed };
