# ECR code review — 6 November 2026

Reviewed the web client, server command handlers, Firestore access rules, Expo mobile app, build configuration, and CI. This was a source review with local checks and isolated Firebase emulator tests; it was not a production penetration test or a physical-device acceptance test.

## Fixes made

| Area | Confirmed problem and resulting behavior |
| --- | --- |
| Incident identity | Client request bodies could override the authenticated principal in incident creation. The route now passes only permitted report fields and retains the authenticated identity. |
| Assignments | Assignment expiry could affect another organization's incidents; obsolete offers could change a resolved or reassigned incident. Expiry now respects access scope, validates its interval, and checks the active assignment. Assignment writes also update the organization used by queue queries. |
| Private media and analytics | Access checks could cross jurisdiction boundaries, and role-only analytics access did not require active membership. These operations now enforce the applicable membership and jurisdiction. |
| Community messages | Ordinary signed-in users could create `admin_update` messages. Rules now require an active administrator, reject unsupported metadata, and require nonempty text. |
| Device tokens | A different account could overwrite an existing push-token document's owner. Updates now require existing ownership; mobile logout attempts to remove the current session's token. |
| Administrative sign-in | Incorrect Unicode passwords could cause a buffer-length exception. Invalid credentials now fail normally. |
| Agency routing | Missing or blank coordinates were interpreted as zero. Missing coordinates are now excluded from distance calculations. |
| Password reset | A hidden required password field blocked the reset form. Reset mode disables the field, and sign-in no longer applies registration-only minimum length. |
| Offline reporting | Failed browser storage could lose the queued form or turn a successful submission into a reported failure. Failed persistence now preserves the form, malformed queue entries are filtered, network errors are classified consistently, and duplicate concurrent retries are blocked. |
| Trusted API retries | Web and mobile retries generated new idempotency keys. Both now retain a key for the logical draft across retries and reloads; queued web reports retain their original key. |
| Web photos | Selected photos appeared to be report attachments but were never uploaded. Photos are now explicitly described as local drafts, retained in IndexedDB, recoverable after reload, and downloadable. The receipt states that they were not sent. |
| Mobile reports | Blank optional fields produced invalid Firestore writes, GPS/category values differed from the server contract, and successful trusted submissions ignored the server's real ID/reference. Payload normalization, receipt handling, document IDs, and duplicate-tap protection were corrected. |
| Mobile history and tracking | Report history could remain visible after an account change, status notifications used stale state, and Find report did not perform a lookup. History is now scoped by account, listeners are cleaned up, and tracking subscribes to public records. |
| Native authentication | Native Firebase authentication used memory-only persistence. It now uses the installed AsyncStorage integration; web initialization retains its browser path. |
| Contacts and accessibility | Opening contacts without Firebase configuration could crash; telephone formatting could corrupt short codes and international numbers. The local directory remains available without Firebase, telephone formatting is covered by tests, and browser zoom is enabled. |
| Homepage tracking | Lookup setup failures could crash the page; retrying the same reference did not restart a failed lookup. Invalid input now stops the old listener, retry restarts the subscription, and clipboard failures have a visible fallback. |
| CI | The existing workflow only typechecked source. It now also runs unit tests, mobile report helper tests, Firebase emulator tests, and the production build. |

The footer and the pre-existing edits to `IncidentPhotoGallery.tsx` and `mobile/package.json` were preserved. Earlier response-network/safety dark-mode corrections are also retained.

## Remaining work, in priority order

1. **Update vulnerable dependencies in a controlled change.** `npm audit --omit=dev --audit-level=high` reports **8 high and 8 moderate advisories**, including transitive gRPC, body-parser, follow-redirects, RE2JS, and Zod findings. The pnpm lockfile also contains affected versions, so this is relevant to the declared package-manager path. Resolve compatible direct/transitive updates, synchronize the supported lockfile strategy, and rerun tests. Do not apply the audit's forced Firebase downgrade blindly. The current CI dependency audit still uses `continue-on-error`; make it a release gate after remediation.

2. **Complete secure photo delivery.** Web and mobile photo previews are local only. Connect the existing media-intent, upload, scan, and authorized-download APIs to both clients, with explicit upload/retry status. In `server/privateMediaStorage.ts` and `server/mediaCommands.ts`, a previously issued upload URL can overwrite the same object after scanning. Store the exact scanned bytes under a separate server-only approved key and serve downloads from that key; include both quarantine and approved objects in retention cleanup.

3. **Finish idempotency and workflow protection for the direct Firestore path.** Persisted keys protect trusted API submissions, but the direct client-write fallback still creates a fresh document on retry. Prefer the trusted command path for shared operations, or implement deterministic/idempotent writes and regression tests for a lost response after a successful commit. Direct administrative updates also need transaction-based version checks rather than trusting the version supplied by the UI.

4. **Isolate and expire local drafts.** Web offline reports/photo drafts and the mobile report draft still use browser/device-wide storage keys. They can contain contact details and location information. Scope them by account with an explicit guest-to-account migration, offer clear/remove controls, and define expiry. Per-account mobile report history was fixed in this review; draft migration remains separate work.

5. **Finish trusted API deployment protections.** `server/_core/index.ts` applies its in-memory limiter to `/api/trpc`, while `/api/v1` lacks an equivalent request limiter. Add appropriate endpoint limits, bound limiter memory, and use validated proxy/IP configuration rather than trusting arbitrary forwarded headers. Configure an explicit allowed-origin CORS policy when the web client and trusted backend are hosted separately. The static Vercel deployment does not itself serve the Express API.

6. **Finish the native theme and push configuration.** Mobile dark mode changes some containers while many text/card colors remain fixed light-theme values. Introduce shared theme colors and verify every screen with large text. Configure the EAS project ID and platform push credentials, test permission denial and logout/account switching, and verify actual delivery on physical devices. Current token cleanup is best effort, not a server revocation guarantee.

7. **Add trusted report deletion.** Mobile deletion batches assume the public tracking document contains `ownerUid`; trusted server projections do not include it, so deleting a trusted-created report can be denied. Provide a server-authorized deletion/retention workflow that covers the incident, tracking record, related messages, and media consistently.

8. **Improve performance, UI coverage, and maintenance.** The production JavaScript entry bundle is approximately **1.61 MB before compression** and produces Vite's large-chunk warning. Consider route-level lazy loading, particularly the admin area. Add browser tests for reset, report retry, draft recovery, account switching, and tracking; add native device checks. Mobile lint is not configured with the required dependencies, so lint could not be completed without a separate setup change. Refresh older readiness documents that still describe earlier prototype behavior.

## Verification

| Check | Result |
| --- | --- |
| Root TypeScript check (`npm run check`) | Passed |
| Web/server unit tests (`npm test`) | 70 passed; emulator tests intentionally run separately |
| Firebase Auth/Firestore emulators (`npm run test:emulator`, demo project only) | 12 passed, including client rule denials and trusted transactions |
| Mobile TypeScript (`cd mobile && ./node_modules/.bin/tsc --noEmit`) | Passed |
| Mobile report regression tests (`node --test mobile/reportData.test.mjs`) | 9 passed |
| Production build (`npm run build`) | Passed, with large-bundle warning |
| Whitespace/conflict check (`git diff --check`) | Passed |
| Production dependency audit | Findings remain: 8 high, 8 moderate |
| Mobile lint | Unavailable without adding/configuring missing lint tooling |

Browser interaction tests, native builds, physical-device checks, live backend requests, and push delivery were not run for this audit. No live rules or backend changes were deployed. Release the updated server and rules through the normal deployment process before relying on these fixes outside the local checkout.

## References used for API-specific checks

- [Firebase field validation and allowed-field rules](https://firebase.google.com/docs/firestore/security/rules-fields)
- [Firebase security rule conditions](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Expo Firebase authentication persistence setup](https://github.com/expo/fyi/blob/main/firebase-js-auth-setup.md)
- [Expo SDK 57 notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)
