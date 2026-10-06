# Firebase and Firestore setup

The active browser authentication and incident data path is Firebase-only:

- **Firebase Authentication** handles email/password sign-in, registration, and sessions.
- **Cloud Firestore** stores user profiles, incidents, organizations, and audit logs.
- The admin workspace is available at `/admin` and requires an active `admins/{uid}` document. Admin authorization is intentionally separate from the general `users` collection.
- The old local authentication and MySQL/Drizzle code remains in the repository only as compatibility code for the existing server tests; it is not used by the active Firebase client flow.

## Configure a local environment

1. Create a Firebase project and register a Web app.
2. Enable **Authentication > Sign-in method > Email/Password**.
3. Create a Firestore database.
4. Copy `.env.example` to `.env.local` and fill in the web app values from Firebase Console.
5. Deploy `firestore.rules` from the Firebase CLI or paste the rules into Firestore Rules.
6. Register the first user through `/register`, then add that UID to the `admins` collection through a trusted bootstrap script or server-side Admin SDK. Do not allow a normal client to promote itself.

## Firestore collections

| Collection | Purpose |
| --- | --- |
| `users` | Firebase UID, display name, email, non-admin role, organization and jurisdiction scope |
| `admins` | Dedicated admin allow-list keyed by Firebase Auth UID |
| `incidents` | Citizen reports, status, priority, assignment, version and event history |
| `organizations` | Responder directory entries |
| `auditLogs` | Immutable administrative actions |

The rules intentionally prevent a citizen from changing their own role. Production deployments should also consider Firebase App Check, a trusted admin bootstrap function, and Cloud Functions for server-side status transitions and notification fan-out.
