import { createHash, randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAuth, getFirebaseFirestore } from "./_core/firebaseAdmin";

export const INCIDENT_CATEGORIES = [
  "medical",
  "fire",
  "security",
  "road_accident",
  "disaster",
  "rescue",
  "missing_person",
  "other",
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
export type InstitutionalRole = "admin" | "dispatcher" | "coordinator" | "responder";
export type OrganizationMembership = {
  id: string;
  uid: string;
  organizationId: string;
  jurisdictionId: string | null;
  role: InstitutionalRole;
  active: boolean;
};
export type CommandPrincipal = {
  uid: string;
  email: string | null;
  role: string;
  organizationId: string | null;
  jurisdictionId: string | null;
  memberships: OrganizationMembership[];
  token: DecodedIdToken;
};

const operationalRoles = new Set<InstitutionalRole>([
  "admin",
  "dispatcher",
  "coordinator",
  "responder",
]);

const allowedTransitions: Record<string, string[]> = {
  received: ["triaged", "cancelled", "duplicate", "unable_to_verify"],
  triaged: ["assigned", "escalated", "cancelled", "unable_to_verify"],
  assigned: ["responding", "escalated", "cancelled", "unable_to_verify"],
  responding: ["arrived", "escalated", "unable_to_verify"],
  arrived: ["resolved", "escalated"],
  escalated: ["assigned", "responding", "resolved", "unable_to_verify"],
  unable_to_verify: ["triaged", "escalated", "closed"],
  resolved: ["closed"],
  submitted: ["received", "cancelled"],
  cancelled: [],
  duplicate: ["closed"],
  closed: [],
};

export class CommandError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_ARGUMENT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE",
    message: string,
    public readonly status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : code === "UNAVAILABLE" ? 503 : 400,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

function idempotencyDocumentId(uid: string, commandKey: string) {
  return createHash("sha256").update(`${uid}:${commandKey}`).digest("hex");
}

function requireCommandKey(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{8,96}$/.test(value)) {
    throw new CommandError("INVALID_ARGUMENT", "A valid idempotency key is required.");
  }
  return value;
}

function requireCategory(value: unknown): IncidentCategory {
  if (typeof value !== "string" || !INCIDENT_CATEGORIES.includes(value as IncidentCategory)) {
    throw new CommandError("INVALID_ARGUMENT", "Unsupported incident category.");
  }
  return value as IncidentCategory;
}

function optionalText(value: unknown, max: number, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new CommandError("INVALID_ARGUMENT", `${field} is invalid.`);
  }
  return value.trim();
}

function optionalCoordinate(value: unknown, field: string) {
  const text = optionalText(value, 64, field);
  if (text === null) return null;
  if (!Number.isFinite(Number(text))) {
    throw new CommandError("INVALID_ARGUMENT", `${field} must be numeric.`);
  }
  return text;
}

async function principalFromToken(token: DecodedIdToken): Promise<CommandPrincipal> {
  const database = getFirebaseFirestore();
  const profile = await database.collection("users").doc(token.uid).get();
  const data = profile.exists ? profile.data() ?? {} : {};
  const [adminRecord, membershipSnapshot] = await Promise.all([
    database.collection("admins").doc(token.uid).get(),
    database.collection("organizationMemberships").where("uid", "==", token.uid).limit(50).get(),
  ]);
  const memberships = membershipSnapshot.docs.flatMap(snapshot => {
    const membership = snapshot.data();
    if (membership.active !== true || typeof membership.organizationId !== "string" || !operationalRoles.has(membership.role as InstitutionalRole)) return [];
    return [{
      id: snapshot.id,
      uid: token.uid,
      organizationId: membership.organizationId,
      jurisdictionId: typeof membership.jurisdictionId === "string" ? membership.jurisdictionId : null,
      role: membership.role as InstitutionalRole,
      active: membership.active === true,
    }];
  });
  const profileOrganizationId = typeof data.organizationId === "string" ? data.organizationId : null;
  const selectedMembership = memberships.find(membership => membership.organizationId === profileOrganizationId) ?? memberships[0];
  const role = adminRecord.data()?.active === true
    ? "admin"
    : selectedMembership?.role ?? (typeof data.role === "string" ? data.role : "citizen");
  return {
    uid: token.uid,
    email: token.email ?? (typeof data.email === "string" ? data.email : null),
    role,
    organizationId: selectedMembership?.organizationId ?? profileOrganizationId,
    jurisdictionId: selectedMembership?.jurisdictionId ?? (typeof data.jurisdictionId === "string" ? data.jurisdictionId : null),
    memberships,
    token,
  };
}

export async function authenticateBearerToken(authorization: string | undefined) {
  if (!authorization?.startsWith("Bearer ")) {
    throw new CommandError("UNAUTHENTICATED", "A Firebase ID token is required.");
  }
  const tokenValue = authorization.slice("Bearer ".length).trim();
  if (!tokenValue) throw new CommandError("UNAUTHENTICATED", "A Firebase ID token is required.");
  try {
    const token = await getFirebaseAuth().verifyIdToken(tokenValue, true);
    return principalFromToken(token);
  } catch (error) {
    if (error instanceof CommandError) throw error;
    throw new CommandError("UNAUTHENTICATED", "The Firebase session is invalid or revoked.");
  }
}

function requireOperationalPrincipal(principal: CommandPrincipal) {
  if (!operationalRoles.has(principal.role as InstitutionalRole)) {
    throw new CommandError("FORBIDDEN", "Institutional operations access is required.");
  }
  if (principal.role !== "admin" && (!principal.organizationId || principal.memberships.length === 0)) {
    throw new CommandError("FORBIDDEN", "An active organization membership is required.");
  }
}

function canAccessIncident(principal: CommandPrincipal, incident: Record<string, unknown>) {
  if (principal.role === "admin") return true;
  if (incident.reporterUid === principal.uid) return true;
  if (principal.memberships.some(membership => membership.organizationId === incident.organizationId && (!incident.jurisdictionId || !membership.jurisdictionId || membership.jurisdictionId === incident.jurisdictionId))) return true;
  if (principal.jurisdictionId && incident.jurisdictionId === principal.jurisdictionId && principal.role === "dispatcher") return true;
  return false;
}

function safeTrackingProjection(data: Record<string, unknown>) {
  return {
    public: true,
    publicReference: data.publicReference,
    category: data.category,
    status: data.status,
    priority: data.priority,
    events: Array.isArray(data.events)
      ? data.events.map(event => {
          const value = event as Record<string, unknown>;
          return { label: value.label, createdAt: value.createdAt ?? null };
        })
      : [],
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export function isAllowedIncidentTransition(from: string, to: string) {
  return allowedTransitions[from]?.includes(to) ?? false;
}

export async function createTrustedIncident(input: {
  principal: CommandPrincipal;
  category: unknown;
  description: unknown;
  commandKey: unknown;
  reporterName?: unknown;
  locationLabel?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  reporterPhone?: unknown;
  reporterEmail?: unknown;
}) {
  const category = requireCategory(input.category);
  const description = optionalText(input.description, 2000, "description");
  if (!description || description.length < 4) {
    throw new CommandError("INVALID_ARGUMENT", "A report description is required.");
  }
  const commandKey = requireCommandKey(input.commandKey);
  const reporterName = optionalText(input.reporterName, 160, "reporterName");
  const locationLabel = optionalText(input.locationLabel, 220, "locationLabel");
  const latitude = optionalCoordinate(input.latitude, "latitude");
  const longitude = optionalCoordinate(input.longitude, "longitude");
  const reporterPhone = optionalText(input.reporterPhone, 32, "reporterPhone");
  const reporterEmail = optionalText(input.reporterEmail, 320, "reporterEmail");
  if (!reporterPhone && !reporterEmail) {
    throw new CommandError("INVALID_ARGUMENT", "A phone number or email is required.");
  }

  const database = getFirebaseFirestore();
  const idempotencyRef = database.collection("idempotencyKeys").doc(idempotencyDocumentId(input.principal.uid, commandKey));
  const incidentRef = database.collection("incidents").doc();
  const reference = `ECR-${new Date().getFullYear()}-${randomUUID().slice(0, 6).toUpperCase()}`;

  return database.runTransaction(async transaction => {
    const existing = await transaction.get(idempotencyRef);
    if (existing.exists) {
      const previous = existing.data() ?? {};
      if (typeof previous.incidentId === "string") {
        const previousIncident = await transaction.get(database.collection("incidents").doc(previous.incidentId));
        if (previousIncident.exists) return { id: previousIncident.id, publicReference: previousIncident.data()?.publicReference, replayed: true };
      }
      throw new CommandError("CONFLICT", "The idempotency key has already been used.");
    }

    const event = {
      label: "Report received",
      actorUid: input.principal.uid,
      previousValue: null,
      newValue: "received",
      createdAt: new Date().toISOString(),
    };
    const incident = {
      publicReference: reference,
      reporterUid: input.principal.uid,
      reporterName,
      category,
      description,
      locationLabel,
      latitude,
      longitude,
      reporterPhone,
      reporterEmail,
      organizationId: null,
      jurisdictionId: input.principal.jurisdictionId,
      status: "received",
      priority: "medium",
      version: 1,
      events: [event],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.create(incidentRef, incident);
    transaction.create(database.collection("incidentEvents").doc(), {
      incidentId: incidentRef.id,
      type: "received",
      actorUid: input.principal.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(database.collection("auditEvents").doc(), {
      action: "incident.created",
      actorUid: input.principal.uid,
      resourceType: "incident",
      resourceId: incidentRef.id,
      result: "success",
      requestId: commandKey,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(idempotencyRef, {
      command: "incident.create",
      commandKey,
      incidentId: incidentRef.id,
      actorUid: input.principal.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(database.collection("publicTracking").doc(reference), safeTrackingProjection(incident));
    return { id: incidentRef.id, publicReference: reference, replayed: false };
  });
}

export async function transitionTrustedIncident(input: {
  principal: CommandPrincipal;
  incidentId: string;
  nextStatus: string;
  expectedVersion: number;
  commandKey: unknown;
  note?: unknown;
}) {
  requireOperationalPrincipal(input.principal);
  if (!/^[A-Za-z0-9._:-]{8,96}$/.test(input.incidentId)) {
    throw new CommandError("INVALID_ARGUMENT", "Invalid incident identifier.");
  }
  const commandKey = requireCommandKey(input.commandKey);
  const note = optionalText(input.note, 500, "note");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new CommandError("INVALID_ARGUMENT", "A valid expected version is required.");
  }

  const database = getFirebaseFirestore();
  const incidentRef = database.collection("incidents").doc(input.incidentId);
  const idempotencyRef = database.collection("idempotencyKeys").doc(idempotencyDocumentId(input.principal.uid, commandKey));
  return database.runTransaction(async transaction => {
    const existingCommand = await transaction.get(idempotencyRef);
    if (existingCommand.exists) return { replayed: true, ...(existingCommand.data()?.result as Record<string, unknown>) };
    const snapshot = await transaction.get(incidentRef);
    if (!snapshot.exists) throw new CommandError("NOT_FOUND", "Incident not found.");
    const incident = snapshot.data() ?? {};
    if (!canAccessIncident(input.principal, incident)) {
      throw new CommandError("FORBIDDEN", "This incident is outside your organization or assignment scope.");
    }
    const currentStatus = String(incident.status ?? "submitted");
    if (!isAllowedIncidentTransition(currentStatus, input.nextStatus)) {
      throw new CommandError("INVALID_ARGUMENT", `Cannot transition an incident from ${currentStatus} to ${input.nextStatus}.`);
    }
    if (incident.version !== input.expectedVersion) {
      throw new CommandError("CONFLICT", "The incident changed before this command was applied.");
    }
    const event = {
      label: `Status updated to ${input.nextStatus.replaceAll("_", " ")}`,
      actorUid: input.principal.uid,
      previousValue: currentStatus,
      newValue: input.nextStatus,
      note,
      createdAt: new Date().toISOString(),
    };
    const result = { id: snapshot.id, publicReference: incident.publicReference, status: input.nextStatus, version: input.expectedVersion + 1 };
    transaction.update(incidentRef, {
      status: input.nextStatus,
      version: input.expectedVersion + 1,
      events: FieldValue.arrayUnion(event),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(database.collection("incidentEvents").doc(), {
      incidentId: snapshot.id,
      type: "status_changed",
      fromStatus: currentStatus,
      toStatus: input.nextStatus,
      note,
      actorUid: input.principal.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(database.collection("auditEvents").doc(), {
      action: "incident.status_changed",
      actorUid: input.principal.uid,
      resourceType: "incident",
      resourceId: snapshot.id,
      result: "success",
      requestId: commandKey,
      metadata: { fromStatus: currentStatus, toStatus: input.nextStatus },
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(idempotencyRef, {
      command: "incident.transition",
      commandKey,
      incidentId: snapshot.id,
      actorUid: input.principal.uid,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (typeof incident.publicReference === "string") {
      transaction.set(database.collection("publicTracking").doc(incident.publicReference), safeTrackingProjection({ ...incident, status: input.nextStatus, events: [...(Array.isArray(incident.events) ? incident.events : []), event] }), { merge: true });
    }
    return { ...result, replayed: false };
  });
}

export async function listTrustedOperations(principal: CommandPrincipal) {
  requireOperationalPrincipal(principal);
  const database = getFirebaseFirestore();
  let query = database.collection("incidents").orderBy("createdAt", "desc").limit(100);
  if (principal.role !== "admin" && principal.organizationId) {
    query = database.collection("incidents").where("organizationId", "==", principal.organizationId).orderBy("createdAt", "desc").limit(100) as typeof query;
  }
  const snapshot = await query.get();
  return snapshot.docs.filter(doc => canAccessIncident(principal, doc.data())).map(doc => ({ id: doc.id, ...doc.data(), description: undefined, reporterPhone: undefined, reporterEmail: undefined, latitude: undefined, longitude: undefined }));
}

export async function upsertOrganizationMembership(input: {
  principal: CommandPrincipal;
  uid: unknown;
  organizationId: unknown;
  jurisdictionId?: unknown;
  role: unknown;
}) {
  if (input.principal.role !== "admin") {
    throw new CommandError("FORBIDDEN", "Only an authorized ECR administrator can manage memberships.");
  }
  const uid = optionalText(input.uid, 128, "uid");
  const organizationId = optionalText(input.organizationId, 128, "organizationId");
  const jurisdictionId = optionalText(input.jurisdictionId, 128, "jurisdictionId");
  if (!uid || !organizationId) {
    throw new CommandError("INVALID_ARGUMENT", "A user and organization are required.");
  }
  if (!operationalRoles.has(input.role as InstitutionalRole) || input.role === "admin") {
    throw new CommandError("INVALID_ARGUMENT", "Membership role must be dispatcher, coordinator, or responder.");
  }
  const role = input.role as Exclude<InstitutionalRole, "admin">;
  const database = getFirebaseFirestore();
  const membershipId = createHash("sha256").update(`${uid}:${organizationId}`).digest("hex").slice(0, 40);
  const membershipRef = database.collection("organizationMemberships").doc(membershipId);
  const result = { id: membershipId, uid, organizationId, jurisdictionId, role, active: true };
  await database.runTransaction(async transaction => {
    transaction.set(membershipRef, {
      ...result,
      approvedBy: input.principal.uid,
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.create(database.collection("auditEvents").doc(), {
      action: "membership.upserted",
      actorUid: input.principal.uid,
      resourceType: "organizationMembership",
      resourceId: membershipId,
      result: "success",
      metadata: { uid, organizationId, jurisdictionId, role },
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return result;
}
