'use strict';
const CATEGORIES = ['electronics', 'wallet', 'keys', 'bag', 'clothing', 'id-card', 'books', 'other'];
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'with', 'in', 'on', 'at', 'my', 'is', 'it', 'to', 'for', 'near', 'color', 'colour']);
const MATCH_THRESHOLD = 50; // score >= threshold (and at least one shared descriptive word) => candidate match
const MIN_DESCRIPTION_OVERLAP = 0.5; // at least half of the shorter description must appear in the other
const DAY = 86400000;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// Unicode-aware normalisation: case-fold, strip accents (niño = nino), keep letters/digits of any script.
function normalise(text) {
  return String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
}

function tokensUncached(text) {
  const out = new Set();
  for (const w of normalise(text).split(/\s+/)) {
    if (!w || STOP.has(w)) continue;
    if (CJK.test(w)) {                       // no spaces between words in CJK text: use character bigrams
      const chars = [...w];
      if (chars.length === 1) out.add(w);
      for (let i = 0; i < chars.length - 1; i++) out.add(chars[i] + chars[i + 1]);
    } else if (w.length > 1 || /\p{N}/u.test(w)) {
      out.add(w);                            // single digits are meaningful ("key 3" is not "key 7")
    }
  }
  return out;
}
// Reports are immutable once created, so tokens and fingerprints are computed once per report object.
// (Re-tokenising every open report on every request was the dominant CPU cost at 2,000+ reports.)
const tokenCache = new WeakMap();
const fpCache = new WeakMap();
function tokens(text) { return tokensUncached(text); }
function reportTokens(r) {
  let t = tokenCache.get(r);
  if (!t) { t = tokensUncached(r.description); tokenCache.set(r, t); }
  return t;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

// Duplicate fingerprint: same reporter + type + category + normalised description tokens
function fingerprint(r) {
  let fp = fpCache.get(r);
  if (!fp) { fp = [r.type, r.reporterId, r.category, [...reportTokens(r)].sort().join('_')].join('|'); fpCache.set(r, fp); }
  return fp;
}

// Score 0-100: category 40, description 35, location 15, date proximity 10.
// Category must match AND the descriptions must share at least one word, otherwise same-day same-category
// items would reach the threshold on category + date alone and spam claimants with unrelated candidates.
function score(lost, found) {
  if (lost.type !== 'lost' || found.type !== 'found') return 0;
  if (lost.category !== found.category) return 0;
  const a = reportTokens(lost); const b = reportTokens(found);
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  if (!shared) return 0;
  // Overlap coefficient: how much of the SHORTER description is covered by the other. One generic word in common
  // ("green", "tag") is not enough, but a brief lost description ("brown wallet") still matches a detailed found one.
  if (shared / Math.min(a.size, b.size) < MIN_DESCRIPTION_OVERLAP) return 0;
  const desc = shared / (a.size + b.size - shared);
  let s = 40 + Math.round(35 * desc);
  s += Math.round(15 * jaccard(tokens(lost.location), tokens(found.location)));
  const gap = (new Date(found.eventDate) - new Date(lost.eventDate)) / DAY;
  if (gap >= -1 && gap <= 14) s += Math.round(10 * (1 - Math.max(0, gap) / 14));
  return s;
}
module.exports = { CATEGORIES, MATCH_THRESHOLD, MIN_DESCRIPTION_OVERLAP, tokens, fingerprint, score };
