import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, agencyNotifications, auditLogs, idempotencyKeys, incidentEvents, incidents, organizations, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { randomBytes } from "node:crypto";
import { buildAgencyNotificationPayload, selectNearestAgency } from "./agencyDispatch";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  } else {
    values.lastSignedIn = new Date();
    updateSet.lastSignedIn = values.lastSignedIn;
  }

  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

function publicReference() {
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `ECR-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

function jsonText(value: Record<string, string | number | boolean | null> | undefined) {
  return JSON.stringify(value ?? {});
}

export type CreateIncidentInput = {
  reporterUserId: number;
  category: "medical" | "fire" | "security" | "road_accident" | "disaster" | "rescue" | "missing_person" | "other";
  description: string;
  structuredAnswers?: Record<string, string | number | boolean | null>;
  latitude?: string;
  longitude?: string;
  locationLabel?: string;
  locationSource?: "device" | "manual" | "operator" | "unknown";
  reporterPhone?: string;
  reporterEmail?: string;
  commandKey: string;
};

export async function createIncident(input: CreateIncidentInput) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  return db.transaction(async tx => {
    const existingKey = await tx
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.userId, input.reporterUserId), eq(idempotencyKeys.commandKey, input.commandKey)))
      .limit(1);

    if (existingKey[0]?.incidentId) {
      const existing = await tx.select().from(incidents).where(eq(incidents.id, existingKey[0].incidentId)).limit(1);
      if (existing[0]) return existing[0];
    }

    const reference = publicReference();
    const inserted = await tx.insert(incidents).values({
      publicReference: reference,
      reporterUserId: input.reporterUserId,
      category: input.category,
      description: input.description,
      structuredAnswers: jsonText(input.structuredAnswers),
      latitude: input.latitude,
      longitude: input.longitude,
      locationLabel: input.locationLabel,
      locationSource: input.locationSource ?? "manual",
      reporterPhone: input.reporterPhone,
      reporterEmail: input.reporterEmail,
    });

    const incidentId = Number(inserted[0].insertId);
    await tx.insert(idempotencyKeys).values({
      userId: input.reporterUserId,
      commandKey: input.commandKey,
      incidentId,
    });
    await tx.insert(incidentEvents).values({
      incidentId,
      actorUserId: input.reporterUserId,
      eventType: "created",
      toStatus: "submitted",
      metadata: JSON.stringify({ channel: "web" }),
    });
    await tx.insert(auditLogs).values({
      actorUserId: input.reporterUserId,
      action: "incident.created",
      resourceType: "incident",
      resourceId: String(incidentId),
      metadata: JSON.stringify({ category: input.category, channel: "web" }),
    });

    const created = await tx.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
    if (!created[0]) throw new Error("Incident creation failed");
    return created[0];
  });
}

export async function listCitizenIncidents(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(incidents).where(eq(incidents.reporterUserId, userId)).orderBy(desc(incidents.createdAt)).limit(50);
}

export async function listOperationsIncidents() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(incidents).orderBy(desc(incidents.createdAt)).limit(100);
}

export async function listAgencyNotifications() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db
    .select({
      id: agencyNotifications.id,
      incidentId: agencyNotifications.incidentId,
      publicReference: incidents.publicReference,
      organizationId: agencyNotifications.organizationId,
      organizationName: organizations.name,
      channel: agencyNotifications.channel,
      deliveryStatus: agencyNotifications.deliveryStatus,
      deliveryProvider: agencyNotifications.deliveryProvider,
      destination: agencyNotifications.destination,
      createdAt: agencyNotifications.createdAt,
      sentAt: agencyNotifications.sentAt,
    })
    .from(agencyNotifications)
    .leftJoin(incidents, eq(agencyNotifications.incidentId, incidents.id))
    .leftJoin(organizations, eq(agencyNotifications.organizationId, organizations.id))
    .orderBy(desc(agencyNotifications.createdAt))
    .limit(100);
}

export async function listOrganizations() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(organizations).orderBy(organizations.name).limit(200);
}

export async function createOrganization(input: {
  actorUserId: number;
  name: string;
  type: "dispatch" | "police" | "fire" | "medical" | "disaster" | "community" | "other";
  code: string;
  latitude?: string;
  longitude?: string;
  contactPhone?: string;
  contactEmail?: string;
  serviceAreaGeoJson?: string;
  isVerified?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { actorUserId, ...organization } = input;
  const inserted = await db.insert(organizations).values(organization);
  const id = Number(inserted[0].insertId);
  await db.insert(auditLogs).values({ actorUserId, action: "agency.created", resourceType: "organization", resourceId: String(id), metadata: JSON.stringify({ code: organization.code, name: organization.name }) });
  const result = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return result[0];
}

export async function updateOrganization(input: {
  actorUserId: number;
  id: number;
  name?: string;
  type?: "dispatch" | "police" | "fire" | "medical" | "disaster" | "community" | "other";
  code?: string;
  latitude?: string | null;
  longitude?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  serviceAreaGeoJson?: string | null;
  isVerified?: boolean;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { actorUserId, id, ...changes } = input;
  await db.update(organizations).set(changes).where(eq(organizations.id, id));
  await db.insert(auditLogs).values({ actorUserId, action: "agency.updated", resourceType: "organization", resourceId: String(id), metadata: JSON.stringify({ changedFields: Object.keys(changes) }) });
  const result = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return result[0];
}

export async function acknowledgeAgencyNotification(notificationId: number, actorUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const notification = await db.select().from(agencyNotifications).where(eq(agencyNotifications.id, notificationId)).limit(1);
  if (!notification[0]) throw new Error("Notification not found");
  await db.update(agencyNotifications).set({ deliveryStatus: "acknowledged", sentAt: notification[0].sentAt ?? new Date(), attempts: notification[0].attempts + 1 }).where(eq(agencyNotifications.id, notificationId));
  await db.insert(auditLogs).values({
    actorUserId,
    action: "agency.notification.acknowledged",
    resourceType: "agency_notification",
    resourceId: String(notificationId),
    metadata: JSON.stringify({ incidentId: notification[0].incidentId, organizationId: notification[0].organizationId }),
  });
  const result = await db.select().from(agencyNotifications).where(eq(agencyNotifications.id, notificationId)).limit(1);
  return result[0];
}

export async function getIncidentForUser(incidentId: number, userId: number, isOperator: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const whereClause = isOperator
    ? eq(incidents.id, incidentId)
    : and(eq(incidents.id, incidentId), eq(incidents.reporterUserId, userId));
  const incident = await db.select().from(incidents).where(whereClause).limit(1);
  if (!incident[0]) return null;
  const events = await db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, incidentId)).orderBy(incidentEvents.createdAt);
  return { incident: incident[0], events };
}

export async function updateIncident(input: {
  incidentId: number;
  actorUserId: number;
  status?: "submitted" | "received" | "triaged" | "assigned" | "responding" | "arrived" | "resolved" | "cancelled" | "duplicate" | "unable_to_verify" | "escalated" | "closed";
  priority?: "critical" | "high" | "medium" | "low";
  assignedOrganizationId?: number | null;
  assignedResponderId?: number | null;
  note?: string;
  expectedVersion?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  return db.transaction(async tx => {
    const current = await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1);
    if (!current[0]) throw new Error("Incident not found");
    if (input.expectedVersion !== undefined && current[0].version !== input.expectedVersion) {
      throw new Error("Incident changed; refresh before updating");
    }

    const nextStatus = input.status ?? current[0].status;
    const nextPriority = input.priority ?? current[0].priority;
    const changedStatus = nextStatus !== current[0].status;
    const changedAssignment = input.assignedOrganizationId !== undefined || input.assignedResponderId !== undefined;

    await tx.update(incidents).set({
      status: nextStatus,
      priority: nextPriority,
      assignedOrganizationId: input.assignedOrganizationId === undefined ? current[0].assignedOrganizationId : input.assignedOrganizationId,
      assignedResponderId: input.assignedResponderId === undefined ? current[0].assignedResponderId : input.assignedResponderId,
      version: current[0].version + 1,
      resolvedAt: ["resolved", "closed"].includes(nextStatus) ? new Date() : current[0].resolvedAt,
    }).where(and(eq(incidents.id, input.incidentId), eq(incidents.version, current[0].version)));

    if (changedStatus || changedAssignment || input.note) {
      await tx.insert(incidentEvents).values({
        incidentId: input.incidentId,
        actorUserId: input.actorUserId,
        eventType: changedAssignment ? "assigned" : changedStatus ? "status_changed" : "note",
        fromStatus: current[0].status,
        toStatus: nextStatus,
        note: input.note,
        metadata: JSON.stringify({ priority: nextPriority }),
      });
    }

    if (current[0].status !== "received" && nextStatus === "received") {
      const agencies = await tx.select().from(organizations);
      const selectedAgencyId = input.assignedOrganizationId === undefined ? current[0].assignedOrganizationId : input.assignedOrganizationId;
      const selectedAgency = selectedAgencyId ? agencies.find(agency => agency.id === selectedAgencyId) : undefined;
      const nearestAgency = selectedAgency ?? selectNearestAgency(current[0], agencies);
      if (nearestAgency) {
        const payload = buildAgencyNotificationPayload(current[0]);
        await tx.insert(agencyNotifications).values({
          incidentId: current[0].id,
          organizationId: nearestAgency.id,
          channel: "in_app",
          deliveryStatus: "queued",
          deliveryProvider: "pending_connector",
          destination: nearestAgency.name,
          payload: JSON.stringify(payload),
        });
        await tx.insert(auditLogs).values({
          actorUserId: input.actorUserId,
          action: "agency.notification.queued",
          resourceType: "incident",
          resourceId: String(input.incidentId),
          metadata: JSON.stringify({ organizationId: nearestAgency.id, organizationName: nearestAgency.name, channel: "in_app", deliveryProvider: "pending_connector" }),
        });
      }
    }

    await tx.insert(auditLogs).values({
      actorUserId: input.actorUserId,
      action: "incident.updated",
      resourceType: "incident",
      resourceId: String(input.incidentId),
      metadata: JSON.stringify({
        fromStatus: current[0].status,
        toStatus: nextStatus,
        priority: nextPriority,
        changedAssignment,
      }),
    });

    const updated = await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).limit(1);
    return updated[0];
  });
}
