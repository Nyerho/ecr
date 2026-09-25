# ECR Beta Readiness Checklist

## Current position

ECR is still a **local-first prototype**, not a beta system for real emergency reports. This change adds optional camera/gallery selection, image type/count/size limits, IndexedDB blob storage, and a dispatcher gallery for testing in the same browser profile. The image blobs and incident records do **not** sync between devices, are not held in private server storage, and do not have production access controls or retention. Local sign-in and the dispatcher access switch are also demonstration-only. Do not use the current prototype for actual emergency operations or sensitive evidence.

A beta gate means a small, named group can test the actual shared application against a real backend under documented supervision. It does not mean the service is ready to replace official emergency channels.

## Remaining work, in order

### 1. Approve the pilot operating model

- [ ] Name the operating owner and accountable technical, security, privacy, and support contacts.
- [ ] Select the geography, participating response organizations, coverage hours, capabilities, and escalation contacts.
- [ ] Agree the report categories and required category-specific questions, especially missing-person and injury workflows.
- [ ] Define who monitors the queue, response expectations, hand-offs, fallback procedures, and what happens when no responder accepts.
- [ ] Confirm that all screens keep directing people facing immediate danger to official emergency services.

**Exit condition:** The pilot boundaries, contacts, categories, roles, and operating procedures are written down and approved by participating organizations.

### 2. Replace local demonstration identity and access

- [ ] Replace browser-only accounts and password storage with a maintained identity provider and verified account recovery.
- [ ] Create server-verified citizen, dispatcher, organization, responder, and administrator roles; scope operators to an organization and jurisdiction.
- [ ] Require MFA for privileged roles and define session expiration, device loss, revocation, account lockout, and audit handling.
- [ ] Remove the local dispatcher unlock switch and enforce every permission on the server, not only in UI code.
- [ ] Test unauthorized access, IDOR, account recovery, privilege escalation, and session-revocation cases.

**Exit condition:** Two test users on separate devices see only the data authorized for their role, and every denied action is enforced server-side.

### 3. Move incidents and workflow state to the shared backend

- [ ] Select and provision the production database and environments; keep development, staging, and pilot data isolated.
- [ ] Finalize schemas for users, organizations, jurisdictions, incidents, assignments, events, idempotency keys, notifications, and audit logs.
- [ ] Move report creation, dispatcher updates, assignment, and status transitions behind server-authorized operations and atomic/idempotent writes.
- [ ] Add server-side validation, optimistic concurrency, duplicate-report handling, ownership checks, and safe errors for outages.
- [ ] Migrate local prototype records only if they are needed, with explicit user/owner approval and a tested rollback plan.

**Exit condition:** A citizen can submit from one device, an authorized dispatcher can see and update that record from another device, and the citizen sees the same durable status history after signing in elsewhere.

### 4. Convert the photo prototype into safe, private media handling

- [ ] Choose a private object-storage provider and configure least-privilege credentials separately in staging and production.
- [ ] Upload through short-lived, server-authorized upload intents linked to an incident; do not accept arbitrary object keys or public URLs from clients.
- [ ] Enforce actual file signatures as well as declared MIME type, count and byte limits, image decode limits, rate limits, and a clear failed-upload/retry path.
- [ ] Add malware/content scanning or quarantine and a defined policy for EXIF/location metadata and image transformations.
- [ ] Serve images only to authorized roles using short-lived signed reads or an authenticated proxy; audit sensitive reads and deny access across users, agencies, and jurisdictions.
- [ ] Define consent, notice, retention, deletion, legal hold, backup, and incident-response procedures for identifying photos and injury/scene images.
- [ ] Test cross-device citizen and dispatcher access plus denial to an unrelated citizen, an out-of-scope dispatcher, and an expired session.

**Exit condition:** A photo submitted by an authorized user is durably available to the correct response team on another device, inaccessible to unauthorized users, and deleted according to an enforced retention rule.

### 5. Complete operations, routing, and notifications

- [ ] Replace the local dispatcher page with a persistent role-aware operations console and organization/responder views.
- [ ] Confirm jurisdiction and capability-based routing, availability, manual overrides, assignment/accept/decline flows, and escalation.
- [ ] Add persistent in-app notifications and an agreed push/SMS fallback only after delivery owners and content limits are approved.
- [ ] Make delivery state, retry behavior, provider outage, acknowledgement, and duplicate notifications visible and auditable.
- [ ] Avoid placing unnecessary medical, identity, or precise-location details in lock-screen or SMS messages.

**Exit condition:** Dispatchers can operate the queue end-to-end and know when an assignment or notification has failed or is awaiting acknowledgement.

### 6. Finish location, reliability, and abuse protections

- [ ] Add location consent, source, accuracy, confirmation/correction, normalized address, map display, and jurisdiction lookup.
- [ ] Specify what precise location each role can see and how location is protected in exports, logs, notifications, and backups.
- [ ] Handle weak networks, interrupted submissions, duplicate retries, offline drafts, stale updates, database/storage outages, and resumable uploads.
- [ ] Add rate limits, spam/abuse controls, attachment quotas, request-size limits, monitoring, alerting, and operational dashboards.
- [ ] Verify backup/restore and disaster recovery, including database, object storage, and encryption keys.

**Exit condition:** Acceptance scenarios pass for location denial, network loss, duplicate submission, unavailable responders, stale edits, and backend/storage outage.

### 7. Complete privacy, audit, accessibility, and independent review

- [ ] Approve privacy notice, consent wording, data inventory, lawful basis, retention schedule, access review, deletion process, and user-request handling with qualified reviewers.
- [ ] Audit sign-ins, administrative access, sensitive image/detail reads, exports, assignment changes, status transitions, and deletions.
- [ ] Complete mobile accessibility, screen-reader, keyboard, contrast, large-target, language, and low-bandwidth testing.
- [ ] Run dependency/secrets/configuration review, threat model, penetration testing, and independent security/privacy review; fix and retest high-risk findings.
- [ ] Prepare incident-response, breach-notification, service-outage, support, and on-call procedures.

**Exit condition:** Security and privacy reviewers sign off on remediated findings, and operators can execute the support and incident-response runbooks.

### 8. Run staging acceptance and supervised beta rehearsal

- [ ] Seed synthetic test users, agencies, incidents, missing-person cases, scene photos, and injury-photo cases; keep real personal data out of test fixtures.
- [ ] Execute the full acceptance matrix on supported Android and iOS devices and desktop dispatch stations, including camera capture, gallery selection, corrupt/oversized files, upload retry, and access-denial tests.
- [ ] Run two-device and multi-role drills from citizen report through dispatcher acknowledgement, agency acceptance/decline, status updates, and citizen tracking.
- [ ] Load-test the expected pilot volumes, attachment bandwidth, burst traffic, and outage recovery; verify alerting and restore procedures.
- [ ] Train operators and beta testers; publish a clear feedback route and a known-issues list.
- [ ] Obtain written launch authorization from the operating owner and required organization, security, and privacy reviewers.

**Exit condition:** The full beta acceptance checklist passes in staging, high-severity defects are closed, the rehearsal is signed off, and the pilot has named contacts and rollback criteria.

### 9. Start a limited beta and review it daily

- [ ] Invite a small, explicitly approved cohort in the selected geography; initially supervise and staff every operational shift.
- [ ] Use a documented feedback/incident channel, collect only necessary test telemetry, and define stop conditions for safety, privacy, reliability, or response failures.
- [ ] Review access logs, failed submissions/uploads, acknowledgement times, unresolved reports, complaints, and deletion requests on a fixed cadence.
- [ ] Triage defects promptly, pause expansion on any severe issue, and record decisions and outcomes before widening the cohort.

**Beta start gate:** Steps 1–8 are complete and approved. The local photo prototype alone does not satisfy the shared-storage or security gate.

## This change's contribution

- [x] Optional photo selection from a mobile camera or image gallery in the local report wizard.
- [x] Missing-person identifying-photo and incident-scene/landmark photo labels.
- [x] JPEG, PNG, and WebP allowlist; up to three images, 8 MB per image, 16 MB total.
- [x] Store image blobs in IndexedDB, not base64 in localStorage; keep lightweight labels in the report record.
- [x] Preview attached images in the local dispatcher detail view and show photo counts in its queue.
- [x] Safety reminders not to approach danger for an image or delay official emergency services.
- [ ] Shared, private upload, authorization, malware scanning, metadata policy, audit, and retention (required before beta).

This checklist expands the repository's [implementation roadmap](./ECR-IMPLEMENTATION-ROADMAP.md); it does not replace pilot, legal, security, or operational sign-off.

See the [ECR implementation roadmap](./ECR-IMPLEMENTATION-ROADMAP.md) for the companion implementation sequence.
