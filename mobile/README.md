# ECR Mobile — Expo React Native

Cross-platform React Native Expo implementation of the ECR Mobile APK. The recovered feature set is implemented as native screens:

- ECR-branded home dashboard and bottom navigation
- Emergency categories: medical, fire/rescue, road accident, violence/protection, flood/disaster, rescue, missing person, and other
- Four-step report flow: category → incident details → location → review/submit
- Optional GPS location using `expo-location`, OpenStreetMap preview, landmark/address fallback
- Up to three optional incident photos from camera or photo library
- Optional reporter name, phone, email, and people-affected count
- Firebase email/password sign-in and Firestore incident persistence, with local report-history fallback
- Report history and response timeline tracking
- Emergency contact sheet with one-tap calling
- WhatsApp help link
- EAS profiles for Android APK preview builds, Android production AABs, and iOS archives

## Run locally

```powershell
npm install
npx expo start
```

You can run the Android app from Windows with Android Studio/emulator or a connected device. iOS development does not require a Mac when using Expo Go for testing or EAS Build for cloud builds.

## EAS setup from Windows

1. Install Node.js LTS and log in:

   ```powershell
   npm install -g eas-cli
   eas login
   ```

2. From this project directory, initialize the EAS project once:

   ```powershell
   eas init
   ```

   This creates an EAS project and writes the real `extra.eas.projectId` into `app.json`. Replace the placeholder value in `app.json` only if `eas init` does not do it automatically.

3. Confirm the resolved native configuration:

   ```powershell
   eas build:configure
   npx expo config --type public
   ```

4. Build an Android APK for internal testing:

   ```powershell
   eas build --platform android --profile preview
   ```

5. Build the Android production AAB for Google Play:

   ```powershell
   eas build --platform android --profile production
   ```

## Generate the iOS `.ipa` from Windows

A Mac is not required. EAS Build compiles the iOS archive in Expo's cloud infrastructure.

1. You need an active Apple Developer Program membership. On the first iOS build, EAS will open an interactive credentials flow. Let EAS manage the distribution certificate and provisioning profile unless you already have an Apple credential strategy.
2. Run the production iOS archive build:

   ```powershell
   eas build --platform ios --profile production
   ```

3. When the build completes, open the URL printed by EAS, or run:

   ```powershell
   eas build:list --platform ios --limit 5
   ```

4. Download the artifact from the EAS build page. The downloaded archive is the `.ipa` file. For device testing, use an ad-hoc/internal distribution profile; for App Store/TestFlight delivery, submit the archive with:

   ```powershell
   eas submit --platform ios --latest
   ```

   `eas submit` requires App Store Connect access and is separate from generating/downloading the IPA.

Useful variants:

```powershell
# Inspect credentials
 eas credentials -p ios
# Rebuild from a clean cloud environment
 eas build --platform ios --profile production --clear-cache
# Build both platforms
 eas build --platform all --profile production
```

## Important notes

- EAS iOS builds still require Apple signing credentials and Apple Developer access; Windows is only the client machine.
- The original Firebase project configuration was recovered from the APK bundle. Ensure its Firebase Authentication and Firestore rules allow the intended mobile clients before production release.
- The original APK stored report history locally as a fallback. This app keeps that behavior while also writing authenticated reports to Firestore.
- Photos are currently attached in the native UX and stored in local report history; production photo sync should be connected to Firebase Storage if the backend requires the image bytes.
- The identifier `com.ecr.response` matches the original APK package. If this conflicts with an existing Apple App ID or Play listing, change both identifiers before the first store build.

## Chatter

The mobile app includes a live Chatter room backed by the shared Firestore `chatMessages` collection. It shows public sanitized emergency alerts, community comments, and verified ECR updates, with filters for each message type. New reports are written atomically to `incidents`, `publicTracking`, and `chatMessages`, so a submitted report appears automatically as a sanitized alert. Signed-in or anonymous users can post short community comments; alerts include a link to track the public report.

If Chatter is empty during testing, confirm that Firebase Firestore rules allow public reads of `chatMessages` where `visibility == "public"`, and that anonymous authentication is enabled if testing without signing in.
