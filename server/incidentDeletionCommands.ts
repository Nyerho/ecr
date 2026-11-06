import { createHash } from "node:crypto";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { getFirebaseFirestore } from "./_core/firebaseAdmin";
import { deletePrivateMediaObject, isPrivateMediaConfigured } from "./privateMediaStorage";
import { CommandError, type CommandPrincipal } from "./trustedIncidentCommands";

const DELETE_BATCH_SIZE = 400;
const MAX_BATCHES_PER_COLLECTION = 25;
const MAX_MEDIA_PER_DELETE = 1000;

function requireIncidentId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new CommandError("INVALID_ARGUMENT", "A valid incident ID is required.");
  }
  return value;
}

async function deleteReferences(database: Firestore, references: DocumentReference[]) {
  for (let offset = 0; offset < references.length; offset += DELETE_BATCH_SIZE) {
    const batch = database.batch();
    references.slice(offset, offset + DELETE_BATCH_SIZE).forEach(reference => batch.delete(reference));
    await batch.commit();
  }
}

async function deleteRelatedDocuments(database: Firestore, collection: string, field: string, value: string) {
  for (let index = 0; index < MAX_BATCHES_PER_COLLECTION; index += 1) {
    const snapshot = await database.collection(collection).where(field, "==", value).limit(DELETE_BATCH_SIZE).get();
    if (snapshot.docs.length === 0) return;
    await deleteReferences(database, snapshot.docs.map(document => document.ref));
  }
  // Keep the incident and its deletion marker so a retry can continue safely.
  throw new CommandError("UNAVAILABLE", "Report cleanup is still in progress. Retry deletion to finish removing it.");
}

/**
 * Object storage and Firestore cannot commit together. A durable deletion
 * marker blocks new work; failed cleanup keeps the incident and remaining
 * metadata available for an owner-authorized retry instead of claiming success.
 */
export async function deleteOwnedIncident(principal: CommandPrincipal, requestedId: unknown) {
  const incidentId = requireIncidentId(requestedId);
  const database = getFirebaseFirestore();
  const incidentRef = database.collection("incidents").doc(incidentId);
  const auditId = createHash("sha256").update(`incident.deleted:${principal.uid}:${incidentId}`).digest("hex");
  const auditRef = database.collection("auditEvents").doc(auditId);

  const plan = await database.runTransaction(async transaction => {
    const snapshot = await transaction.get(incidentRef);
    if (!snapshot.exists) return null;
    const incident = snapshot.data() ?? {};
    let trackingToMark: DocumentReference | null = null;
    if (incident.reporterUid !== principal.uid) {
      throw new CommandError("FORBIDDEN", "You can only delete your own reports.");
    }
    const publicReference = typeof incident.publicReference === "string" ? incident.publicReference : null;
    if (publicReference && !/^ECR-[A-Za-z0-9-]{1,96}$/.test(publicReference)) {
      throw new CommandError("CONFLICT", "The report reference needs review before deletion.");
    }
    const mediaSnapshot = await transaction.get(database.collection("incidentMedia").where("incidentId", "==", incidentId).limit(MAX_MEDIA_PER_DELETE + 1));
    if (mediaSnapshot.docs.length > MAX_MEDIA_PER_DELETE) {
      throw new CommandError("CONFLICT", "This report has too many attachments for self-service deletion. Contact support.");
    }
    const media = mediaSnapshot.docs.map(document => {
      const storagePath = document.data().storagePath;
      if (typeof storagePath !== "string" || !storagePath.startsWith(`private/incidents/${incidentId}/`)
        || storagePath.split("/").some(part => !part || part === "." || part === "..")) {
        throw new CommandError("CONFLICT", "An attachment storage path needs review before deletion.");
      }
      return { reference: document.ref, storagePath };
    });
    if (media.length && !isPrivateMediaConfigured()) {
      throw new CommandError("UNAVAILABLE", "Private media storage is unavailable. The report has not been deleted.");
    }
    if (publicReference) {
      const matchingIncidents = await transaction.get(database.collection("incidents").where("publicReference", "==", publicReference).limit(2));
      if (matchingIncidents.docs.some(document => document.id !== incidentId)) {
        throw new CommandError("CONFLICT", "This report reference is shared with another record and needs review before deletion.");
      }
      const tracking = await transaction.get(database.collection("publicTracking").doc(publicReference));
      if (tracking.exists) {
        const trackingOwner = tracking.data()?.ownerUid;
        if (trackingOwner !== undefined && trackingOwner !== principal.uid) {
          throw new CommandError("CONFLICT", "The public tracking record belongs to another report.");
        }
        // Legacy projections may omit ownerUid. The unique incident-reference
        // check above ties them to the already verified report owner.
        trackingToMark = tracking.ref;
      }
    }
    if (incident.deletionPending !== true) {
      transaction.update(incidentRef, {
        deletionPending: true,
        deletionRequestedBy: principal.uid,
        deletionRequestedAt: FieldValue.serverTimestamp(),
      });
    }
    if (trackingToMark) transaction.update(trackingToMark, { deletionPending: true });
    return { publicReference, media };
  });

  // The same generic result for missing IDs makes retries idempotent without
  // exposing whether an unavailable incident ever belonged to another user.
  if (!plan) return { id: incidentId, deleted: true as const };

  try {
    // Keep metadata until every object deletion succeeds. S3 DeleteObject is
    // idempotent, so retrying a partially completed object cleanup is safe.
    for (const media of plan.media) await deletePrivateMediaObject(media.storagePath);
    await deleteReferences(database, plan.media.map(media => media.reference));
    for (const collection of ["assignments", "notificationDeliveries", "notificationDeadLetters"]) {
      await deleteRelatedDocuments(database, collection, "incidentId", incidentId);
    }
    if (plan.publicReference) await deleteRelatedDocuments(database, "chatMessages", "publicReference", plan.publicReference);

    await database.runTransaction(async transaction => {
      const current = await transaction.get(incidentRef);
      const existingAudit = await transaction.get(auditRef);
      const trackingRef = plan.publicReference ? database.collection("publicTracking").doc(plan.publicReference) : null;
      const tracking = trackingRef ? await transaction.get(trackingRef) : null;
      if (current.exists && current.data()?.reporterUid !== principal.uid) {
        throw new CommandError("FORBIDDEN", "You can only delete your own reports.");
      }
      if (tracking?.exists && tracking.data()?.ownerUid !== undefined && tracking.data()?.ownerUid !== principal.uid) {
        throw new CommandError("CONFLICT", "The public tracking record changed. Retry after its ownership is reviewed.");
      }
      if (trackingRef && tracking?.exists) transaction.delete(trackingRef);
      if (current.exists) transaction.delete(incidentRef);
      if (!existingAudit.exists) transaction.create(auditRef, {
        action: "incident.deleted",
        actorUid: principal.uid,
        resourceType: "incident",
        resourceId: incidentId,
        result: "success",
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof CommandError) throw error;
    throw new CommandError("UNAVAILABLE", "The report could not be fully deleted. Retry deletion to finish removing it.");
  }
  return { id: incidentId, deleted: true as const };
}
