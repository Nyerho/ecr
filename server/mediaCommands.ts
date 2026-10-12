import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseFirestore } from "./_core/firebaseAdmin";
import { CommandError, type CommandPrincipal } from "./trustedIncidentCommands";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedKinds = new Set(["scene", "missing_person"]);

function requireAccess(principal: CommandPrincipal, incident: Record<string, unknown>) {
  if (principal.role === "admin" || incident.reporterUid === principal.uid) return;
  if (principal.memberships.some(membership => membership.organizationId === incident.organizationId)) return;
  throw new CommandError("FORBIDDEN", "This incident is outside your media access scope.");
}

function requiredText(value: unknown, field: string, max: number) {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max) {
    throw new CommandError("INVALID_ARGUMENT", `${field} is invalid.`);
  }
  return value.trim();
}

export async function createTrustedMediaIntent(input: {
  principal: CommandPrincipal;
  incidentId: string;
  commandKey: unknown;
  kind: unknown;
  mimeType: unknown;
  byteSize: unknown;
  originalName?: unknown;
}) {
  const incidentId = requiredText(input.incidentId, "incidentId", 128);
  const commandKey = requiredText(input.commandKey, "commandKey", 96);
  const kind = requiredText(input.kind, "kind", 32);
  const mimeType = requiredText(input.mimeType, "mimeType", 80).toLowerCase();
  const originalName = typeof input.originalName === "string" ? input.originalName.trim().slice(0, 160) : null;
  if (!allowedKinds.has(kind) || !allowedMimeTypes.has(mimeType)) {
    throw new CommandError("INVALID_ARGUMENT", "Only scene or missing-person JPEG, PNG, and WebP media is supported.");
  }
  if (!Number.isInteger(input.byteSize) || Number(input.byteSize) < 1 || Number(input.byteSize) > 8 * 1024 * 1024) {
    throw new CommandError("INVALID_ARGUMENT", "Media must be between 1 byte and 8 MB.");
  }
  const database = getFirebaseFirestore();
  const idempotencyRef = database.collection("idempotencyKeys").doc(`media-${input.principal.uid}-${commandKey}`);
  const incidentRef = database.collection("incidents").doc(incidentId);
  const mediaRef = database.collection("incidentMedia").doc();
  return database.runTransaction(async transaction => {
    const previous = await transaction.get(idempotencyRef);
    if (previous.exists) return { replayed: true, ...(previous.data()?.result as Record<string, unknown>) };
    const incidentSnapshot = await transaction.get(incidentRef);
    if (!incidentSnapshot.exists) throw new CommandError("NOT_FOUND", "Incident not found.");
    const incident = incidentSnapshot.data() ?? {};
    requireAccess(input.principal, incident);
    const result = { id: mediaRef.id, incidentId, status: "pending_upload", storagePath: `private/incidents/${incidentId}/${mediaRef.id}`, mimeType, byteSize: Number(input.byteSize), kind };
    transaction.create(mediaRef, { ...result, originalName, uploadedAt: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.create(idempotencyRef, { command: "incident.media_intent", commandKey, incidentId, actorUid: input.principal.uid, result, createdAt: FieldValue.serverTimestamp() });
    transaction.create(database.collection("auditEvents").doc(), { action: "incident.media_intent_created", actorUid: input.principal.uid, resourceType: "incidentMedia", resourceId: mediaRef.id, result: "success", metadata: { incidentId, kind, mimeType, byteSize: Number(input.byteSize) }, createdAt: FieldValue.serverTimestamp() });
    return { ...result, replayed: false };
  });
}

export async function listTrustedIncidentMedia(principal: CommandPrincipal, incidentId: string) {
  const database = getFirebaseFirestore();
  const incidentSnapshot = await database.collection("incidents").doc(requiredText(incidentId, "incidentId", 128)).get();
  if (!incidentSnapshot.exists) throw new CommandError("NOT_FOUND", "Incident not found.");
  requireAccess(principal, incidentSnapshot.data() ?? {});
  const snapshot = await database.collection("incidentMedia").where("incidentId", "==", incidentSnapshot.id).limit(20).get();
  await database.collection("auditEvents").add({ action: "sensitive_read.incident_media", actorUid: principal.uid, resourceType: "incident", resourceId: incidentSnapshot.id, result: "success", metadata: { returnedCount: snapshot.size }, createdAt: FieldValue.serverTimestamp() });
  return snapshot.docs.map(document => { const data = document.data(); return { id: document.id, incidentId: data.incidentId, status: data.status, mimeType: data.mimeType, byteSize: data.byteSize, kind: data.kind, createdAt: data.createdAt ?? null }; });
}
