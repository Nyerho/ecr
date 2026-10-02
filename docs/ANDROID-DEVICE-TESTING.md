# Android phone testing guide

## Important deployment distinction

The Android version is a native APK built from the Capacitor project. **Vercel deploys web applications, not APK files**, so the native Android app cannot receive its own Vercel URL in the same way as the web app.

The Android app and web app can still use the same React source, Firebase project, Firestore rules, and visual design. This is the preferred setup because fixes made to the report flow remain consistent across both platforms.

A second Vercel project is possible only as a second **mobile-web deployment**. It would be another browser link, not a native Android app, and maintaining two independently deployed web projects would make testing and UI consistency harder. For the beta, keep the existing web URL for PC demonstrations and distribute the Android debug APK directly to testers.

## Recommended first test path

1. Install Android Studio on a computer with the Android SDK.
2. Clone or pull the `main` branch of the ECR repository.
3. Open the repository's `android/` folder in Android Studio.
4. Let Android Studio install any requested Android SDK platform or build tools.
5. Enable **Developer options** and **USB debugging** on the Android phone.
6. Connect the phone with a USB cable and accept the RSA/debugging prompt.
7. Select the phone in Android Studio and press **Run**.
8. On the phone, grant location permission when ECR asks for it.
9. Test both paths: GPS granted, and GPS denied with a landmark or no location.
10. Test sign-in, report submission, receipt/reference creation, admin live visibility, emergency contacts, WhatsApp, and TikTok links.

## Command-line build path

From the repository root, after Android Studio has configured the SDK:

```bash
pnpm install --frozen-lockfile
pnpm cap:sync
cd android
./gradlew assembleDebug
```

The APK will be generated at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it with Android Debug Bridge when the phone is connected:

```bash
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The current sandbox has Java and Gradle but does not have the Android SDK or `adb`, so it cannot produce the APK here. The source project is ready for Android Studio.

## Location testing checklist

- **Permission granted:** the report should show captured coordinates and allow review.
- **Permission denied:** the report should show a clear message, but the Review button must remain available.
- **GPS unavailable:** entering a landmark should be sufficient.
- **No GPS and no landmark:** the user can still submit, but the admin should treat the report as requiring location follow-up.
- **Weak network:** verify the receipt is shown only after Firestore confirms the write.

## Web and Android uniformity

The Android shell copies the same production web bundle from `dist/public`. Therefore the same headings, fonts, buttons, colors, report workflow, Firebase Auth path, and Firestore data model are shared by default. The current responsive changes also use mobile-safe modal sizing, stacked action buttons, wrapped headings, and safe-area spacing for floating controls.
