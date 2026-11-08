# Scripted UAT results (after-fixes)

14/14 scenarios passed; 41/41 steps.

## UAT-01 Sign-in, wrong password, lockout and sign-out - PASS
Persona: Any user

| Step | Expected | Actual | Result |
|---|---|---|---|
| stu1 identifies as student | 200, role student | 200 student | pass |
| emp1 identifies as employee | 200, role employee | 200 employee | pass |
| sec1 identifies as security | 200, role security | 200 security | pass |
| cust1 identifies as custodian | 200, role custodian | 200 custodian | pass |
| wrong password and unknown user look identical | 401 with same message | Invalid user ID or password / Invalid user ID or password | pass |
| account locks after 5 failures, even with the right password | 429 ACCOUNT_LOCKED | 429 ACCOUNT_LOCKED | pass |
| token is refused after sign-out | 401 | 401 | pass |

## UAT-02 Student reports a lost item (validation and success) - PASS
Persona: Student (stu1)

| Step | Expected | Actual | Result |
|---|---|---|---|
| too-short description and empty location are rejected with field messages | 422 with description and location details | 422 description,location | pass |
| valid lost report accepted | 201 status open | 201 R-0001 | pass |
| owner sees it, another student does not | stu1: 1 report, stu2: 0 | stu1 1, stu2 0 | pass |

## UAT-03 Security officer reports a matching found item - PASS
Persona: Security officer (sec1)

| Step | Expected | Actual | Result |
|---|---|---|---|
| found report accepted and one candidate created | 201, 1 match, score >= 50 | 201 matches=1 score=81 | pass |

## UAT-04 Student sees the match and notification - PASS
Persona: Student (stu1)

| Step | Expected | Actual | Result |
|---|---|---|---|
| student sees the candidate match without the found-report id | 1 match, no foundId | {"id":"M-0003","lostId":"R-0001","score":81,"status":"candidate","createdAt":"2026-11-07T18:06:10.915Z","lost":{"id":"R-0001","category":"wallet","description":"black leather wallet with student card and red sticker","location":"library second floor","eventDate":"2026-11-06","status":"open"}} | pass |
| notification delivered | delivered on attempt 1 | {"s":"delivered","a":1} | pass |

## UAT-05 Custodian verifies ownership and releases the item - PASS
Persona: Custodian (cust1)

| Step | Expected | Actual | Result |
|---|---|---|---|
| release before verification is blocked | 409 | 409 | pass |
| ownership verified | 200 verified | 200 verified | pass |
| item released to the owner | 200 released to stu1 | 200 stu1 | pass |
| owner sees the match as released | released | released | pass |
| audit trail has created, verified, released | all three actions present | report.created,report.created,match.verified,match.released | pass |

## UAT-06 Duplicate and different reports - PASS
Persona: Student (stu2)

| Step | Expected | Actual | Result |
|---|---|---|---|
| same report again is refused | 409 DUPLICATE_REPORT naming the original | 409 DUPLICATE_REPORT R-0005 | pass |
| a different item is accepted | 201 | 201 | pass |

## UAT-07 People cannot do or see what their role does not allow - PASS
Persona: Student, anonymous

| Step | Expected | Actual | Result |
|---|---|---|---|
| student cannot verify | 403 | 403 | pass |
| student cannot open the manual queue | 403 | 403 | pass |
| no token | 401 | 401 | pass |
| student cannot open another student's report | 404 (existence not revealed) | 404 | pass |

## UAT-08 A notification that cannot be delivered reaches a human - PASS
Persona: Security officer, custodian

| Step | Expected | Actual | Result |
|---|---|---|---|
| failure is routed to the manual queue | open notification_failure with a reason | {"id":"MQ-0012","reason":"Recipient mailbox unavailable"} | pass |
| re-send delivers and resolves the item | delivered + resolved | 200 delivered | pass |

## UAT-09 A temporary delivery problem fixes itself - PASS
Persona: Security officer

| Step | Expected | Actual | Result |
|---|---|---|---|
| delivered after retries without staff action | delivered on attempt 3 | {"s":"delivered","a":3} | pass |

## UAT-10 Staff cannot decide a match for their own lost item - PASS
Persona: Security officer (sec1) and custodian

| Step | Expected | Actual | Result |
|---|---|---|---|
| own match cannot be verified | 403 CONFLICT_OF_INTEREST | 403 CONFLICT_OF_INTEREST | pass |
| another staff member can | 200 | 200 | pass |

## UAT-11 Wrong claimant rejected; one item, two claimants - PASS
Persona: Custodian, two students

| Step | Expected | Actual | Result |
|---|---|---|---|
| both claimants become candidates | 2 matches | 2 | pass |
| first claimant rejected | rejected | rejected | pass |
| second claimant verified and released | 200 released | 200/200 | pass |
| rejected claimant cannot be verified afterwards | 409 | 409 | pass |

## UAT-12 Unrelated items are not matched; brief descriptions still are - PASS
Persona: Security officer

| Step | Expected | Actual | Result |
|---|---|---|---|
| different category never matches the books report | no match references the books report | none | pass |
| same category, nothing in common: no match | 0 matches | 0 | pass |
| found keys sharing only generic words ("blue", "tag") are NOT a candidate for the silver house keys | no match references that report | matched lost reports: R-0007 (score 80) | pass |
| a brief lost description still matches a detailed found one | 1 match | 1 | pass |

## UAT-13 Unclaimed items: reminder then disposal review - PASS
Persona: Custodian

| Step | Expected | Actual | Result |
|---|---|---|---|
| 30-day reminder raised once | 1 then 0 | 8 then 0 | pass |
| 90-day disposal review appears | open disposal_review | 8 | pass |
| custodian disposes | resolved | 200 resolved | pass |

## UAT-14 Forged or expired sign-in is refused - PASS
Persona: Any

| Step | Expected | Actual | Result |
|---|---|---|---|
| token with role changed to custodian | 401 | 401 | pass |

