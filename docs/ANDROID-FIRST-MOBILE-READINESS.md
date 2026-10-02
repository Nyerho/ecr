# ECR Android-first mobile readiness

This document tracks the work needed to turn ECR into a full Android application while keeping the Vercel/web experience available for PC demonstrations.

## Current decision

- **Android first**, followed by iOS after the Android flow is stable.
- **Web remains supported** and continues to use the existing Vite/Vercel build.
- **Capacitor** is the packaging route so the existing React interface and Firebase integration can be reused.
- The Android shell uses application ID `com.ecr.response` and reads the web build from `dist/public`.

## Preparation items 1–10

### 1. Prepare the current web app for mobile — started

Completed:

- Added `viewport-fit=cover` to the web viewport metadata.
- Added `100dvh` body sizing for modern mobile browsers.
- Added safe-area utility classes for future native headers and bottom actions.
- Confirmed the existing report forms use touch-sized controls and responsive layouts.

Still required:

- Test on real Android phones at narrow widths.
- Check keyboard, rotation, modal, and safe-area behavior.
- Review all fixed floating controls against Android navigation bars.

### 2. Add Capacitor — scaffolded

Completed:

- Added `@capacitor/core`, `@capacitor/android`, and Capacitor CLI.
- Added `capacitor.config.ts`.
- Generated the `android/` project.
- Added `cap:sync`, `android:open`, and `android:run` scripts.

Blocked in this sandbox:

- Android SDK, Gradle, and `adb` are not installed, so an APK cannot be built or installed here yet.
- Android Studio or a configured Android build machine is required for the first device build.

### 3. Add native capabilities — planned, not yet enabled

The next native integrations are:

- Native GPS/location permissions.
- Firebase Cloud Messaging push notifications.
- Camera and gallery access after Firebase Storage and media rules are approved.
- Optional voice-note recording after the core report flow is stable.

The current browser geolocation and photo-selection paths remain available for the web demo.

### 4. Improve offline behavior — design required

Before enabling offline submissions, ECR must distinguish clearly between:

- Saved locally as a draft.
- Queued for retry.
- Successfully delivered to Firestore.

The app must never tell a user that an emergency report was received until Firestore delivery is confirmed. Duplicate retry protection and idempotency keys are required before offline sending is enabled.

### 5. Strengthen the backend — partially present

Already present:

- Firebase Auth for active browser authentication.
- Firestore incident records.
- Dedicated `admins` collection.
- Firestore security rules.
- Incident status and audit-event structures.
- Admin location visibility and agency routing data.

Required before a public mobile release:

- Firebase App Check.
- Server-side validation and rate limiting.
- Duplicate-report protection.
- Cloud Functions or another trusted server path for status transitions and notification fan-out.
- Monitoring, backup, retention, and recovery procedures.

### 6. Add safe user incentives later — intentionally deferred

Points must be awarded for verified, useful contributions rather than raw report counts. The recommended flow is:

```text
Report submitted → admin verification → points approved → threshold reached → payout review
```

Badges and recognition should be tested before cash conversion. Cash incentives require fraud controls, identity/payment review, budget limits, terms, and a reversal process for false reports.

### 7. Mobile navigation — current responsive navigation retained

The current web navigation remains the source of truth for the PC demo. A later Android pass should add an explicit mobile navigation structure for:

- Home
- Report
- My reports
- Emergency contacts
- Notifications
- Profile
- Help and safety

The SOS action should remain visible and should continue to open the official local contact choices before a call is placed.

### 8. App-specific security — required before release

The Android app must not contain Firebase Admin credentials or private keys. Before release, configure:

- Firebase App Check.
- Secure session handling.
- Device/session logout.
- App-level privacy and consent copy.
- Production-only environment values.
- Debug/release signing separation.
- No sensitive data in logs or notification previews.

### 9. Separate environments — required

Create separate Firebase environments for development, beta/staging, and production. The current Vercel/web environment must remain available for demonstrations and must not be confused with the Android release environment.

### 10. Real-device testing — required before development phases

Test the complete flow on real Android devices in the Agbarho–Ughelli pilot area:

- Registration and sign-in.
- GPS granted, denied, approximate, and unavailable.
- Manual landmark reporting.
- Weak network and offline draft behavior.
- Duplicate submit taps and retry behavior.
- Report receipt/reference creation.
- Admin live update and location visibility.
- Emergency contact links.
- WhatsApp and TikTok fallbacks.
- Device rotation, keyboard, backgrounding, and reopening.
- Accessibility and large text settings.

## Development phase gate

Do not move to native feature development until:

1. Android Studio or another Android build environment is available.
2. A debug APK can be generated.
3. The APK can run on at least one real Android device.
4. The web demo still builds and deploys independently.
5. Firebase development/beta environment boundaries are documented.
6. Location, notification, offline, security, and release decisions are approved.

## Useful commands

```bash
# Web demo/build remains unchanged
pnpm dev
pnpm build

# Build the web assets and synchronize them into Android
pnpm cap:sync

# Open the generated Android project when Android Studio is installed
pnpm android:open

# Run on a connected/emulated Android device when adb and the SDK are configured
pnpm android:run
```
