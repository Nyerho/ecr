# Release 2 — Safety and notifications

Release 2 adds trust and moderation features across web and mobile.

## Delivered

- Firebase email verification after account registration on web and mobile.
- In-app report status-change notices for citizens when a tracked incident moves to a new response state.
- Mobile Chatter message reporting, local mute/unmute, and safety controls.
- Firestore `contentReports` collection rules for citizen-created moderation reports and admin review.
- Release documentation and a manual test checklist.

## Test checklist

1. Register a new account on web and mobile; confirm the verification email prompt appears.
2. Change a report status from the authorized operations view; confirm the citizen receives a status notice.
3. In mobile Chatter, mute another author and confirm their messages disappear; unmute them and confirm they return.
4. Report a mobile Chatter message and confirm a `contentReports` document is created.
5. Confirm a signed-in citizen can read only their own content-report record and admins can review reports.

## Deferred

Remote push notifications, a server-side notification fan-out, and Firebase Storage photo uploads remain candidates for Release 3 because they require production notification credentials, backend triggers, and storage policy decisions.
