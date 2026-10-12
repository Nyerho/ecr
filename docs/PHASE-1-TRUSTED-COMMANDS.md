# Phase 1: Trusted Firebase Commands

## Status

This release introduces the first additive slice of the Phase 1 safety foundation. It does not yet declare Phase 1 complete and it does not enable billing.

## What was added

The Express server now exposes a trusted command boundary under `/api/v1`:

- `POST /api/v1/incidents`
- `POST /api/v1/incidents/:incidentId/transition`
- `GET /api/v1/operations/queue`

The command boundary verifies Firebase ID tokens server-side and loads role, organization, and jurisdiction from the server-side user profile. It does not trust client-supplied role or visibility fields.

Incident creation and transitions use Firestore transactions and write the incident, event, audit event, idempotency record, and safe public tracking projection together. Replayed command keys return the original result, while stale versions and invalid state transitions are rejected.

Operational queue responses redact descriptions, contact details, and precise coordinates. Non-admin institutional access requires an organization scope and is filtered to that organization. The current client still uses the legacy Firebase path; migration to these commands is intentionally deferred until the backend is deployed with service credentials and the integration tests are in place.

## Required server configuration

The trusted backend requires:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

The private key must remain server-side and must never be added to Vite or mobile environment variables.

## Remaining Phase 1 work

This milestone does not yet provide complete memberships, MFA, session/device revocation, assignment acceptance/decline, notification delivery receipts, retry/dead-letter handling, private media storage, retention/deletion workflows, or production environment separation. Those remain explicit blockers before an institutional pilot or monetization.
