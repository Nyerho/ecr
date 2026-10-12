# Phase 1: Trusted Firebase Commands

## Status

This release introduces the first additive slice of the Phase 1 safety foundation. It does not yet declare Phase 1 complete and it does not enable billing.

## Trusted backend boundary

The Express server exposes:

- `POST /api/v1/incidents`
- `POST /api/v1/incidents/:incidentId/transition`
- `POST /api/v1/incidents/:incidentId/assign`
- `POST /api/v1/assignments/:assignmentId/respond`
- `GET /api/v1/operations/queue`
- `POST /api/v1/organizations/:organizationId/memberships`

The command boundary verifies Firebase ID tokens server-side and loads role, organization, and jurisdiction from server-side records. It does not trust client-supplied role or visibility fields.

Incident creation and transitions use Firestore transactions and write the incident, event, audit event, idempotency record, and safe public tracking projection together. Replayed command keys return the original result, while stale versions and invalid state transitions are rejected.

Operational queue responses redact descriptions, contact details, and precise coordinates. Non-admin institutional access requires an active organization membership and is filtered to that organization. Authorized ECR administrators can provision or update dispatcher, coordinator, or responder memberships; membership changes are audited.

Direct client writes are blocked for `organizationMemberships`, `incidentEvents`, trusted `auditEvents`, `idempotencyKeys`, and `notificationDeliveries`.

## Staged citizen migration

The web citizen-report flow now calls `createReportIncident`, which uses the trusted API when:

```text
VITE_ECR_TRUSTED_COMMANDS_ENABLED=true
VITE_ECR_TRUSTED_API_URL=https://trusted-api.example.com
```

When the flag is `false`—the default—the existing Firebase batch path remains active. This prevents a deployment without Firebase Admin credentials from interrupting citizen reporting. The flag must only be enabled after the trusted backend is deployed, configured, and tested in staging.

The mobile client remains on the existing path until the same backend endpoint is configured for Expo Go and mobile integration tests are available.

Admin status changes now use `POST /api/v1/incidents/:incidentId/transition` when the trusted-command flag is enabled. The command supplies the current incident version and is rejected by the backend if the status transition is invalid or the record changed since it was loaded. With the flag disabled, the existing Firestore update path remains available as a temporary migration fallback.

Assignment commands now create an auditable `assignments` record transactionally, require the responder to hold an active membership in the selected organization, and move the incident to `assigned`. Only the assigned responder can respond. Accepting moves the incident to `responding`; declining moves it to `escalated` for fallback routing. Direct client writes to `assignments` are blocked by Firestore rules.

## Required server configuration

The trusted backend requires:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

The private key must remain server-side and must never be added to Vite or mobile environment variables.

## Emulator integration tests

The repository includes Auth and Firestore emulator configuration in `firebase.json` and an opt-in integration suite in `server/trustedIncidentCommands.emulator.test.ts`. Run it with:

```bash
pnpm test:emulator
```

The suite creates emulator users, verifies Firebase ID tokens, checks transactional incident/event/audit writes, verifies safe public projections, exercises idempotent replay, rejects citizen status changes, validates admin transitions and stale versions, and provisions an organization membership. The normal `pnpm test` command skips this suite so unit tests remain fast and do not require Java.

## Remaining Phase 1 work

This milestone does not yet provide complete membership lifecycle approvals, MFA, session/device revocation, assignment acceptance/decline, notification delivery receipts, retry/dead-letter handling, private media storage, retention/deletion workflows, production environment separation, or the final web/mobile migration. Those remain explicit blockers before an institutional pilot or monetization.
