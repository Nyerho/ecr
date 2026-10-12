# Release 3 — Notifications and cross-platform readiness

Release 3 adds shared Expo notification support for Android and iOS.

## Delivered

- Requests notification permission on physical Android and iOS devices.
- Registers an Expo push token in Firestore under `deviceTokens` for both `android` and `ios`.
- Creates an Android notification channel for ECR report updates.
- Displays an in-app status alert and schedules a local device notification when a citizen's report changes status.
- Keeps registration and permission handling best-effort so the report workflow still works if notifications are denied.
- Adds the Expo notifications config plugin and Android `POST_NOTIFICATIONS` permission.
- Updates Firestore rules so iOS device tokens are accepted alongside Android tokens.

## Android and iOS

The implementation is shared in `mobile/App.tsx`, so both platforms receive the same behavior. Android requires the notification permission added by this release. iOS asks for notification permission at runtime. EAS builds must be rebuilt after adding the native notifications plugin.

## Test checklist

1. Install a development or preview build on a physical Android device and allow notifications.
2. Install a development or preview build on a physical iPhone and allow notifications.
3. Confirm a `deviceTokens` document is created with `platform: android` or `platform: ios`.
4. Change a report status from the authorized operations view and confirm the in-app alert and local notification.
5. Deny notification permission and confirm reporting still works without a crash.
6. Rebuild with EAS after pulling this release because `expo-notifications` changes native configuration.

## Important limitation

This release registers tokens and provides local status notifications. Remote notifications triggered by server-side status changes require a trusted backend/Cloud Function to send through Expo Push Service; that fan-out is the next hardening step.
