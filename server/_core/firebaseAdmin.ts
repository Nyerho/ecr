import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { ENV } from "./env";

let firebaseApp: App | null = null;
let firebaseAuth: Auth | null = null;
let firebaseFirestore: Firestore | null = null;

function requireFirebaseConfiguration() {
  if (!ENV.firebaseProjectId || !ENV.firebaseClientEmail || !ENV.firebasePrivateKey) {
    throw new Error(
      "Trusted Firebase backend is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
    );
  }
}

export function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  requireFirebaseConfiguration();
  firebaseApp = getApps().length
    ? getApps()[0]!
    : initializeApp({
        credential: cert({
          projectId: ENV.firebaseProjectId,
          clientEmail: ENV.firebaseClientEmail,
          privateKey: ENV.firebasePrivateKey.replace(/\\n/g, "\n"),
        }),
      });
  return firebaseApp;
}

export function getFirebaseAuth() {
  if (!firebaseAuth) firebaseAuth = getAuth(getFirebaseApp());
  return firebaseAuth;
}

export function getFirebaseFirestore() {
  if (!firebaseFirestore) firebaseFirestore = getFirestore(getFirebaseApp());
  return firebaseFirestore;
}

export { getFirebaseApp as firebaseApp };
export const firestore = {
  get instance() {
    return getFirebaseFirestore();
  },
};
