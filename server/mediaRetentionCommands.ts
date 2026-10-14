import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { getFirebaseFirestore } from "./_core/firebaseAdmin";
import { ENV } from "./_core/env";
import { deletePrivateMediaObject, isPrivateMediaConfigured } from "./privateMediaStorage";
import { CommandError, type CommandPrincipal } from "./trustedIncidentCommands";

function requireAdmin(principal: CommandPrincipal) {
  if (principal.role !== "admin") throw new CommandError("FORBIDDEN", "Only an ECR administrator can manage private-media retention.");
}

export async function processPrivateMediaRetention(principal: CommandPrincipal, execute = false) {
  requireAdmin(principal);
  const database = getFirebaseFirestore();
  const now = Date.now();
  const cutoffs = {
    pending_upload: Timestamp.fromMillis(now - Number(process.env.ECR_RETENTION_DRAFT_DAYS ?? 30) * 86_400_000),
    rejected: Timestamp.fromMillis(now - Number(process.env.ECR_RETENTION_NOTIFICATION_DAYS ?? 30) * 86_400_000),
    scan_failed: Timestamp.fromMillis(now - Number(process.env.ECR_RETENTION_NOTIFICATION_DAYS ?? 30) * 86_400_000),
  } as const;
  const candidates: Array<{ id: string; data: DocumentData; reason: string }> = [];
  for (const [status, cutoff] of Object.entries(cutoffs)) {
    const snapshot = await database.collection("incidentMedia").where("status", "==", status).where("updatedAt", "<", cutoff).limit(200).get();
    snapshot.docs.forEach(document => candidates.push({ id: document.id, data: document.data(), reason: `${status}_expired` }));
  }
  if (!execute || !ENV.mediaDeletionEnabled) {
    return { mode: "preview", deletionEnabled: ENV.mediaDeletionEnabled, candidateCount: candidates.length, candidates: candidates.map(candidate => ({ id: candidate.id, status: candidate.data.status, reason: candidate.reason })), note: "No objects or Firestore records were deleted." };
  }
  if (!isPrivateMediaConfigured()) throw new CommandError("UNAVAILABLE", "Private media storage is not configured.");
  let deleted = 0;
  for (const candidate of candidates) {
    if (typeof candidate.data.storagePath === "string") await deletePrivateMediaObject(candidate.data.storagePath);
    await database.collection("incidentMedia").doc(candidate.id).delete();
    await database.collection("auditEvents").add({ action: "incident.media_retention_deleted", actorUid: principal.uid, resourceType: "incidentMedia", resourceId: candidate.id, result: "success", metadata: { reason: candidate.reason }, createdAt: FieldValue.serverTimestamp() });
    deleted += 1;
  }
  return { mode: "execute", deletionEnabled: true, candidateCount: candidates.length, deletedCount: deleted };
}
