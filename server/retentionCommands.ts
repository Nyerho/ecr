import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseFirestore } from "./_core/firebaseAdmin";
import type { CommandPrincipal } from "./trustedIncidentCommands";
import { CommandError } from "./trustedIncidentCommands";

export type RetentionPolicy = {
  incidentDays: number;
  auditDays: number;
  notificationDays: number;
  draftDays: number;
};

export function getRetentionPolicy(): RetentionPolicy {
  const readDays = (name: string, fallback: number) => {
    const value = Number(process.env[name] ?? fallback);
    return Number.isInteger(value) && value >= 1 && value <= 3650 ? value : fallback;
  };
  return {
    incidentDays: readDays("ECR_RETENTION_INCIDENT_DAYS", 365),
    auditDays: readDays("ECR_RETENTION_AUDIT_DAYS", 730),
    notificationDays: readDays("ECR_RETENTION_NOTIFICATION_DAYS", 30),
    draftDays: readDays("ECR_RETENTION_DRAFT_DAYS", 30),
  };
}

export async function previewRetention(principal: CommandPrincipal) {
  if (principal.role !== "admin") {
    throw new CommandError("FORBIDDEN", "Only an ECR administrator can preview retention work.");
  }
  const database = getFirebaseFirestore();
  const policy = getRetentionPolicy();
  const now = Date.now();
  const collections = [
    ["incidents", policy.incidentDays],
    ["auditEvents", policy.auditDays],
    ["notificationDeliveries", policy.notificationDays],
    ["notificationDeadLetters", policy.notificationDays],
  ] as const;
  const results = await Promise.all(collections.map(async ([collection, days]) => {
    const cutoff = Timestamp.fromMillis(now - days * 86_400_000);
    const snapshot = await database.collection(collection).where("createdAt", "<", cutoff).limit(500).get();
    return { collection, retentionDays: days, eligibleCount: snapshot.size, capped: snapshot.size === 500 };
  }));
  return {
    mode: "preview",
    deletionEnabled: false,
    generatedAt: new Date(now).toISOString(),
    policy,
    collections: results,
    note: "No records were deleted. A reviewed retention job and approved legal policy are required before deletion is enabled.",
  };
}
