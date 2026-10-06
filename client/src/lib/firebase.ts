import { Capacitor } from "@capacitor/core";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

const androidFirebaseConfig = {
  apiKey: "AIzaSyD9pgcxG9kJAIJr0YmLm2y1lsSMI68OL_g",
  authDomain: "emergencyresponse-af0ac.firebaseapp.com",
  projectId: "emergencyresponse-af0ac",
  storageBucket: "emergencyresponse-af0ac.firebasestorage.app",
  messagingSenderId: "216836030362",
  appId: "1:216836030362:web:a462d8feda1716f6348423",
};
const isNativeAndroid =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

export type UserRole =
  | "citizen"
  | "dispatcher"
  | "coordinator"
  | "responder"
  | "moderator"
  | "admin";
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
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (isNativeAndroid ? androidFirebaseConfig.apiKey : ""),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (isNativeAndroid ? androidFirebaseConfig.authDomain : ""),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || (isNativeAndroid ? androidFirebaseConfig.projectId : ""),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || (isNativeAndroid ? androidFirebaseConfig.storageBucket : ""),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || (isNativeAndroid ? androidFirebaseConfig.messagingSenderId : ""),
  appId: import.meta.env.VITE_FIREBASE_APP_ID || (isNativeAndroid ? androidFirebaseConfig.appId : ""),
};

export const firebaseConfigured = Object.values(config).every(Boolean);
const app = firebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(config)
  : null;
export const firebaseAuth = app ? getAuth(app) : null;
export const firestore = app ? getFirestore(app) : null;

export function firebaseSetupMessage() {
  return firebaseConfigured
    ? ""
    : "This service is temporarily unavailable. Please try again shortly.";
}

export function reportSubmissionMessage(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (code === "auth/operation-not-allowed") {
    return "Guest reporting is not enabled yet. Please enable Anonymous sign-in in the service settings.";
  }
  if (code === "auth/network-request-failed" || code === "unavailable") {
    return "The report service is temporarily unavailable. Please try again.";
  }
  if (code === "permission-denied") {
    return "The report was rejected by the service rules. Please contact the administrator.";
  }
  if (code === "failed-precondition") {
    return "The report service needs an administrator configuration update.";
  }
  if (code === "invalid-argument") {
    return "Some report details are invalid. Please review them and try again.";
  }
  return "We could not send the report right now. Please try again.";
}

function requireAuth() {
  if (!firebaseAuth) throw new Error(firebaseSetupMessage());
  return firebaseAuth;
}
function requireFirestore() {
  if (!firestore) throw new Error(firebaseSetupMessage());
  return firestore;
}

export function observeFirebaseUser(
  callback: (user: FirebaseUser | null) => void
): Unsubscribe {
  return onAuthStateChanged(requireAuth(), callback);
}

export async function registerFirebaseUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  const credential = await createUserWithEmailAndPassword(
    requireAuth(),
    input.email.trim().toLowerCase(),
    input.password
  );
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

export async function ensureAnonymousFirebaseUser() {
  const auth = requireAuth();
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}
export function signInFirebaseUser(email: string, password: string) {
  return signInWithEmailAndPassword(
    requireAuth(),
    email.trim().toLowerCase(),
    password
  );
}

export function signOutFirebaseUser() {
  return signOut(requireAuth());
}

export function observeUserProfile(
  uid: string,
  callback: (profile: FirebaseProfile | null) => void
) {
  const database = requireFirestore();
  let userProfile: FirebaseProfile | null = null;
  let adminProfile: Partial<FirebaseProfile> | null = null;
  const emit = () => {
    if (userProfile)
      callback({
        ...userProfile,
        ...(adminProfile ? { ...adminProfile, role: "admin" } : {}),
      } as FirebaseProfile);
    else if (adminProfile)
      callback({
        uid,
        name: adminProfile.name ?? "ECR Administrator",
        email: adminProfile.email ?? "",
        role: "admin",
        ...adminProfile,
      } as FirebaseProfile);
    else callback(null);
  };
  const stopUser = onSnapshot(
    doc(database, "users", uid),
    snapshot => {
      userProfile = snapshot.exists()
        ? ({ uid: snapshot.id, ...snapshot.data() } as FirebaseProfile)
        : null;
      emit();
    },
    emit
  );
  const stopAdmin = onSnapshot(
    doc(database, "admins", uid),
    snapshot => {
      adminProfile =
        snapshot.exists() && snapshot.data().active !== false
          ? ({
              uid: snapshot.id,
              ...snapshot.data(),
            } as Partial<FirebaseProfile>)
          : null;
      emit();
    },
    emit
  );
  return () => {
    stopUser();
    stopAdmin();
  };
}

export function mapFirestoreDocument<T extends DocumentData>(
  snapshot: QueryDocumentSnapshot<T>
) {
  return { id: snapshot.id, ...snapshot.data() } as T & { id: string };
}

export type FirestoreIncident = {
  id: string;
  publicReference: string;
  reporterUid: string;
  reporterName?: string | null;
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
  events?: Array<{
    label: string;
    actorUid: string;
    createdAt?: unknown;
    previousValue?: string | null;
    newValue?: string | null;
  }>;
};
export type PublicIncidentTracking = {
  publicReference: string;
  category: string;
  status: string;
  priority: string;
  events?: Array<{
    label: string;
    createdAt?: unknown;
  }>;
  updatedAt?: unknown;
};
export type CommunityMessage = {
  id: string;
  kind: "alert" | "comment" | "admin_update";
  text: string;
  authorUid: string;
  publicReference?: string | null;
  category?: string | null;
  locationLabel?: string | null;
  visibility: "public" | "hidden";
  createdAt?: unknown;
};

export type EmergencyContactRecord = {
  id: string;
  name: string;
  area: string;
  description: string;
  numbers: string[];
  telNumbers?: string[];
  icon: "medical" | "police" | "fire" | "default";
  tone: string;
  createdAt?: unknown;
};

export const DEFAULT_EMERGENCY_CONTACTS: Array<
  Omit<EmergencyContactRecord, "id" | "createdAt">
> = [
  {
    name: "Delta State emergency ambulance",
    area: "Delta State · DELSEAS",
    description: "For urgent medical transport and ambulance coordination.",
    numbers: ["112", "0704 100 8130", "0704 100 8131"],
    telNumbers: ["+234112", "+2347041008130", "+2347041008131"],
    icon: "medical",
    tone: "border-rose-100 bg-rose-50/70 text-rose-900",
  },
  {
    name: "Delta State Police control room",
    area: "Police · Delta State",
    description: "For immediate security threats, crime, violence, or protection needs.",
    numbers: ["0803 668 4974"],
    icon: "police",
    tone: "border-blue-100 bg-blue-50/70 text-blue-900",
  },
  {
    name: "Ughelli fire service",
    area: "Fire and rescue · Ughelli",
    description: "For fires, rescue situations, and other fire-service incidents in the Ughelli area.",
    numbers: ["0806 535 6844"],
    icon: "fire",
    tone: "border-orange-100 bg-orange-50/70 text-orange-900",
  },
  {
    name: "Ughelli Central Hospital",
    area: "Oteri Road · Ughelli Urban 2",
    description: "Public secondary hospital with accident and emergency services listed.",
    numbers: ["0705 639 8074"],
    icon: "medical",
    tone: "border-emerald-100 bg-emerald-50/70 text-emerald-900",
  },
  {
    name: "Lily Hospitals Ughelli",
    area: "Olori Crescent · off Ughelli–Patani Expressway",
    description: "Private hospital with multi-specialist and diagnostic services.",
    numbers: ["0915 263 3242", "0704 137 7925"],
    telNumbers: ["+2349152633242", "+2347041377925"],
    icon: "medical",
    tone: "border-teal-100 bg-teal-50/70 text-teal-900",
  },
];

export function subscribeToEmergencyContacts(
  callback: (contacts: EmergencyContactRecord[]) => void,
  onError: (error: unknown) => void
) {
  return onSnapshot(
    query(collection(requireFirestore(), "emergencyContacts"), limit(100)),
    snapshot => {
      callback(
        snapshot.docs
          .map(
            contact =>
              ({ id: contact.id, ...contact.data() }) as EmergencyContactRecord
          )
          .sort((left, right) => left.name.localeCompare(right.name))
      );
    },
    onError
  );
}

export async function ensureDefaultEmergencyContacts() {
  const database = requireFirestore();
  const marker = doc(database, "settings", "emergencyContacts");
  if ((await getDoc(marker)).exists()) return;
  const batch = writeBatch(database);
  DEFAULT_EMERGENCY_CONTACTS.forEach((contact, index) => {
    batch.set(doc(database, "emergencyContacts", `default-${index + 1}`), {
      ...contact,
      createdAt: serverTimestamp(),
    });
  });
  batch.set(marker, { seeded: true, createdAt: serverTimestamp() });
  await batch.commit();
}

export async function createEmergencyContact(
  contact: Omit<EmergencyContactRecord, "id" | "createdAt">,
  actorUid: string
) {
  const reference = await addDoc(collection(requireFirestore(), "emergencyContacts"), {
    ...contact,
    createdBy: actorUid,
    createdAt: serverTimestamp(),
  });
  return reference.id;
}

export function deleteEmergencyContact(id: string) {
  return deleteDoc(doc(requireFirestore(), "emergencyContacts", id));
}

function subscribeToChatSource(
  source: ReturnType<typeof query>,
  callback: (messages: CommunityMessage[]) => void,
  onError: (error: unknown) => void
) {
  return onSnapshot(
    source,
    snapshot => {
      const messages = snapshot.docs.map(
        message =>
          ({
            id: message.id,
            ...(message.data() as DocumentData),
          }) as CommunityMessage
      );
      callback(
        messages.sort(
          (left, right) => toMillis(left.createdAt) - toMillis(right.createdAt)
        )
      );
    },
    onError
  );
}

export function subscribeToCommunityChat(
  callback: (messages: CommunityMessage[]) => void,
  onError: (error: unknown) => void
) {
  const database = requireFirestore();
  return subscribeToChatSource(
    query(
      collection(database, "chatMessages"),
      where("visibility", "==", "public"),
      limit(100)
    ),
    callback,
    onError
  );
}

export function subscribeToAdminCommunityChat(
  callback: (messages: CommunityMessage[]) => void,
  onError: (error: unknown) => void
) {
  const database = requireFirestore();
  return subscribeToChatSource(
    query(collection(database, "chatMessages"), limit(200)),
    callback,
    onError
  );
}

export async function sendCommunityMessage(input: {
  text: string;
  kind?: CommunityMessage["kind"];
  publicReference?: string;
}) {
  const user = await ensureAnonymousFirebaseUser();
  const text = input.text.trim().slice(0, 800);
  if (!text) throw new Error("Write a short message before sending.");
  return addDoc(collection(requireFirestore(), "chatMessages"), {
    kind: input.kind ?? "comment",
    text,
    authorUid: user.uid,
    publicReference: input.publicReference ?? null,
    visibility: "public",
    createdAt: serverTimestamp(),
  });
}

export function hideCommunityMessage(id: string) {
  return updateDoc(doc(requireFirestore(), "chatMessages", id), {
    visibility: "hidden",
    moderatedAt: serverTimestamp(),
  });
}

export function unhideCommunityMessage(id: string) {
  return updateDoc(doc(requireFirestore(), "chatMessages", id), {
    visibility: "public",
    moderatedAt: serverTimestamp(),
  });
}

export function trackPublicIncident(
  reference: string,
  callback: (incident: PublicIncidentTracking | null) => void,
  onError: (error: unknown) => void
) {
  const database = requireFirestore();
  const trackingRef = doc(
    database,
    "publicTracking",
    reference.trim().toUpperCase()
  );
  return onSnapshot(
    trackingRef,
    snapshot => {
      callback(
        snapshot.exists() ? (snapshot.data() as PublicIncidentTracking) : null
      );
    },
    onError
  );
}

export async function ensurePublicTrackingRecord(incident: FirestoreIncident) {
  const database = requireFirestore();
  const reference = incident.publicReference.trim().toUpperCase();
  const trackingRef = doc(database, "publicTracking", reference);
  const existing = await getDoc(trackingRef);
  if (existing.exists()) return;
  await setDoc(trackingRef, {
    public: true,
    publicReference: reference,
    category: incident.category,
    status: incident.status,
    priority: incident.priority,
    events: (incident.events ?? []).map(event => ({
      label: event.label,
      createdAt: event.createdAt ?? null,
    })),
    updatedAt: incident.updatedAt ?? null,
  });
}

export function subscribeToMyIncidents(
  uid: string,
  callback: (incidents: FirestoreIncident[]) => void
) {
  const database = requireFirestore();
  const incidentsQuery = query(
    collection(database, "incidents"),
    where("reporterUid", "==", uid)
  );
  return onSnapshot(incidentsQuery, snapshot => {
    const incidents = snapshot.docs
      .map(mapFirestoreDocument)
      .sort(
        (left, right) => toMillis(right.createdAt) - toMillis(left.createdAt)
      );
    callback(incidents as FirestoreIncident[]);
  });
}

function toMillis(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value).getTime();
  }
  return 0;
}

export function subscribeToAdminCollection<T extends DocumentData>(
  name: "incidents" | "users" | "organizations" | "auditLogs",
  callback: (rows: Array<T & { id: string }>) => void
) {
  const database = requireFirestore();
  const source = query(
    collection(database, name),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(source, snapshot =>
    callback(
      snapshot.docs.map(mapFirestoreDocument) as Array<T & { id: string }>
    )
  );
}

export async function createFirestoreIncident(
  input: Pick<
    FirestoreIncident,
    | "reporterUid"
    | "reporterName"
    | "category"
    | "description"
    | "locationLabel"
    | "latitude"
    | "longitude"
    | "reporterPhone"
    | "reporterEmail"
  >
) {
  const database = requireFirestore();
  const reference = `ECR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const nowEvent = {
    label: "Report submitted",
    actorUid: input.reporterUid,
    previousValue: null,
    newValue: "submitted",
    createdAt: new Date().toISOString(),
  };
  const optionalFields = Object.fromEntries(
    Object.entries({
      reporterName: input.reporterName,
      locationLabel: input.locationLabel,
      latitude: input.latitude,
      longitude: input.longitude,
      reporterPhone: input.reporterPhone,
      reporterEmail: input.reporterEmail,
    }).filter(([, value]) => value !== undefined)
  );
  const documentReference = doc(collection(database, "incidents"));
  const trackingReference = doc(database, "publicTracking", reference);
  const batch = writeBatch(database);
  batch.set(documentReference, {
    reporterUid: input.reporterUid,
    category: input.category,
    description: input.description,
    ...optionalFields,
    publicReference: reference,
    status: "submitted",
    priority: "medium",
    version: 1,
    events: [nowEvent],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(trackingReference, {
    publicReference: reference,
    category: input.category,
    status: "submitted",
    priority: "medium",
    events: [{ label: "Report submitted", createdAt: nowEvent.createdAt }],
    public: true,
    ownerUid: input.reporterUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const chatReference = doc(collection(database, "chatMessages"));
  batch.set(chatReference, {
    kind: "alert",
    text: `New ${input.category.replaceAll("_", " ")} alert reported${input.locationLabel ? ` near ${input.locationLabel}` : ""}. Reference ${reference}. Follow the public status for updates.`,
    authorUid: input.reporterUid,
    publicReference: reference,
    category: input.category,
    locationLabel: input.locationLabel ?? null,
    visibility: "public",
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return { id: documentReference.id, publicReference: reference };
}

export async function updateFirestoreIncident(
  id: string,
  changes: Partial<
    Pick<FirestoreIncident, "status" | "priority" | "assignedOrganizationId">
  >,
  actorUid: string,
  expectedVersion: number,
  previousStatus: string,
  publicReference: string
) {
  const database = requireFirestore();
  const incidentRef = doc(database, "incidents", id);
  const trackingRef = doc(
    database,
    "publicTracking",
    publicReference.trim().toUpperCase()
  );
  const statusEvent = {
    label: changes.status
      ? `Status updated to ${changes.status.replaceAll("_", " ")}`
      : "Incident updated",
    actorUid,
    previousValue: previousStatus,
    newValue: changes.status ?? null,
    createdAt: new Date().toISOString(),
  };
  const batch = writeBatch(database);
  batch.update(incidentRef, {
    ...changes,
    version: expectedVersion + 1,
    updatedAt: serverTimestamp(),
    events: arrayUnion(statusEvent),
    lastAction: { actorUid, changes, createdAt: serverTimestamp() },
  });
  batch.set(
    trackingRef,
    {
      public: true,
      publicReference,
      status: changes.status,
      events: arrayUnion({
        label: statusEvent.label,
        createdAt: statusEvent.createdAt,
      }),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  const chatReference = doc(collection(database, "chatMessages"));
  batch.set(chatReference, {
    kind: "admin_update",
    text: `${publicReference} update: ${statusEvent.label}.`,
    authorUid: actorUid,
    publicReference: publicReference.trim().toUpperCase(),
    visibility: "public",
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function createFirestoreOrganization(
  input: Record<string, unknown>,
  actorUid: string
) {
  const database = requireFirestore();
  return addDoc(collection(database, "organizations"), {
    ...input,
    isActive: true,
    isVerified: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: actorUid,
  });
}

export async function updateFirestoreUserRole(
  uid: string,
  role: UserRole,
  actorUid: string
) {
  const database = requireFirestore();
  await updateDoc(doc(database, "users", uid), {
    role,
    updatedAt: serverTimestamp(),
    lastRoleChangeBy: actorUid,
  });
}

export async function writeFirestoreAudit(input: {
  actorUid: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}) {
  const database = requireFirestore();
  await addDoc(collection(database, "auditLogs"), {
    ...input,
    metadata: input.metadata ?? {},
    createdAt: serverTimestamp(),
  });
}
