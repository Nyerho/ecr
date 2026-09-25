# PRD Addendum: Community Emergency Chat

## Status and intent

**Status:** Proposed for beta planning. This feature has not been implemented. The current ECR product is documented as a local-first prototype, so community messaging must not be treated as a live, monitored emergency service until the shared backend, authentication, authorization, and operational controls described here are in place.[1]

The feature gives a person a way to ask nearby ECR users for immediate, informal assistance while an emergency is unfolding. It must not replace contacting official emergency services or submitting an incident through ECR's official reporting and dispatch workflow. A community post does not alert an agency, dispatch a responder, or guarantee that anyone will see or answer it.

## Problem and outcome

A person may need nearby help while an official report is waiting for review or routing. ECR should let eligible users post a short, location-relevant request and let nearby users respond without exposing the poster's phone number or precise location to the whole community.

The target outcome is a faster connection between a person requesting help and willing nearby community members, while keeping formal emergency reporting separate, visible, and available throughout the experience.

## Proposed beta experience

The entry point is **Community Help**, not a general social network or unrestricted global chat. Users can view a jurisdiction-scoped feed of active emergency-help posts and join a text thread attached to each post. A poster chooses an emergency category, writes a brief request, and shares an approximate area. The request is published to eligible community members without waiting for an administrator to approve it; moderation is post-publication, with controls to report and hide unsafe content. The poster is prompted to contact official emergency services and submit the formal ECR incident report separately. ECR labels the post as a community request and clearly states that it is not an official report.

Eligible users in the configured local area can receive a minimal notification and reply in the post's thread. A reply must not imply professional dispatch or verified responder status unless the account has a separately verified operational role. The poster can close the request when help is no longer needed. Moderators can hide a post or message and review user reports under a published policy.

The initial beta should limit messages to emergency-help posts and their threads. Casual conversation, public direct messages, open-ended location search, and cross-jurisdiction rooms are out of scope until ECR has staffing, safeguards, and a product reason to support them.

## Users and permissions

| Role | Permitted actions |
|---|---|
| Signed-in community member | View active posts in an eligible jurisdiction; reply; report a post or message; block or mute another member. |
| Requester | Create and edit their own post; close it; view its replies; report or block a participant. |
| Moderator | Review reported content; hide or restore posts and messages; restrict posting privileges; record moderation actions. |
| Authorized dispatcher or agency user | Continue using the official incident and dispatch workflow. Community participation does not confer dispatch authority. |

Only authenticated users may post or reply in the beta. Every read and write must be authorized on the server. Client-side hiding is not an access-control boundary. The product must apply jurisdiction and visibility rules consistently to feed queries, notifications, replies, exports, and any future APIs.

## Privacy and safety requirements

The feed must show an approximate area, not a requester's exact coordinates, home address, phone number, or email address. Precise location belongs in the separately submitted official incident and is available only to roles authorized for that incident. Community notifications must not include unnecessary identity, injury, or other sensitive details.

Before posting, the user must see a clear, persistent notice to contact official emergency services for immediate danger. The community feature must state that it is not continuously monitored and cannot guarantee a response. It must not delay or block the official incident report while a user is composing a community request.

The product must warn users not to enter dangerous areas, confront a suspected offender, move an injured person unless necessary to avoid immediate danger, or claim professional credentials they do not hold. It must provide accessible controls to report, block, mute, and close requests. Rate limits, spam detection, abuse response, moderator audit logs, and an escalation path are release requirements, not optional enhancements.

The initial beta should not permit public direct messages or arbitrary file attachments in community threads. If photos are later enabled, they require the same private storage, access control, content review, retention, and deletion safeguards as incident evidence. Community messages must follow an approved retention schedule and must be deletable under an explicit policy, subject to documented safety, audit, and legal holds.

## Functional requirements

**CH-01 — Create and publish a request.** An authenticated user can create a short emergency-help post with a category, text, jurisdiction, approximate area, and creation time. After server validation, the request is immediately visible to eligible members without admin pre-approval. The interface identifies it as community-only and offers a direct route to official reporting and emergency-service instructions.

**CH-02 — Local visibility.** The service returns only active posts that the signed-in user is permitted to see. The eligible geography and visibility radius are configured for the pilot; they are not inferred from a client-supplied coordinate alone.

**CH-03 — Threaded replies.** Eligible members can send text replies to an active request. Replies identify the account using an approved display name or pseudonym, never reveal private contact details by default, and are not represented as agency acknowledgements or dispatch assignments.

**CH-04 — Close and status.** The requester can mark the community request as no longer needing help. The system records the actor and time. Closing the community post does not silently close or alter an official incident; the user is directed to update the official report separately.

**CH-05 — User safety controls.** A user can report a post or reply, block or mute another user, and understand what those controls do. Moderators can act on reports and record an auditable reason and outcome.

**CH-06 — Official reporting stays separate.** The official incident-submission and status-tracking flows remain reachable from the chat experience. Creating, reading, or replying to a community post never marks an official incident as submitted, acknowledged, assigned, or resolved.

**CH-07 — Reliability and access.** The server enforces authentication, jurisdiction scope, rate limits, message limits, and abuse restrictions. Failed sends are clearly shown and can be retried without duplicating messages. Unauthorized users cannot read a thread or receive its notifications.

**CH-08 — Notifications.** A permitted recipient may receive an opt-in notification for a nearby active request. The notification includes only the minimum content necessary and links back to the authorized thread. Delivery failures, duplicate suppression, and user preferences are supported.

## Acceptance criteria

1. A signed-in user can create a community-only request, sees the official emergency-services notice, and can still submit a separate official incident without losing the draft.
2. An eligible user in the configured pilot area can see the request and reply from a separate device. A user outside the allowed scope cannot retrieve it by changing an incident, user, or jurisdiction identifier.
3. The feed and notifications do not expose the requester's precise coordinates, address, phone number, email address, or unnecessary sensitive details.
4. A community reply does not create an official incident, route an agency, or change an official incident's status. A dispatcher receives official reports through the ordinary secured dispatch workflow.
5. The requester can close the community request without changing a separately submitted official incident. The close action is recorded.
6. A member can report and block a user. The blocked user cannot continue direct interaction with the reporter through the supported community UI, and moderators can review the report.
7. Rate limits, message validation, moderation restrictions, and authorization are enforced server-side. Automated tests cover unauthorized reads, cross-jurisdiction access, duplicate retries, blocked users, and moderator actions.
8. If the network or service is unavailable, the interface communicates that a message was not delivered. It does not imply the request reached responders or another user.

## Beta launch gates

This feature is not ready for beta until ECR has a production identity provider, server-authorized shared data, jurisdiction and visibility rules, a staffed moderation owner and response policy, rate limits, audit records, notifications with approved privacy content, a retention and deletion schedule, and tested outage behavior. A supervised drill must verify the separation between community requests and formal dispatch across multiple devices and roles.

The pilot owner must decide the eligible user population, display-name policy, visibility geography, notification radius, moderation coverage, response targets, language and accessibility needs, retention period, and what happens to content during an agency or platform outage. Until these decisions are approved, the feature should remain a documented proposal and must not be enabled for real emergencies.

## Out of scope for the initial beta

The initial release does not promise that a helper is nearby, available, trained, or trustworthy. It does not dispatch volunteers, verify that a user has arrived, guarantee rescue, replace emergency services, support unmoderated global chat, provide public direct messages, expose precise requester location to the community, or allow uploads of sensitive images. Those capabilities require separate safety, privacy, operational, and security review.

## References

[1]: ./ECR-IMPLEMENTATION-ROADMAP.md "ECR Implementation Roadmap"
