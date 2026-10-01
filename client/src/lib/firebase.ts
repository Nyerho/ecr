import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

export type UserRole = "citizen" | "dispatcher" | "coordinator" | "responder" | "moderator" | "admin";
export type FirebaseProfile = {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId?: string | null;
  jurisdictionId?: string | null;
  photoURL?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(config).every(Boolean);
const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
export const firebaseAuth = app ? getAuth(app) : null;
export const firestore = app ? getFirestore(app) : null;

export function firebaseSetupMessage() {
  return firebaseConfigured
    ? ""
    : "Firebase is not configured for this environment. Add the VITE_FIREBASE_* values before using authentication or Firestore.";
}

function requireAuth() {
  if (!firebaseAuth) throw new Error(firebaseSetupMessage());
  return firebaseAuth;
}
function requireFirestore() {
  if (!firestore) throw new Error(firebaseSetupMessage());
  return firestore;
}

export function observeFirebaseUser(callback: (user: FirebaseUser | null) => void): Unsubscribe {
  return onAuthStateChanged(requireAuth(), callback);
}

export async function registerFirebaseUser(input: { name: string; email: string; password: string }) {
  const credential = await createUserWithEmailAndPassword(requireAuth(), input.email.trim().toLowerCase(), input.password);
  await updateProfile(credential.user, { displayName: input.name.trim() });
  await setDoc(doc(requireFirestore(), "users", credential.user.uid), {
    uid: credential.user.uid,
    name: input.name.trim(),
    email: credential.user.email,
    role: "citizen" satisfies UserRole,
    organizationId: null,
    jurisdictionId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return credential.user;
}

export function signInFirebaseUser(email: string, password: string) {
  return signInWithEmailAndPassword(requireAuth(), email.trim().toLowerCase(), password);
}

export function signOutFirebaseUser() {
  return signOut(requireAuth());
}

export function observeUserProfile(uid: string, callback: (profile: FirebaseProfile | null) => void) {
  const database = requireFirestore();
  let userProfile: FirebaseProfile | null = null;
  let adminProfile: Partial<FirebaseProfile> | null = null;
  const emit = () => {
    if (userProfile) callback({ ...userProfile, ...(adminProfile ? { ...adminProfile, role: "admin" } : {}) } as FirebaseProfile);
    else if (adminProfile) callback({ uid, name: adminProfile.name ?? "ECR Administrator", email: adminProfile.email ?? "", role: "admin", ...adminProfile } as FirebaseProfile);
    else callback(null);
  };
  const stopUser = onSnapshot(doc(database, "users", uid), snapshot => {
    userProfile = snapshot.exists() ? ({ uid: snapshot.id, ...snapshot.data() } as FirebaseProfile) : null;
    emit();
  }, emit);
  const stopAdmin = onSnapshot(doc(database, "admins", uid), snapshot => {
    adminProfile = snapshot.exists() && snapshot.data().active !== false ? ({ uid: snapshot.id, ...snapshot.data() } as Partial<FirebaseProfile>) : null;
    emit();
  }, emit);
  return () => { stopUser(); stopAdmin(); };
}

export function mapFirestoreDocument<T extends DocumentData>(snapshot: QueryDocumentSnapshot<T>) {
  return { id: snapshot.id, ...snapshot.data() } as T & { id: string };
}

export type FirestoreIncident = {
  id: string;
  publicReference: string;
  reporterUid: string;
  category: string;
  status: string;
  priority: string;
  description: string;
  locationLabel?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  reporterPhone?: string | null;
  reporterEmail?: string | null;
  assignedOrganizationId?: string | null;
  version: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  events?: Array<{ label: string; actorUid: string; createdAt?: unknown; previousValue?: string | null; newValue?: string | null }>;
};

export function subscribeToMyIncidents(uid: string, callback: (incidents: FirestoreIncident[]) => void) {
  const database = requireFirestore();
  const incidentsQuery = query(collection(database, "incidents"), where("reporterUid", "==", uid), orderBy("createdAt", "desc"));
  return onSnapshot(incidentsQuery, snapshot => callback(snapshot.docs.map(mapFirestoreDocument) as FirestoreIncident[]));
}

export function subscribeToAdminCollection<T extends DocumentData>(name: "incidents" | "users" | "organizations" | "auditLogs", callback: (rows: Array<T & { id: string }>) => void) {
  const database = requireFirestore();
  const source = query(collection(database, name), orderBy("createdAt", "desc"));
  return onSnapshot(source, snapshot => callback(snapshot.docs.map(mapFirestoreDocument) as Array<T & { id: string }>));
}

export async function createFirestoreIncident(input: Pick<FirestoreIncident, "reporterUid" | "category" | "description" | "locationLabel" | "latitude" | "longitude" | "reporterPhone" | "reporterEmail">) {
  const database = requireFirestore();
  const reference = `ECR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const nowEvent = { label: "Report submitted", actorUid: input.reporterUid, previousValue: null, newValue: "submitted", createdAt: serverTimestamp() };
  return addDoc(collection(database, "incidents"), {
    ...input,
    publicReference: reference,
    status: "submitted",
    priority: "medium",
    version: 1,
    events: [nowEvent],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateFirestoreIncident(id: string, changes: Partial<Pick<FirestoreIncident, "status" | "priority" | "assignedOrganizationId">>, actorUid: string, expectedVersion: number) {
  const database = requireFirestore();
  const incidentRef = doc(database, "incidents", id);
  await updateDoc(incidentRef, {
    ...changes,
    version: expectedVersion + 1,
    updatedAt: serverTimestamp(),
    events: [],
    lastAction: { actorUid, changes, createdAt: serverTimestamp() },
  });
}

export async function createFirestoreOrganization(input: Record<string, unknown>, actorUid: string) {
  const database = requireFirestore();
  return addDoc(collection(database, "organizations"), { ...input, isActive: true, isVerified: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: actorUid });
}

export async function updateFirestoreUserRole(uid: string, role: UserRole, actorUid: string) {
  const database = requireFirestore();
  await updateDoc(doc(database, "users", uid), { role, updatedAt: serverTimestamp(), lastRoleChangeBy: actorUid });
}

export async function writeFirestoreAudit(input: { actorUid: string; action: string; resourceType: string; resourceId?: string; metadata?: Record<string, unknown> }) {
  const database = requireFirestore();
  await addDoc(collection(database, "auditLogs"), { ...input, metadata: input.metadata ?? {}, createdAt: serverTimestamp() });
}
