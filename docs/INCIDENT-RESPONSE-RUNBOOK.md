# ECR Incident-Response Runbook

> **Operational draft.** The operating owner must replace placeholders, name responders, and test this procedure before a pilot.

## Severity levels

- **P0:** Active risk to life, widespread outage, confirmed unauthorized access to sensitive incident data, or compromise of credentials/storage.
- **P1:** Material degradation of reporting, routing, authentication, notification delivery, or private-media scanning.
- **P2:** Localized defect, failed job, suspicious event, or non-sensitive service issue.

## Immediate actions

1. Record the time, reporter, affected environment, and evidence. Do not include credentials or unnecessary personal data in chat or tickets.
2. For suspected account compromise, call `POST /api/v1/security/users/{uid}/revoke-sessions` as an authorized administrator.
3. For suspected storage compromise, disable the storage credentials, set `ECR_MEDIA_DELETION_ENABLED=false`, and prevent new upload URLs until the bucket and scanner are reviewed.
4. Preserve relevant audit events, request IDs, scanner results, provider logs, and deployment versions.
5. Keep official emergency-service escalation active; ECR outages must never delay a caller’s contact with official services.

## Investigation checklist

- Identify the first known time and last known good deployment.
- Search `auditEvents` for authentication, sensitive reads, exports, media access, membership changes, and revocations.
- Check Firebase Auth logs, Firestore access logs, storage-provider audit logs, scanner logs, and CI/deployment history.
- Determine affected users, incidents, media objects, organizations, and jurisdictions.
- Avoid editing or deleting evidence while the scope is being assessed.

## Containment and recovery

- Rotate compromised Firebase, storage, scanner, CI, or deployment credentials through the secret manager.
- Revoke affected user sessions and disable compromised institutional accounts.
- Restrict or suspend the affected API route, provider bucket, or integration.
- Restore from a verified clean backup only after recording the recovery point and validation checks.
- Run emulator and production smoke tests, including authorization boundaries and sanitized public tracking.
- Re-enable traffic gradually and monitor request errors, queue latency, notification failures, scan failures, and suspicious reads.

## Communications

**Operating owner:** [insert name and contact]
**Technical responder:** [insert name and contact]
**Privacy/legal reviewer:** [insert name and contact]
**Participating emergency organization contact:** [insert contact]
**Cloud/storage provider escalation:** [insert contact]

The owner decides whether users, organizations, regulators, or emergency partners must be notified. Notifications must be accurate, limited to confirmed facts, and reviewed for unnecessary disclosure of personal information.

## After-action review

Within the approved review window, document the timeline, root cause, affected scope, controls that worked, controls that failed, user impact, notification decisions, corrective actions, owner, and deadline. Update tests and this runbook before closing the incident.
