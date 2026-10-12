# Release 4 — Offline-safe drafts, dark appearance, and accessibility

Release 4 extends the existing cross-platform ECR experience without changing the incident, notification, or Chatter data models.

## Delivered

- Web report submissions that fail because the browser is offline or the network is temporarily unavailable are stored as **pending uploads** in `localStorage`.
- The citizen dashboard clearly labels pending reports as **not yet delivered** and provides an explicit retry action.
- Pending report entries include the report payload, queue time, retry count, and the latest retry error. They remain local until an upload is confirmed.
- The existing web unfinished-form draft flow remains intact and continues to save category, step, location, and contact fields.
- Web dark appearance is persisted in `localStorage`, uses the requested deep background variant `#10172a`, and is available from every route through an accessible theme toggle.
- The shared Expo Android/iOS app adds a persisted **Dark appearance** control in More. Both platforms use the same React Native implementation and continue to share the existing report, location, photo, Chatter, and notification workflows.
- Existing reduced-motion handling remains enabled on the web, and the new controls expose labels, pressed/checked state, status messaging, and keyboard/focus behavior.

## Safety and delivery behavior

A pending report is not an emergency-service notification and must not be described as received by ECR. The interface keeps the official emergency-services warning visible. Users should call official emergency services directly for immediate danger.

The current prototype does not yet have a server-side idempotency key or background service worker. For that reason, retries are explicit user actions rather than automatic background submission. A retry should be performed only when the user is satisfied that the previous attempt was not confirmed.

## Android and iOS

The mobile changes are in the shared `mobile/App.tsx`, so Android and iOS behavior stays aligned. The appearance preference is stored with AsyncStorage and does not require a new native dependency or a new EAS build configuration.

## Test checklist

1. Open the web app, toggle Dark appearance, reload, and confirm the preference persists.
2. Start a report, disable connectivity, submit, and confirm a pending-upload banner appears.
3. Restore connectivity and use Retry; confirm the banner clears only after the upload succeeds.
4. Close a report before submission and confirm the existing Resume draft action still works.
5. Run `cd mobile && npx tsc --noEmit`.
6. Run `pnpm exec vite build`.
7. Check for conflict markers and whitespace errors.
