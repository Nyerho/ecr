# Phase 2: Privacy, Security, and Operations

## Status

This is the initial Phase 2 foundation. It adds a documented privacy and operations baseline and a non-destructive retention preview. It does **not** declare the system legally approved or pilot-ready.

The following decisions still require the operating owner and legal/privacy reviewer:

- final data controller/operator and contact details;
- pilot geography and participating organizations;
- lawful basis, consent wording, and data-subject request process;
- incident, attachment, notification, and audit retention periods;
- cross-border processing and hosting requirements;
- emergency-service disclaimer and escalation language.

## Data classification

| Class | Examples | Default handling |
|---|---|---|
| Public-safe | Public reference, broad category, sanitized status timeline | May be shown through the public tracking projection |
| Operational | Organization routing, assignment state, responder membership | Trusted API only; organization-scoped |
| Sensitive | Reporter name, phone, email, precise coordinates, medical details, attachments | Server-side access control; never copied to public projections |
| Restricted audit | Authentication, administrative, assignment, export, and deletion events | Append-only server records; administrator access only |

The public tracking projection must remain a separately shaped document. Do not spread the full incident document into it.

## Retention baseline

The server environment supports these configurable, server-only settings:

```env
ECR_RETENTION_INCIDENT_DAYS=365
ECR_RETENTION_AUDIT_DAYS=730
ECR_RETENTION_NOTIFICATION_DAYS=30
ECR_RETENTION_DRAFT_DAYS=30
```

The defaults are engineering placeholders, not legal advice. The current API endpoint is deliberately non-destructive:

```text
GET /api/v1/operations/retention/preview
```

It is restricted to administrators and reports bounded eligible-record counts. It does not delete or mutate records. A production deletion job must only be enabled after the retention schedule, legal basis, backup window, exception handling, and approval process are documented.

## Backup and recovery runbook skeleton

Before a controlled pilot, the operator must complete and record:

1. Enable scheduled Firestore exports to a separate, access-controlled backup project or bucket.
2. Encrypt backups and restrict access to named administrators.
3. Define the recovery point objective and recovery time objective.
4. Test a restore into a non-production project at least once per quarter.
5. Verify that restored data inherits the same access controls and retention rules.
6. Record backup failures as operational incidents and notify the owner.
7. Keep Firebase service-account credentials in the deployment secret manager, never in Git, Vite variables, mobile variables, or support tickets.

The repository does not pretend that a backup exists until the operator configures and verifies it in the Firebase/GCP project.

## Private media foundation

Incident media is now represented by server-created `incidentMedia` metadata only. Clients cannot read or write this collection directly. The trusted API validates the incident access scope, media kind, MIME type, and an 8 MB per-file limit before creating a `pending_upload` intent under a private storage path. Media metadata reads are access-controlled and audited as `sensitive_read.incident_media`.

The actual object-storage upload, malware/integrity scan, signed download URL, and deletion worker remain disabled until a production storage provider and bucket policy are selected. Public tracking projections must never contain media paths or download URLs.

## Access and security controls

The trusted backend currently verifies Firebase ID tokens, checks revoked sessions, enforces role and organization membership, redacts the operations queue, records each authorized operations-queue read as a restricted `sensitive_read.operations_queue` audit event, uses transactional state changes, records audit events, applies request-size limits, adds security headers, and rate-limits the tRPC compatibility surface.

Remaining Phase 2 gates include:

- MFA or equivalent stronger authentication for institutional accounts;
- explicit session/device revocation runbook;
- sensitive-read and export audit events;
- private media storage with signed, time-limited access;
- dependency and secret scanning in CI;
- incident-response contacts and breach-notification procedure;
- legal review of the public privacy notice and emergency disclaimer.

## Privacy notice draft outline

The public web and mobile clients should link to a reviewed notice containing:

- what information is collected and why;
- how location precision is used and when it is shared;
- who can access operational details;
- how public tracking references differ from private incident records;
- retention and deletion-request handling;
- contact details for privacy questions;
- a clear statement that ECR does not replace official emergency services and that users should contact the appropriate emergency number for immediate danger.

This outline is intentionally not presented as a final legal notice.
