# ECR Implementation Roadmap

## Purpose

This roadmap converts the ECR Pilot MVP PRD into an ordered implementation plan. The current repository is a local-first prototype. Browser storage is intentionally being used to validate the citizen and dispatcher workflows before Firestore, production authentication, notifications, and pilot operations are introduced.

## Current baseline

The completed prototype includes the landing page, local citizen registration and sign-in, local session handling, mobile-first incident reporting, category selection, structured details, manual or device-assisted location, report review, durable local references, citizen status timelines, a local dispatcher queue, filtering, incident detail review, priority changes, organization routing, status transitions, and local audit-style events. Vercel is configured to publish `dist/public` rather than the bundled server output.

The current prototype is not production-safe. Passwords are stored locally for demonstration, the dispatcher access is a local prototype switch, browser storage is not shared across devices, and no real notification, Firestore, MFA, or operational integration exists yet.

## Delivery stages

| Stage | Outcome | Main PRD alignment | Status |
|---|---|---|---|
| 1. Product and pilot decisions | Confirm geography, partners, categories, ownership, routing, status labels, privacy, and notification policy | Sections 7, 11, 20, 21 | Required before live pilot |
| 2. Citizen prototype | Validate the report flow with representative users | C-01 through C-12 | Complete locally |
| 3. Dispatcher prototype | Validate queue, triage, routing, assignment, status updates, and audit interactions | O-01 through O-07 | Complete locally |
| 4. Shared local workflow hardening | Add reliable shared prototype storage, retry behavior, role boundaries, seeded agencies, and failure-state scenarios | C-12, O-10, reliability requirements | In progress locally |
| 5. Firestore data foundation | Replace browser storage with Firestore collections, rules, indexes, and server-side validation | Sections 10, 11, 14 | Next major backend stage |
| 6. Production identity and authorization | Add Firebase Authentication, verified citizen identity, dispatcher/responder accounts, MFA, role and organization claims, recovery, and session controls | A-01 through A-05 | Required before controlled pilot |
| 7. Operational dashboards | Convert the prototype dispatcher view into a persistent role-aware operations console with agency and responder views | O-01 through O-11 | MVP build |
| 8. Routing and jurisdiction | Implement pilot geography boundaries, agency capability, availability, routing rules, escalation, and manual override audit | O-04, O-05 | MVP build |
| 9. Notifications | Add in-app notifications first, then push delivery and explicitly documented SMS fallback or integration | N-01 through N-05 | MVP build |
| 10. Location and mapping | Add consent state, accuracy, normalized address, map display, location correction, jurisdiction lookup, and restricted precision display | C-04, C-05, O-08 | MVP build |
| 11. Attachments and media safety | Add optional photo/video upload, size limits, malware/integrity checks, private storage, access control, and retention policy | C-06, A-06 | Should-have / pilot decision |
| 12. Reliability and abuse controls | Add idempotent submission, retry-safe writes, duplicate detection, rate limits, spam controls, stale-update protection, outage states, and observability | C-12, A-05, Section 15 | Required before pilot |
| 13. Audit, privacy, and retention | Centralize sensitive-read, assignment, status, export, authentication, administrative, and deletion events; implement retention and access review | A-04, Sections 13 and 17 | Required before pilot |
| 14. Operator-assisted reporting | Add an authorized operator workflow for reports created on behalf of callers, with source and consent metadata | O-09 and Journey 8.5 | Pilot decision |
| 15. Accessibility and low-connectivity | Validate mobile performance, screen-reader behavior, large targets, weak-network recovery, offline-safe drafts, and language needs | Sections 4, 12, 15 | Required before pilot |
| 16. Security and compliance review | Complete threat modeling, dependency review, secrets review, penetration testing, legal/privacy review, backup/recovery, and incident response procedures | Sections 13 and 17 | Required before pilot |
| 17. Controlled pilot readiness | Provision accounts, configure geography and organizations, write runbooks, train operators, define escalation contacts, and execute acceptance scenarios | Acceptance criteria 1 through 12 | Gate |
| 18. Controlled pilot and improvement | Operate with supervised incidents, measure outcomes, collect user feedback, fix reliability/usability gaps, and review incidents | Sections 16 and 18 | After MVP |
| 19. Expansion | Add additional agencies, jurisdictions, channels, categories, integrations, redundancy, governance, support, and sustainable operations | Sections 18 and 19 | Later |

## Immediate build sequence

The next implementation sequence should be:

1. Complete and verify the local dispatcher console, including shared incident discovery across citizen accounts and full queue action behavior. **Completed:** the console now supports status, category, priority, and jurisdiction filtering, structured dispatcher audit events, and stale-update protection.
2. Add explicit failure-state demonstrations for denied location, duplicate submission, stale update, and unavailable notification.
3. Add local role fixtures for citizen, dispatcher, agency coordinator, responder, and administrator so the permission model can be tested before Firebase claims are introduced.
4. Produce the implementation brief containing the approved screens, API contracts, Firestore entities, permission matrix, routing configuration, test scenarios, and pilot runbook skeleton.
5. Replace the local incident adapter with Firestore behind the same adapter boundary. Do not rewrite the citizen and dispatcher UI during that migration.

## Firestore migration target

The first Firestore model should include `users`, `organizations`, `jurisdictions`, `incidents`, `incidentEvents`, `assignments`, `notifications`, `auditLogs`, and `idempotencyKeys`. Precise location, reporter contact, medical details, and attachments should be treated as sensitive fields. Firestore security rules must enforce user, role, organization, jurisdiction, and incident-sensitivity constraints; client-side checks are not sufficient.

Incident creation and status transitions should be implemented as server-authorized operations rather than unrestricted client writes. Each mutation should validate the actor, expected incident version, allowed transition, and idempotency key before writing the incident and its event in one transaction or equivalent atomic operation.

## Pilot readiness gates

The project should not be treated as pilot-ready until a test citizen can create a durable report, a dispatcher can find and route it, an authorized organization or responder can accept or decline it, the citizen can see a safe timeline, unauthorized users are denied restricted details, and all sensitive reads and operational changes are auditable. The team must also have documented behavior for location denial, network loss, duplicate submission, failed notification, unavailable responders, stale updates, and dashboard outage.

Production deployment additionally requires confirmation from the pilot geography, participating emergency organizations, operational owner, legal/privacy reviewers, and security reviewers. The platform must continue to direct users to official emergency services for immediate danger and must not be presented as a replacement for those services.

## Product decisions still required

The PRD leaves several decisions open: the pilot geography, named organizations, official operating owner, final categories and category questions, citizen verification method, mobile-only versus citizen web scope, notification provider and SMS model, jurisdiction and routing rules, responder responsibilities, data retention and consent policy, USSD/SMS scope, service-level targets, and escalation conditions. These decisions should be recorded before Firestore rules, routing logic, and operational runbooks are finalized.
