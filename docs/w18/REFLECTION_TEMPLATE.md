# Individual contribution record and reflection (template to complete)

**This document must be written by the student, in their own words.** It is the one deliverable that cannot be produced for you: it records what *you* did, decided and understand. The prompts and facts below are here to help you remember and to keep the record accurate. Delete any guidance text before submitting.

Student: ______________________  ID: ____________  Section: ________  Project: 18 Lost-and-Found Matching System  Date: ____________

## A. Disclosure of assistance (complete honestly, before anything else)
The repository you are submitting was built in a working session with an AI assistant (Claude, running in your terminal and your project folder). The assistant wrote and ran the code, tests, scripts and documents at your direction, and reported results as it went. Course rules for this project say the work is individual and that collaboration is not permitted unless the instructor authorises it. **Check your course policy on AI assistance now and state the position here accurately.** If disclosure is required or you are unsure, tell your instructor before the viva rather than after.

Complete these in your own words:
1. What assistance did you use, and for which parts? ______________________________________________
2. Is it permitted under the course policy, and how do you know (policy text, or the instructor's written answer)? ______________________________________________
3. Which decisions did you make yourself (scope, which findings to fix, the recommendation)? ______________________________________________
4. What did you personally run, read, test and check? ______________________________________________

Why this matters: the viva tests understanding. Anything in this repository you cannot explain is a risk to you, however good it looks. Use VIVA_PREP.md section 5 to find out where your understanding is thin, and fix that before the day.

## B. Contribution record by week
Fill the middle columns yourself. The first and last columns are factual (from the repository) so you can check your memory against them.

| Week | What was produced (facts) | What I did myself | What I directed or reviewed | What I can explain without notes (tick when true) | Evidence |
|---|---|---|---|---|---|
| 13 SA7 | API with reports, duplicate control, candidate matching, notifications with 3 attempts and backoff, manual queue, aging job, structured logs; Flutter screens; 12 tests | | | [ ] retry policy  [ ] triggers  [ ] state model | Project18_Week13_SA7_Evidence.docx |
| 14 SA8/IA5 | scrypt passwords, signed expiring tokens, roles and ownership checks, HTTPS, protected config, strict validation, safe logging, lockout and rate limits; 28 security tests | | | [ ] token checks  [ ] why 404 not 403  [ ] what crypto is used and not used | Project18_Week14_SA8_IA5_Evidence.docx |
| 15 IA6 | traceability gate; tests written first; 16 defects fixed; regression evidence | | | [ ] one defect end to end  [ ] how traceability works | Project18_Week15_IA6_Hardening_Report.docx |
| 16 | monitoring, graceful shutdown, async hashing, cached matching, group commit; load tests; rehearsals; runbook | | | [ ] the three bottlenecks  [ ] group commit  [ ] rollback procedure | Project18_Week16_Performance_Deployment_Evaluation.docx |
| 17 SA9/AS3 | UAT (hands-on and scripted); 13 findings; OpenAPI with contract tests; ADRs; maintenance plan; limitations register | | | [ ] the two High UAT findings  [ ] ADR-001 and ADR-002  [ ] the contract tests | SA9 and AS3 reports |
| 18 E3 | demo kit, preflight, narrated fallback, evidence map, delivery check, viva guide | | | [ ] run the demo  [ ] switch to the fallback  [ ] find any claim in the evidence map | docs/w18 |

## C. Reflection prompts (about 300-500 words in total is plenty)
Answer in your own voice. Be specific; one concrete example beats three general statements.
1. **Most important technical decision** I was involved in, the alternatives, and why I would or would not make it again.
2. **A defect or failure that surprised me**, how it was found, and what I learned about testing. (Candidates from the record: the date check that blocked users east of UTC; password hashing that froze the server; a documentation test that accepted a wrong document; a stale cache after a deploy; a 35-second first load caused by compression.)
3. **A mistake in my own work or in a test** and how it was corrected. (The record includes tests that were unreliable under load and a layout overflow that turned out to be a test-harness error.)
4. **What the evidence does and does not prove.** For example: acceptance testing was done by playing the roles, not by real users; the load tests ran on one machine over loopback.
5. **What I would do next**, in order, and why that order.
6. **What I understand least** and how I will find out before the viva.
7. **Judgement call:** the recommendation is a supervised pilot, not production. Do I agree, and what evidence would change my mind?

Write here: ______________________________________________________________________________

## D. Self-check before submission
- [ ] Section A is complete and truthful, and I have checked the course policy.
- [ ] I ran `node scripts/final-check.js` and read every line of the result.
- [ ] I ran the demo from `node demo/start-demo.js --seed` and performed the walkthrough without reading the script.
- [ ] I can open every file in VIVA_PREP.md section 4 and say what it does.
- [ ] I filled in names, ID and section on the cover tables of all Word reports and left the sign-off sheet for the people who must complete it.

Signature: ______________________   Date: ____________
