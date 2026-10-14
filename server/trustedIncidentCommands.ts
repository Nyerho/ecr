import { createHash, randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAuth, getFirebaseFirestore } from "./_core/firebaseAdmin";
import { ENV } from "./_core/env";

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
    const principal = await principalFromToken(token);
    const hasSecondFactor = typeof token.firebase?.sign_in_second_factor === "string";
    if (ENV.requireMfaForInstitutional && operationalRoles.has(principal.role as InstitutionalRole) && !hasSecondFactor) {
      throw new CommandError("FORBIDDEN", "Multi-factor authentication is required for institutional operations.");
    }
    return principal;
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

export async function assignTrustedIncident(input: {
  principal: CommandPrincipal;
  incidentId: string;
  responderUid: unknown;
  organizationId: unknown;
  commandKey: unknown;
  note?: unknown;
}) {
  requireOperationalPrincipal(input.principal);
  const responderUid = optionalText(input.responderUid, 128, "responderUid");
  const organizationId = optionalText(input.organizationId, 128, "organizationId");
  const commandKey = requireCommandKey(input.commandKey);
  const note = optionalText(input.note, 500, "note");
  if (!responderUid || !organizationId) throw new CommandError("INVALID_ARGUMENT", "A responder and organization are required.");
  if (input.principal.role !== "admin" && !input.principal.memberships.some(membership => membership.organizationId === organizationId)) {
    throw new CommandError("FORBIDDEN", "You cannot assign work outside your organization.");
  }
  const database = getFirebaseFirestore();
  const incidentRef = database.collection("incidents").doc(input.incidentId);
  const assignmentRef = database.collection("assignments").doc();
  const idempotencyRef = database.collection("idempotencyKeys").doc(idempotencyDocumentId(input.principal.uid, commandKey));
  const responderMemberships = await database.collection("organizationMemberships").where("uid", "==", responderUid).limit(50).get();
  const responderIsActive = responderMemberships.docs.some(snapshot => {
    const membership = snapshot.data();
    return membership.active === true && membership.organizationId === organizationId && membership.role === "responder";
  });
  if (!responderIsActive) throw new CommandError("FORBIDDEN", "The responder is not active in the selected organization.");

  return database.runTransaction(async transaction => {
    const existingCommand = await transaction.get(idempotencyRef);
    if (existingCommand.exists) return { replayed: true, ...(existingCommand.data()?.result as Record<string, unknown>) };
    const snapshot = await transaction.get(incidentRef);
    if (!snapshot.exists) throw new CommandError("NOT_FOUND", "Incident not found.");
    const incident = snapshot.data() ?? {};
    if (!canAccessIncident(input.principal, incident)) throw new CommandError("FORBIDDEN", "This incident is outside your assignment scope.");
    if (!["received", "triaged", "escalated"].includes(String(incident.status))) {
      throw new CommandError("INVALID_ARGUMENT", "Only received, triaged, or escalated incidents can be assigned.");
    }
    const event = {
      label: "Responder assignment offered",
      actorUid: input.principal.uid,
      previousValue: incident.status,
      newValue: "assigned",
      createdAt: new Date().toISOString(),
    };
    const result = { id: assignmentRef.id, incidentId: snapshot.id, status: "offered", version: 1 };
    transaction.create(assignmentRef, {
      incidentId: snapshot.id,
      responderUid,
      organizationId,
      status: "offered",
      version: 1,
      note,
      offeredBy: input.principal.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(incidentRef, {
      assignedOrganizationId: organizationId,
      assignedResponderUid: responderUid,
      status: "assigned",
      version: Number(incident.version ?? 1) + 1,
      events: FieldValue.arrayUnion(event),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(database.collection("incidentEvents").doc(), {
      incidentId: snapshot.id,
      type: "assignment_offered",
      assignmentId: assignmentRef.id,
      responderUid,
      organizationId,
      actorUid: input.principal.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(database.collection("auditEvents").doc(), {
      action: "incident.assignment_offered",
      actorUid: input.principal.uid,
      resourceType: "assignment",
      resourceId: assignmentRef.id,
      result: "success",
      requestId: commandKey,
      metadata: { incidentId: snapshot.id, responderUid, organizationId },
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(database.collection("notificationDeliveries").doc(), {
      type: "assignment_offer",
      incidentId: snapshot.id,
      assignmentId: assignmentRef.id,
      recipientUid: responderUid,
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(idempotencyRef, {
      command: "incident.assign",
      commandKey,
      incidentId: snapshot.id,
      assignmentId: assignmentRef.id,
      actorUid: input.principal.uid,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (typeof incident.publicReference === "string") {
      transaction.set(database.collection("publicTracking").doc(incident.publicReference), safeTrackingProjection({ ...incident, status: "assigned", events: [...(Array.isArray(incident.events) ? incident.events : []), event] }), { merge: true });
    }
    return { ...result, replayed: false };
  });
}

export async function respondToTrustedAssignment(input: {
  principal: CommandPrincipal;
  assignmentId: string;
  decision: unknown;
  commandKey: unknown;
  note?: unknown;
}) {
  const decision = input.decision === "accept" || input.decision === "decline" ? input.decision : null;
  if (!decision) throw new CommandError("INVALID_ARGUMENT", "Assignment decision must be accept or decline.");
  const commandKey = requireCommandKey(input.commandKey);
  const note = optionalText(input.note, 500, "note");
  const database = getFirebaseFirestore();
  const assignmentRef = database.collection("assignments").doc(input.assignmentId);
  const idempotencyRef = database.collection("idempotencyKeys").doc(idempotencyDocumentId(input.principal.uid, commandKey));
  return database.runTransaction(async transaction => {
    const existingCommand = await transaction.get(idempotencyRef);
    if (existingCommand.exists) return { replayed: true, ...(existingCommand.data()?.result as Record<string, unknown>) };
    const assignmentSnapshot = await transaction.get(assignmentRef);
    if (!assignmentSnapshot.exists) throw new CommandError("NOT_FOUND", "Assignment not found.");
    const assignment = assignmentSnapshot.data() ?? {};
    if (assignment.responderUid !== input.principal.uid) throw new CommandError("FORBIDDEN", "This assignment belongs to another responder.");
    if (assignment.status !== "offered" || assignment.version !== 1) throw new CommandError("CONFLICT", "This assignment is no longer awaiting a response.");
    if (!input.principal.memberships.some(membership => membership.organizationId === assignment.organizationId && membership.role === "responder")) {
      throw new CommandError("FORBIDDEN", "You are not an active responder in this organization.");
    }
    const incidentRef = database.collection("incidents").doc(String(assignment.incidentId));
    const incidentSnapshot = await transaction.get(incidentRef);
    if (!incidentSnapshot.exists) throw new CommandError("NOT_FOUND", "Assigned incident not found.");
    const incident = incidentSnapshot.data() ?? {};
    const nextAssignmentStatus = decision === "accept" ? "accepted" : "declined";
    const nextIncidentStatus = decision === "accept" ? "responding" : "escalated";
    const event = {
      label: decision === "accept" ? "Responder accepted assignment" : "Responder declined assignment",
      actorUid: input.principal.uid,
      previousValue: "assigned",
      newValue: nextIncidentStatus,
      createdAt: new Date().toISOString(),
    };
    const result = { id: assignmentSnapshot.id, incidentId: incidentSnapshot.id, status: nextAssignmentStatus, version: 2 };
    transaction.update(assignmentRef, { status: nextAssignmentStatus, version: 2, decision, note, decidedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(incidentRef, { status: nextIncidentStatus, version: Number(incident.version ?? 1) + 1, events: FieldValue.arrayUnion(event), updatedAt: FieldValue.serverTimestamp() });
    transaction.create(database.collection("incidentEvents").doc(), { incidentId: incidentSnapshot.id, type: `assignment_${decision}ed`, assignmentId: assignmentSnapshot.id, actorUid: input.principal.uid, note, createdAt: FieldValue.serverTimestamp() });
    transaction.create(database.collection("auditEvents").doc(), { action: `incident.assignment_${decision}ed`, actorUid: input.principal.uid, resourceType: "assignment", resourceId: assignmentSnapshot.id, result: "success", requestId: commandKey, metadata: { incidentId: incidentSnapshot.id, decision }, createdAt: FieldValue.serverTimestamp() });
    transaction.create(idempotencyRef, { command: "assignment.respond", commandKey, assignmentId: assignmentSnapshot.id, actorUid: input.principal.uid, result, createdAt: FieldValue.serverTimestamp() });
    if (typeof incident.publicReference === "string") transaction.set(database.collection("publicTracking").doc(incident.publicReference), safeTrackingProjection({ ...incident, status: nextIncidentStatus, events: [...(Array.isArray(incident.events) ? incident.events : []), event] }), { merge: true });
    return { ...result, replayed: false };
  });
}

export async function expireStaleAssignments(principal: CommandPrincipal, staleAfterMinutes = 10) {
  requireOperationalPrincipal(principal);
  const database = getFirebaseFirestore();
  const cutoff = Date.now() - staleAfterMinutes * 60_000;
  const snapshot = await database.collection("assignments").where("status", "==", "offered").limit(100).get();
  let expired = 0;
  for (const assignmentSnapshot of snapshot.docs) {
    const assignment = assignmentSnapshot.data();
    const createdAt = assignment.createdAt?.toDate?.()?.getTime?.() ?? 0;
    if (!createdAt || createdAt > cutoff) continue;
    const incidentRef = database.collection("incidents").doc(String(assignment.incidentId));
    await database.runTransaction(async transaction => {
      const currentAssignment = await transaction.get(assignmentSnapshot.ref);
      if (!currentAssignment.exists || currentAssignment.data()?.status !== "offered") return;
      const incidentSnapshot = await transaction.get(incidentRef);
      const incident = incidentSnapshot.data() ?? {};
      transaction.update(assignmentSnapshot.ref, { status: "expired", version: 2, expiredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      if (incidentSnapshot.exists && incident.status === "assigned") {
        const event = { label: "Responder assignment expired", actorUid: principal.uid, previousValue: "assigned", newValue: "escalated", createdAt: new Date().toISOString() };
        transaction.update(incidentRef, { status: "escalated", version: Number(incident.version ?? 1) + 1, events: FieldValue.arrayUnion(event), updatedAt: FieldValue.serverTimestamp() });
        transaction.set(database.collection("publicTracking").doc(String(incident.publicReference)), safeTrackingProjection({ ...incident, status: "escalated", events: [...(Array.isArray(incident.events) ? incident.events : []), event] }), { merge: true });
      }
      transaction.create(database.collection("incidentEvents").doc(), { incidentId: assignment.incidentId, type: "assignment_expired", assignmentId: assignmentSnapshot.id, actorUid: principal.uid, createdAt: FieldValue.serverTimestamp() });
      transaction.create(database.collection("auditEvents").doc(), { action: "incident.assignment_expired", actorUid: principal.uid, resourceType: "assignment", resourceId: assignmentSnapshot.id, result: "success", createdAt: FieldValue.serverTimestamp() });
      transaction.create(database.collection("notificationDeliveries").doc(), { type: "assignment_escalated", incidentId: assignment.incidentId, assignmentId: assignmentSnapshot.id, recipientUid: assignment.offeredBy, status: "queued", attempts: 0, maxAttempts: 3, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      expired += 1;
    });
  }
  return { expired };
}

export async function recordNotificationDelivery(input: { principal: CommandPrincipal; deliveryId: string; status: unknown; errorMessage?: unknown }) {
  if (input.principal.role !== "admin") throw new CommandError("FORBIDDEN", "Only an ECR administrator can record delivery outcomes.");
  if (input.status !== "delivered" && input.status !== "failed") throw new CommandError("INVALID_ARGUMENT", "Delivery status must be delivered or failed.");
  const database = getFirebaseFirestore();
  const deliveryRef = database.collection("notificationDeliveries").doc(input.deliveryId);
  const deadLetterRef = database.collection("notificationDeadLetters").doc(input.deliveryId);
  return database.runTransaction(async transaction => {
    const snapshot = await transaction.get(deliveryRef);
    if (!snapshot.exists) throw new CommandError("NOT_FOUND", "Notification delivery not found.");
    const delivery = snapshot.data() ?? {};
    if (["delivered", "dead_letter"].includes(String(delivery.status))) return { status: delivery.status, attempts: delivery.attempts ?? 0, replayed: true };
    const attempts = Number(delivery.attempts ?? 0) + 1;
    if (input.status === "delivered") {
      transaction.update(deliveryRef, { status: "delivered", attempts, deliveredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return { status: "delivered", attempts, replayed: false };
    }
    const maxAttempts = Number(delivery.maxAttempts ?? 3);
    const deadLetter = attempts >= maxAttempts;
    transaction.update(deliveryRef, { status: deadLetter ? "dead_letter" : "queued", attempts, lastError: optionalText(input.errorMessage, 500, "errorMessage"), updatedAt: FieldValue.serverTimestamp() });
    if (deadLetter) transaction.create(deadLetterRef, { ...delivery, deliveryId: snapshot.id, attempts, reason: input.errorMessage ?? "delivery_failed", createdAt: FieldValue.serverTimestamp() });
    return { status: deadLetter ? "dead_letter" : "queued", attempts, replayed: false };
  });
}

export async function listTrustedOperations(principal: CommandPrincipal) {
  requireOperationalPrincipal(principal);
  await expireStaleAssignments(principal);
  const database = getFirebaseFirestore();
  let query = database.collection("incidents").orderBy("createdAt", "desc").limit(100);
  if (principal.role !== "admin" && principal.organizationId) {
    query = database.collection("incidents").where("organizationId", "==", principal.organizationId).orderBy("createdAt", "desc").limit(100) as typeof query;
  }
  const snapshot = await query.get();
  const incidents = snapshot.docs.filter(doc => canAccessIncident(principal, doc.data())).map(doc => ({ id: doc.id, ...doc.data(), description: undefined, reporterPhone: undefined, reporterEmail: undefined, latitude: undefined, longitude: undefined }));
  await database.collection("auditEvents").add({
    action: "sensitive_read.operations_queue",
    actorUid: principal.uid,
    resourceType: "operationsQueue",
    resourceId: principal.organizationId ?? "all",
    result: "success",
    metadata: { returnedCount: incidents.length, role: principal.role },
    createdAt: FieldValue.serverTimestamp(),
  });
  return incidents;
}

export async function exportTrustedOperations(principal: CommandPrincipal) {
  const incidents = await listTrustedOperations(principal);
  const database = getFirebaseFirestore();
  await database.collection("auditEvents").add({
    action: "sensitive_export.operations_queue",
    actorUid: principal.uid,
    resourceType: "operationsQueue",
    resourceId: principal.organizationId ?? "all",
    result: "success",
    metadata: { returnedCount: incidents.length, role: principal.role, format: "json" },
    createdAt: FieldValue.serverTimestamp(),
  });
  return incidents;
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
