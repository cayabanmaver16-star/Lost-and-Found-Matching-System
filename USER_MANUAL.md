# User Manual: Campus Lost-and-Found Matching System

This manual shows how to use the system, one task at a time. Every screenshot was taken from the running application with the test accounts described in section 2.

**Contents**
1. [What the system does](#1-what-the-system-does)
2. [Before you start: who you sign in as](#2-before-you-start-who-you-sign-in-as)
3. [Sign in and sign out](#3-sign-in-and-sign-out)
4. [Report a lost item (student)](#4-report-a-lost-item-student)
5. [Report a found item (student)](#5-report-a-found-item-student)
6. [Follow your reports and notifications (student)](#6-follow-your-reports-and-notifications-student)
7. [Verify ownership of a match (security staff)](#7-verify-ownership-of-a-match-security-staff)
8. [Release the item to its owner (custodian)](#8-release-the-item-to-its-owner-custodian)
9. [Notifications and the manual queue (staff)](#9-notifications-and-the-manual-queue-staff)
10. [Using it on a phone](#10-using-it-on-a-phone)
11. [Problems and what to do](#11-problems-and-what-to-do)

To install and start the system first, see [START_HERE_WINDOWS.md](START_HERE_WINDOWS.md). For phone access on the same Wi-Fi, see [RUN_WINDOWS_AND_PHONE.md](RUN_WINDOWS_AND_PHONE.md).

---

## 1. What the system does

People report items they **lost** or **found**. The system compares each new report with the reports of the opposite kind. When a lost item and a found item look like the same thing, it creates a **match** and notifies the owner. A person from staff then checks proof of ownership, and only after that is the item handed over.

```
Student reports lost item  ┐
                           ├─> system finds a match ─> security verifies ownership ─> custodian releases the item
Student reports found item ┘
```

Nothing is handed over automatically. A match is only a suggestion until staff verify it.

## 2. Before you start: who you sign in as

The system has four kinds of users. What you see depends on who you are.

| Role | Test account | What you can do |
|---|---|---|
| Student | `stu1`, `stu2` | Report lost or found items, see your own reports, see your notifications |
| Security staff | `sec1` | See all matches, **verify** or **reject** them, **release** verified items, and use the manual queue |
| Custodian | `cust1` | The same staff functions as security, and can also run the old-report check |
| Employee | `emp1` | Same screens as a student |

The system does not let staff decide a match for an item they reported themselves. In this manual, security staff verify and the custodian releases, so two different people check every handover. This is good practice. The system allows either staff role to do both steps, so follow your campus procedure.

These are **test accounts with made-up data**. Their passwords are in `database/seed/demo-users.json`. Never use them, or a real password, for anything else.

## 3. Sign in and sign out

**To sign in**

1. Open the application address in your browser (for example `http://localhost:8080`).
2. Type your **User ID**.
3. Type your **Password**. Use the eye icon to show or hide it.
4. Click **Sign in**.

![Sign-in screen](docs/user-manual/screenshots/01-sign-in.png)

**If the user ID or password is wrong**, the screen says *Invalid user ID or password*. Check them and try again. After 5 wrong attempts in a row the account is locked for a while, so don't keep guessing.

![Wrong password message](docs/user-manual/screenshots/02-wrong-password.png)

**To sign out**, click **Sign out** at the top right. Do this when you finish, especially on a shared computer. If you leave the page for about 15 minutes, you are signed out automatically and must sign in again.

## 4. Report a lost item (student)

Use this when you have lost something.

1. Sign in as a student. You land on the **Report** tab.

![Report tab after signing in as a student](docs/user-manual/screenshots/03-student-home-report-form.png)

2. Make sure **I lost something** is selected at the top.
3. Choose a **Category** (for example *wallet*).
4. Write the **Description**: colour, brand and any marks. The more specific and the more ordinary words you use, the better the system can match it. Good: *black leather wallet with silver zipper and student id inside*.
5. Write **Where?** you think you lost it (for example *library*).
6. Check the **Date**. It is today by default. Click the calendar icon to change it. It can't be in the future or more than two years ago.

![Lost-item form filled in](docs/user-manual/screenshots/05-lost-form-filled.png)

7. Click **Submit report**.

**If you leave something out**, the field turns red and explains what to fix. Nothing is sent until the form is correct.

![Validation errors on the form](docs/user-manual/screenshots/04-validation-errors.png)

**When it works**, a message at the bottom gives your report number, for example *Report R-0001 submitted*. It also tells you if a possible match was found right away. Write the number down if you want to ask staff about it.

![Report submitted](docs/user-manual/screenshots/06-lost-report-submitted.png)

## 5. Report a found item (student)

Use this when you have found something that is not yours.

1. Sign in and stay on the **Report** tab.
2. Click **I found something**.
3. Fill in **Category**, **Description**, **Where?** (where you found it) and **Date** exactly as in section 4. Describe what you can see without revealing private details that only the owner would know (for example, don't write a name that is inside a wallet).
4. Click **Submit report**.

![Found-item form filled in](docs/user-manual/screenshots/08-found-form-filled.png)

If your found item matches an existing lost report, the message tells you, for example *Report R-0002 submitted. 1 candidate match(es) found!* Hand the item in as your campus instructs. Staff will take it from there.

![Found report submitted with a candidate match](docs/user-manual/screenshots/09-found-report-submitted.png)

Students do not see the details of matches, so the **Matches** tab may say *No candidate matches yet*. This protects the owner's privacy: only staff compare the two items.

![Matches tab as a student](docs/user-manual/screenshots/10-student-matches-view.png)

## 6. Follow your reports and notifications (student)

**Your reports**

1. Click the **Reports** tab.
2. Each row shows the report number, the kind (lost or found), the category, your description, the place and the date.
3. The label at the right shows the status, for example **open**.

![My reports](docs/user-manual/screenshots/07-my-reports.png)

When the item has been handed over, the report becomes **closed**.

![Closed report after the item was released](docs/user-manual/screenshots/21-student-reports-closed.png)

**Your notifications**

1. Click the **Notifications** tab.
2. When a possible match is found for your lost item, a message such as *Possible match found for your lost item* appears with the time and *Delivered*.

![Student notifications](docs/user-manual/screenshots/20-student-notifications.png)

A notification is not a handover. Wait for staff to verify your ownership. Bring something that proves the item is yours.

## 7. Verify ownership of a match (security staff)

Use this to confirm that the person who lost the item is the real owner.

1. Sign in as security staff. You will see an extra tab, **Manual queue**.
2. Click the **Matches** tab.
3. Each match card shows a match number, a **score** (higher means more alike), the lost item on the left and the found item on the right, with who reported each. The status badge says **candidate**.

![Staff view of a candidate match](docs/user-manual/screenshots/11-staff-matches-list.png)

4. Check the claimant's proof in person (for example, an ID card and a description of the contents).
5. Click **Verify ownership**.

![Confirm-ownership dialog](docs/user-manual/screenshots/12-verify-dialog.png)

6. In **What proof did you check?** write a short note of 5 to 200 characters, for example *Student ID card shows the owner name; wallet contents match the description*. The note is required and is kept in the record.
7. Click **Confirm**.

![Proof note entered](docs/user-manual/screenshots/13-verify-note-entered.png)

If the two items are not the same, click **Reject** instead. It asks for a **Reason for refusing**, and the match is closed without a handover.

The match status changes from **candidate** to **verified**.

## 8. Release the item to its owner (custodian)

Use this when the item is physically handed over. Staff can release only matches that have already been verified.

1. Sign in as the custodian and open the **Matches** tab.
2. Find the match that says *Ownership verified - ready to release*. The security note is shown on the card.

![A verified match, ready to release](docs/user-manual/screenshots/15-custodian-matches.png)

3. Click **Release item**.
4. Read the question: *Hand the found item over to (the owner)? This closes both reports and cannot be undone.* Only click **Release** when the owner is in front of you and has the item.

![Release confirmation](docs/user-manual/screenshots/16-release-dialog.png)

5. The screen shows *Item released* and the match status becomes **released**. Both reports are now closed.

![Item released](docs/user-manual/screenshots/17-item-released.png)

If **Release item** is not shown, the match is still waiting for verification (or it was rejected or already released).

## 9. Notifications and the manual queue (staff)

**Notifications.** Staff see every notification with its reference number and the match it belongs to. The green tick and *Delivered* mean it reached the person.

![Staff notifications](docs/user-manual/screenshots/18-notifications-staff.png)

The system tries to deliver a notification up to 3 times, waiting a little longer each time. If all attempts fail (for example the message service is down), it does not lose the message: it puts it in the **Manual queue**.

**Manual queue.** Open the **Manual queue** tab to see anything that needs a person. Each row shows what failed and why.

- **Re-send** appears on a failed notification. Click it to try the message again once the problem is fixed.
- **Dispose** appears on an item flagged for disposal review (a found item unclaimed for 90 days). Click it only when you are sure the item should be disposed of according to your campus policy.

When there is nothing to handle, the tab says *Nothing needs manual handling*. That is the normal state.

![Empty manual queue](docs/user-manual/screenshots/19-manual-queue.png)

**Reminders.** The system checks for old found items every hour. After 30 days it sends a reminder to the custodian, and after 90 days it flags the item for a disposal review by staff. It never throws anything away by itself.

## 10. Using it on a phone

The screens adapt to a narrow window. Open the same address on the phone. If it is not the PC you started it on, follow [RUN_WINDOWS_AND_PHONE.md](RUN_WINDOWS_AND_PHONE.md) to set it up on the same Wi-Fi.

![Sign-in on a phone-sized screen](docs/user-manual/screenshots/22-phone-width.png)

## 11. Problems and what to do

| What you see | What it means | What to do |
|---|---|---|
| *Invalid user ID or password* | Wrong ID or password | Check them. After 5 failures the account is locked for a while. |
| A red message under a field | The form is incomplete or wrong | Read the message, fix that field, and submit again. |
| *Try again* or a network error | The app can't reach the server | Make sure the API is running, then click **Try again**. |
| *Sign in again* | Your session ended (about 15 minutes) | Click **Sign in again** and enter your details. |
| *No candidate matches yet* | Nothing similar has been reported yet | Wait. You are notified when a match appears. Check that your description is specific. |
| No **Release item** button | The match is not verified yet, or it was rejected or already released | Verify it first (section 7). |
| *You cannot decide a match for an item you reported* | Staff can't decide a match for their own lost item | Ask a different staff member to do it. |

If something not listed here goes wrong, note the report or match number and the time, and tell the project owner.

---

*Test data only: the screenshots use made-up reports and test accounts. The accounts and passwords are for demonstration. Real use needs the institution's own sign-in and a supervised pilot (see `docs/w17/KNOWN_LIMITATIONS.md`).*
