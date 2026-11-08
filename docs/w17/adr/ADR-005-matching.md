# ADR-005: Matching - explainable word overlap with a human decision

Status: Accepted. Tuned after UAT (finding F3).

## Context
Owners describe items briefly ("brown wallet"); finders describe them in detail ("brown leather wallet with student card"). The system proposes candidates; a staff member verifies ownership. A wrong candidate costs a notification and a few minutes of staff time; a missed match costs a person their item.

## Options considered
| Option | Strengths | Weaknesses |
|---|---|---|
| A. Category gate + word overlap + location + date, with an overlap-coefficient floor (chosen) | Deterministic, cheap (microseconds per pair with cached tokens), explainable ("score 82: 5 shared words, same place, next day"), testable with fixed examples, no training data or external service | No synonyms ("bag" vs "backpack"); spelling errors are not forgiven; thresholds are judgement calls |
| B. Fuzzy matching (edit distance, stemming, synonym lists) | Forgives typos and some synonyms | More false positives; harder to explain; needs a maintained synonym list |
| C. Semantic embeddings / machine learning | Handles paraphrase and synonyms | Needs a model and data, harder to audit, a privacy and cost question for a campus system, hard to explain to a claimant |

## Decision
Option A. Words are Unicode-normalised (accents and case folded, any script; CJK uses character pairs; single digits count). A pair needs the same category, a score of at least 50, and at least half of the shorter description present in the other (overlap coefficient 0.5). Humans always make the final decision, with both items shown side by side and a recorded reason.

## Evidence
- UAT-12 (before): a found "brass padlock key with blue tag" matched two unrelated lost keys with scores 66 and 80 because they shared generic words. After the 0.5 overlap rule: no candidate for "silver house keys with blue tag" (2 of 5 words), while the brass key that differs only in tag colour (4 of 5 words) still appears for a human to judge; a brief "brown wallet" still matches a detailed found wallet.
- H06, H11, H12, A01, A02 (boundary: exactly 50% accepted); scaling guard P07.

## Consequences
- Recall limits: a synonym or a misspelling will not match. The owner can submit a second report with other words, and staff can search reports manually.
- If testers report missed matches, the first remedy is a small synonym table (option B-lite), measured against the UAT scenarios before and after.

## Revisit when
UAT or pilot data show missed matches caused by wording, or volume makes manual review heavy.
