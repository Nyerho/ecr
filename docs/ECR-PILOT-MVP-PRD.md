# Emergency Community Response (ECR)
## Pilot Minimum Viable Product — Product Requirements Document

**Version:** 0.9 draft for product, operations, privacy, and security review
**Status:** Proposed requirements; approval and pilot decisions are pending
**Owner:** ECR product and pilot operating owner
**Last updated:** 25 September 2026

> **Safety statement:** ECR is a coordination and reporting tool. It is not an emergency dispatch service and does not replace contacting the official emergency number or emergency-response organization for the pilot area. Community replies are not verified professional assistance unless the person has a separately verified operational role.

## 1. Executive summary

ECR helps a person report an emergency, provide useful location and contact information, and follow the report's progress. Authorized dispatchers and response organizations receive the report through a protected operations workflow, assess it, route it, record actions, and provide safe status updates to the reporter.

The pilot also proposes a **Community Help** feature. It lets an authenticated user publish a short, jurisdiction-scoped request for nearby informal help without waiting for an administrator to approve the post. Eligible community members can reply in its thread. This channel is separate from formal incident reporting and dispatch. It must clearly disclose that it is not continuously monitored, does not notify an agency by itself, and cannot guarantee that someone will respond.

The current ECR repository is a local-first prototype. It contains user-interface demonstrations for citizen reporting, local account access, a dispatcher queue, and local photo capture. Those prototype records and photos do not sync between devices. The production identity, shared backend, private media handling, community messaging, notifications, and operational controls in this document are **requirements, not claims of existing production functionality**.[1]

## 2. Product context and problem

During an emergency, people need a simple way to describe what is happening and where help is needed. Response teams need reports that are actionable, access to the right details, and a reliable way to record ownership and progress. Reporters need clear confirmation and a safe status trail rather than being left unsure whether the report was seen.

In some situations, a nearby community member may be able to offer immediate informal assistance while official reporting or routing is under way. ECR should provide a carefully bounded way to connect those users without suggesting that the community channel is dispatch, exposing the requester's precise location to the public, or delaying contact with emergency services.

The product must support coordination around participating organizations and an explicitly selected pilot geography. Until those partners, operating procedures, and boundaries are approved, ECR is for controlled product testing only.

## 3. Goals and success measures

### 3.1 Goals

The pilot must let a person create a clear emergency report and give the reporter confirmation that it was submitted. It must let authorized dispatchers discover, review, route, and update reports. It must restrict sensitive details to the roles that need them and retain an auditable record of important access and workflow changes.

Where community chat is enabled, a user must be able to publish an emergency-help request to eligible nearby members without waiting for admin pre-approval. Members must be able to respond and use reporting and blocking controls, while the interface keeps the official response path prominent.

Optional incident photos should help identify a missing person or describe an incident scene or landmark. Photos must remain private and follow the same access and retention safeguards as other sensitive incident data.

### 3.2 Success measures

The pilot owner will approve numeric targets before launch. The pilot should measure report completion and failure rates, duplicate submissions, time from report submission to dispatcher acknowledgement, time to assignment, time to first safe status update, and the proportion of reports with usable location and contact details.

If Community Help is enabled, measure time to first community reply, the percentage of requests closed by their requester, reports of abuse or unsafe behavior, moderation response time, and cases where users mistake a community response for an official one. These measurements must not reward risky intervention or encourage posting unnecessary personal information. Collect the least telemetry needed and define retention before the pilot.

## 4. Scope

### 4.1 In scope for the controlled MVP/beta

The product includes a responsive citizen web experience for account access, emergency reporting, location confirmation, contact information, report history, and status updates. It includes authenticated operations views for dispatchers and participating organizations, with incident triage, assignment, status changes, notifications, audit records, and access restrictions.

The pilot includes a configured jurisdiction and participating response organizations. It includes a consent-based location flow, manual landmark/address entry, and a way to show only the location precision appropriate to each role. It may include optional photos after private upload, validation, access control, and retention are in place.

Community Help is part of the proposed beta scope when the operating owner approves it and moderation coverage is ready. It consists of a jurisdiction-limited feed of active emergency-help posts and text reply threads, not a general social network. Users publish validated posts immediately without admin pre-approval. Moderation occurs after publication, with user reporting and moderator tools.

### 4.2 Out of scope for the initial controlled beta

ECR will not claim to replace official emergency services, guarantee an arrival or outcome, or automatically dispatch community members. The initial beta will not include unmoderated global chat, public direct messages, unrestricted location search, community-visible exact coordinates, user-to-user phone or email disclosure, or arbitrary file uploads in community threads.

Automatic emergency-service dispatch, volunteer credential verification, live responder tracking, broad multi-region operations, USSD/SMS intake, medical diagnosis, payment features, and public incident maps are out of scope unless separately approved and specified. Operator-assisted reporting may be piloted only after source, consent, and audit requirements are approved.

## 5. Users and roles

| Role | Primary need | Access boundary |
|---|---|---|
| Citizen / reporter | Submit a report, share safe contact and location details, and follow their own report | May read their own reports and community content available in their configured jurisdiction; cannot read other citizens' private incident details |
| Community member | Offer informal help through an active Community Help thread | May see only eligible posts and replies; is not represented as a responder or agency unless separately verified |
| Dispatcher | Review incoming reports, triage urgency, route work, and coordinate status | May see details only for assigned jurisdictions and operational duties; sensitive reads and actions are audited |
| Organization coordinator | Manage an approved organization's roster, availability, and operational work | Limited to the coordinator's organization and assigned jurisdiction; may not grant themselves broader access |
| Responder | Accept or decline assignments and record operational progress | Limited to authorized assignments and the minimum information needed to respond |
| Community moderator | Review user-reported content, reduce harm, and apply the community policy | Can moderate community posts and messages; moderation access does not automatically grant access to unrelated incident details |
| Administrator | Configure users, organizations, jurisdictions, policies, and access | Privileged actions require strong authentication, least privilege, and audit; routine moderation should not require unrestricted incident access |

A user may have more than one role only when an authorized owner explicitly grants it. The server must verify role, organization, jurisdiction, assignment, and incident scope for every protected operation. Hiding a button in the browser is not authorization.

## 6. Core user journeys

### 6.1 Citizen submits and tracks an incident

The citizen opens the report flow and chooses the closest emergency category. The form asks for a concise description, relevant structured answers, a way to contact the reporter, and a location. The reporter can allow device location or enter a landmark/address manually. The reporter reviews the information, sees the privacy and safety notice, and submits.

The service validates and stores the report, returns a durable reference, and displays a clear submitted or failed state. The citizen can return later from another device, sign in, and view their own report and safe status history. If the service cannot confirm the write, the product must not claim the report was received; it must explain whether retry is safe and prevent accidental duplicates.

### 6.2 Dispatcher triages and routes an incident

An authorized dispatcher signs in and opens the queue scoped to their jurisdiction. They review the report and only the sensitive details required for the task. They acknowledge it, set or confirm priority, assign it to an eligible organization or responder, and record an operational note where permitted.

Each state change validates the current version and allowed transition on the server. The system records the actor, time, previous and new values, and relevant reason. The citizen receives an appropriate status update without unnecessary medical, identity, or precise-location details.

### 6.3 Organization or responder handles an assignment

An authorized organization coordinator sees work routed to their organization. An eligible responder accepts or declines an assignment. The system records the decision and informs the dispatcher. An accepted responder can record progress such as responding, arrived, or unable to proceed. If no eligible responder accepts, the dispatcher sees that state and follows the approved escalation procedure.

### 6.4 Citizen requests community help

A signed-in user opens **Community Help**, sees that immediate danger requires contacting official emergency services, and creates a brief emergency-help post with a category and approximate area. After server validation, the post appears to eligible users in the configured jurisdiction without waiting for an administrator to approve it. The post is clearly labeled as community-only and not continuously monitored.

Eligible community members can reply in its thread. The poster can close the community request. Closing it does not close or update an official incident. Creating or replying to a community post never creates, acknowledges, routes, or resolves an official incident. The user can submit a separate official report at any time without losing the community-post draft.

### 6.5 User reports unsafe community content

A user can report a post or reply and block or mute another member. The product confirms that the report was sent but does not promise immediate human review unless the service is staffed to meet a stated response target. A moderator can review the content, hide or restore it, restrict posting privileges, and record the reason and action. The moderator workflow must avoid disclosing the reporter's identity to the reported user.

### 6.6 Citizen attaches incident photos

The citizen may choose a photo from their device or capture one with the camera. The citizen labels it as a missing-person identifying image, scene/landmark evidence, or other useful context. The product explains that photos can expose sensitive information and must not be taken at personal risk. The server validates and stores the file privately. Only users authorized for that incident can view it, and accesses follow the retention and audit policy.

## 7. Functional requirements

Priority **P0** means required for the core controlled beta. **P1** means required only if the corresponding capability is enabled in the pilot. **P2** means a later enhancement.

### 7.1 Citizen reporting and status

**C-01 (P0), Emergency information.** The landing and report experiences must keep the official emergency-services path visible. The official contact number must be configurable for the selected geography; it must not be assumed from a development default.

**C-02 (P0), Category selection.** The initial category set is medical, fire, security, road accident, disaster, rescue, missing person, and other. The pilot owner may change this list and its required questions before the schema and routing policy are finalized.

**C-03 (P0), Report details.** A report supports a short description and category-specific structured answers, including whether people are injured and the number of affected people when known. The form supports an unknown or not-sure answer and does not require a user to guess.

**C-04 (P0), Contact method.** The reporter provides at least one approved contact method if that is the chosen pilot policy. Contact information is visible only to authorized response roles and must not be exposed in Community Help.

**C-05 (P0), Location.** The reporter can grant or decline device-location access and can enter a landmark or address manually. The user can review and correct location before submission. The system stores location source and precision, applies jurisdiction rules server-side, and restricts precise location to authorized roles.

**C-06 (P0), Review and submit.** The user can review the category, details, contact, location, and attachments before submitting. Submission uses an idempotency key so a retry does not create duplicate reports. A durable report reference is returned after the server confirms the write.

**C-07 (P0), Report history.** A signed-in citizen can view their own submitted reports and a safe status timeline from another device. The user cannot query another citizen's report by changing an identifier.

**C-08 (P0), Status communication.** The system communicates submission, acknowledgement, triage, assignment, responding, arrival, resolution, and any approved exception or closure states. It clearly distinguishes an automated update from a human or agency action.

**C-09 (P1), Optional photos.** The pilot may support JPEG, PNG, and WebP images with initial product defaults of up to three photos, 8 MB per image, and 16 MB total per incident. Before production, the owner must approve final limits, image processing, metadata removal, scanning, and retention. Type declarations alone are not sufficient file validation.

### 7.2 Dispatch and response operations

**O-01 (P0), Scoped queue.** Authorized dispatchers can view, filter, and open reports within their permitted jurisdiction and assignment scope. Unauthorized users are denied by the server.

**O-02 (P0), Triage.** The dispatcher can set priority from the pilot-approved scale, record triage notes, and identify missing information without changing the citizen's original submission silently.

**O-03 (P0), Assignment.** A dispatcher can route an incident to a verified, active organization that is eligible for the incident's geography and type. Manual overrides require a reason and are audited.

**O-04 (P0), Response decisions.** Authorized organizations or responders can accept or decline an assignment. The dispatcher can see pending decisions and use a documented fallback if no one accepts.

**O-05 (P0), State transitions.** The server validates each transition, actor, expected incident version, and idempotency key. It stores the incident update and audit event atomically or through an equivalent reliable mechanism.

**O-06 (P0), Audit history.** The system records report creation, sensitive reads, assignment, priority and status changes, responder decisions, exports, administrative changes, moderation actions, and deletion. Audit access is restricted and itself reviewable.

**O-07 (P1), Operational dashboards.** Organization and responder views show only the work and information required for their roles. Moderation tooling is separate from unrestricted incident access.

### 7.3 Community Help

**CH-01 (P1), Create and publish.** An authenticated user can create a brief emergency-help post with a category, text, jurisdiction, approximate area, and creation time. After server validation, the post is immediately visible to eligible members without admin pre-approval.

**CH-02 (P1), Eligibility and visibility.** The service returns only active posts the user is permitted to see. Pilot geography and visibility radius are configured by the operating owner; the server does not trust a client-supplied coordinate alone.

**CH-03 (P1), Replies.** Eligible members can send text replies in a post's thread. Replies use an approved display-name policy and never reveal private contact information by default. A reply cannot appear as an agency acknowledgement or official assignment unless it is generated by the authorized operational workflow.

**CH-04 (P1), Close request.** The requester can mark their post as no longer needing community help. The action is recorded. It does not update an associated official report unless the user separately confirms the official update through its own workflow.

**CH-05 (P1), Report, block, and mute.** A member can report content and block or mute another member. The user sees a clear delivery state and explanation of what each control does. Moderators can review reports, hide or restore content, restrict posting, and record an auditable reason.

**CH-06 (P1), Separate from dispatch.** A community post or reply never creates, acknowledges, routes, or changes the status of a formal incident. Formal dispatch remains available in the interface and operates through its authorized workflow.

**CH-07 (P1), Safety notice.** Before posting and in the active room, ECR states that the service is not continuously monitored, does not guarantee a reply, and does not replace official emergency services. It discourages dangerous self-deployment, confrontation, false credentials, and sharing unnecessary identifying details.

**CH-08 (P1), Notifications.** Opt-in notifications may alert eligible users to nearby active requests using minimal content. A recipient must be authorized when opening the thread. Notification preferences, duplicate suppression, delivery state, and failure behavior are supported.

**CH-09 (P1), Service and abuse limits.** Server-side authentication, jurisdiction scope, rate limits, post and message length limits, spam controls, duplicate retry protection, moderation restrictions, and safe error states are required. Unauthorized users must not retrieve a thread by changing identifiers or receive its notification.

The initial Community Help release excludes public direct messages, unmoderated global chat, exact requester coordinates, and arbitrary file attachments. Community photos require a separate privacy and security review before they are enabled.

### 7.4 Identity, administration, and access

**A-01 (P0), Production identity.** Replace local browser-only accounts with a maintained identity provider, secure account recovery, and verified server-side sessions. A user can sign out and revoke a lost or compromised session.

**A-02 (P0), Role assignment.** Roles are granted by an authorized administrator and stored in a server-controlled source of truth. Citizen, dispatcher, organization coordinator, responder, moderator, and administrator permissions are distinct.

**A-03 (P0), Privileged authentication.** Privileged accounts require multi-factor authentication, least privilege, time-bounded sessions where appropriate, and reviewable access changes.

**A-04 (P0), Authorization.** Every protected read and write checks the user, role, organization, jurisdiction, assignment, and record scope on the server. Denials are logged without leaking sensitive record details.

**A-05 (P0), Admin actions.** Administrative actions such as account suspension, role assignment, organization configuration, retention overrides, and export require elevated authorization, a recorded reason where appropriate, and an audit event.

### 7.5 Notifications and reliability

**N-01 (P0), In-app status.** A citizen can see official status changes in their report history. Operations users can see assignment and acknowledgement state.

**N-02 (P1), Push or SMS.** External notifications are enabled only after the delivery owner, cost, content, consent, fallback, and provider outage behavior are approved. Messages must not include unnecessary medical details or precise location.

**N-03 (P0), Safe retries.** A failed request communicates whether the server confirmed the write. Retry-safe operations use idempotency keys and do not silently create duplicates.

**N-04 (P0), Degraded service.** The system communicates when a report, message, notification, or upload was not delivered. It never implies that a dispatcher, agency, or community member has been informed unless delivery is confirmed.

**N-05 (P0), Monitoring.** The operating team can monitor service health, submission failures, queue depth, assignment delays, notification failures, and moderation backlog without exposing unnecessary sensitive content in logs.

## 8. Data and lifecycle requirements

The target service should keep identity, organization, jurisdiction, incident, assignment, event, notification, audit, idempotency, media, community-post, community-message, content-report, and block records logically separate. The implementation may choose a different physical schema if it preserves the access, retention, integrity, and audit requirements.

An incident includes its reporter, category, structured answers, description, location and precision metadata, safe contact details, priority, status, assigned organization or responder, timestamps, version, and linked audit events. Optional media is stored in private object storage and referenced by an opaque identifier. Precise coordinates, contact details, medical information, and attachments are sensitive fields.

A community post includes its author, category, text, approximate area, jurisdiction, visibility, status, created/updated/closed times, and moderation state. Replies are linked only to that post. A community post may reference an official incident only through an explicit, authorized user action; creation or closure must not synchronize status by default.

Each data class requires an approved retention and deletion period. The system supports correction and deletion workflows consistent with safety, operational audit, and legal obligations. Backups, exports, analytics, and logs follow the same sensitivity classification and access controls.

## 9. Privacy, safety, and security

The product collects only information needed to coordinate response. It explains why location and contact details are requested, how they are shared, and how a user can correct them. Community areas use coarse location. Exact coordinates and private contact details do not appear in community feeds, replies, public links, or lock-screen notifications.

All data in transit and at rest must be protected using the selected platform's approved encryption. Private incident media is not served from public URLs. Uploads use server-authorized intents or an authenticated proxy. The server verifies file signature and content, enforces size and decode limits, scans or quarantines content under the approved policy, and prevents path/key manipulation. The media pipeline defines EXIF handling and image transformations before launch.

The project completes a threat model and independent security review before real users' sensitive information is handled. Reviews cover account takeover, cross-user and cross-jurisdiction access, insider misuse, malicious uploads, spam, impersonation, community harassment, location inference, data loss, and service outage. Rate limits, monitoring, backups, tested restoration, key rotation, access review, and a security-incident response procedure are release gates.

Emergency safety language is plain and visible. ECR does not diagnose, promise help, or encourage a user to approach danger. If community chat is active, moderation coverage and response expectations are communicated honestly. The service must have a documented action for threats, exposed personal information, impersonation of responders, false reports, and suspected coordinated abuse.

## 10. Non-functional requirements

The product must work on supported modern mobile browsers and desktop dispatch stations. Core controls support keyboard navigation, screen readers, visible focus, sufficient color contrast, clear error announcements, and touch-friendly targets. The pilot defines supported languages and tests important emergency text with qualified reviewers.

Forms should work on constrained networks. The user can recover from a network interruption without losing a draft where technically feasible. Images upload with progress and retry behavior only after the private storage pipeline is implemented. The service must define availability, response-time, queue freshness, recovery-point, and recovery-time targets with the operating owner before pilot launch; this PRD does not assume unapproved numeric service guarantees.

The system uses structured logs with sensitive values redacted. Monitoring and audit retention are separately defined. Database and object-storage backups are encrypted and restored in a rehearsal before launch. Build and dependency changes follow a reviewable release process with separate development, staging, and pilot environments.

## 11. Operational model

Before launch, the operating owner names the organization responsible for queue coverage and community moderation. The owner documents service hours, jurisdiction boundaries, staffing, escalation contacts, after-hours handling, responder availability, outage communications, user support, incident response, and beta stop conditions.

Dispatchers must know who is currently responsible for each open report. If a report cannot be routed or no responder accepts, the console displays that condition and the dispatcher follows a documented fallback. Community Help cannot be advertised as monitored unless staffing and a response commitment are approved. Moderation coverage for Community Help must have an explicit schedule and escalation path.

## 12. Analytics and reporting

Operational reporting should use aggregated measures wherever possible. The pilot reviews report volume by category and jurisdiction, completeness, acknowledgement and assignment timing, unresolved backlog, failure and duplicate rates, responder decisions, and user feedback. Community-enabled pilots separately review reply timing, request closure, moderation volume, abuse reports, and confusing or unsafe interactions.

Analytics must not expose report text, precise coordinates, contact details, images, or community conversation content to broad analytics roles. Access to raw data is logged. Numeric targets and stop thresholds are set with the pilot owner before launch, not inferred from the prototype.

## 13. Acceptance criteria

1. A citizen can submit a report with category, description, approved structured answers, contact method, and confirmed location. If location permission is denied, manual landmark/address entry remains available.
2. A confirmed report receives a durable reference and appears in the citizen's account on a separate device. Retrying the same submission does not create a duplicate.
3. A citizen cannot read another user's report by changing a URL, record identifier, or API input.
4. An authorized dispatcher can find a report in the correct jurisdiction, triage it, assign it to an eligible organization, and record a valid status transition. Every action is attributed and auditable.
5. A responder or organization can accept or decline an assignment. A decline or missed response is visible and leads to the documented escalation path.
6. A citizen sees safe official status updates. A status update accurately distinguishes automated messages from dispatcher or agency actions.
7. If media is enabled, an authorized user can upload and view an approved image across devices. An unrelated citizen and an out-of-scope operator are denied. File-signature, size, scan, audit, and retention cases pass.
8. If Community Help is enabled, a signed-in eligible user can create a post that is visible after server validation without admin pre-approval. An eligible user on another device can reply.
9. Community content shows only approved approximate location. It does not expose precise coordinates or private contact information.
10. A community post, reply, or close action never creates or changes an official incident. The reporter can continue through the separate official workflow.
11. A user can report and block a community member. A moderator can review and act on content, and the action is audited without disclosing the reporter's identity to the reported user.
12. Cross-jurisdiction requests, blocked accounts, unauthorized reads, duplicate retries, message abuse, upload abuse, failed notifications, stale updates, and service outages are tested and produce safe outcomes.
13. The system has passed documented accessibility checks, security/privacy review, a backup-restore test, and a supervised multi-role staging rehearsal.
14. The operating owner, participating organizations, and required security and privacy reviewers have approved the beta geography, staffing, runbooks, retention policy, escalation contacts, and stop conditions.

## 14. Dependencies and unresolved decisions

The following decisions block a production beta: pilot geography and official emergency number; participating organizations and operating owner; final categories and required questions; eligible citizen and responder populations; citizen verification and account recovery; supported language and devices; jurisdiction and visibility boundaries; organization coverage and assignment rules; location precision by role; notification providers and consent; community display-name policy and visibility radius; moderation staffing and response targets; image size, format, scanning, and metadata policy; retention and deletion periods; support hours; service-level targets; and legal/privacy review requirements.

The product owner and participating organizations must document these decisions before implementation relies on them. Community chat also requires an explicit minimum-age and minor-safeguarding policy; it remains disabled until those protections and moderation practices are approved. Where a choice materially affects safety, privacy, permissions, operational responsibility, or cost, the feature remains disabled until that choice is approved.

## 15. Release stages

**Prototype validation:** Use synthetic data to validate citizen reporting and local dispatcher interactions. Local-only identity, local storage, and the local dispatcher switch are not secure production controls.

**Shared-system staging:** Add production-grade authentication, server-authorized shared data, scoped operations, audit, private media if enabled, and tested outage handling. Run two-device and cross-role acceptance scenarios with synthetic records.

**Controlled beta:** Enable only the approved geography and named organizations. Train users and operators, staff the queue, establish moderation if chat is enabled, monitor stop conditions, and begin with a small cohort. Expand only after a documented review of safety, privacy, reliability, and user feedback.

The project is not beta-ready solely because the interface builds or a preview deployment succeeds. The full gate sequence is maintained in the [ECR Beta Readiness Checklist].[2]

## 16. Relationship to the prototype

The current prototype provides visual and local workflow demonstrations for the landing page, local registration/sign-in, incident categories, report detail and location steps, local report history, optional local photo selection, and a local dispatcher console. Browser data and photo blobs are not shared across devices. Prototype users and local dispatcher controls are not production authentication. Production authorization, Firestore/shared database rules, private media, notification delivery, Community Help, and pilot operations remain to be built and reviewed.[1]

## References

[1]: ./ECR-IMPLEMENTATION-ROADMAP.md "ECR Implementation Roadmap"
[2]: ./BETA-READINESS-CHECKLIST.md "ECR Beta Readiness Checklist"
