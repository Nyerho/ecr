# Release 1 — Usability and reliability

This release improves the citizen experience across the web and Expo mobile apps.

## Delivered

- **Password reset:** Firebase reset-email flow is available on web and mobile sign-in screens.
- **Recoverable report drafts:** Web drafts are saved in browser storage; mobile drafts are saved with AsyncStorage while the report wizard is open. Users can resume or discard a web draft.
- **Clear report progress:** The web wizard announces the current step and purpose for screen readers and keyboard users.
- **Safer submission errors:** Mobile no longer displays a successful submission when Firestore fails. The user receives a retry-oriented error and their draft remains saved.
- **Location fallback:** Web and mobile explain that users can continue with a landmark or without GPS when permission is denied or location is unavailable.
- **Accessibility:** Added live progress messaging, status messaging for password reset, explicit reset actions, and preserved labels/roles for errors and controls.
- **Expo Go compatibility:** Removed the native-only blur dependency from the current mobile release so standard Expo Go testing does not show an unimplemented `ExpoBlurView` error.

## Test checklist

1. Web: open sign-in, choose **Forgot your password?**, request a reset, and verify the success message.
2. Web: start a report, enter details, close the dialog, reopen the site, and choose **Resume draft**.
3. Web/mobile: deny location permission and confirm landmark/manual continuation is explained.
4. Mobile: start a report, close/reload while in the wizard, and confirm the draft is restored.
5. Mobile: disable network or use invalid Firestore rules, submit, and confirm no false success is shown.
6. Mobile: run `npx expo start -c` and verify no `ExpoBlurView` error appears.

## Follow-up

Push notifications, a true offline upload queue, and photo compression/storage are intentionally deferred to Release 2.
