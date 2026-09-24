import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const jurisdictions = mysqlTable("jurisdictions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  level: mysqlEnum("level", ["national", "state", "lga", "community"]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  jurisdictionId: int("jurisdictionId").references(() => jurisdictions.id),
  name: varchar("name", { length: 180 }).notNull(),
  type: mysqlEnum("type", [
    "dispatch",
    "police",
    "fire",
    "medical",
    "disaster",
    "community",
    "other",
  ]).notNull(),
  code: varchar("code", { length: 48 }).notNull().unique(),
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  serviceAreaGeoJson: text("serviceAreaGeoJson"),
  isVerified: boolean("isVerified").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const organizationMemberships = mysqlTable(
  "organizationMemberships",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    organizationId: int("organizationId").notNull().references(() => organizations.id),
    membershipRole: mysqlEnum("membershipRole", ["dispatcher", "coordinator", "responder", "community_responder"]).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    userOrgIdx: uniqueIndex("membership_user_org_idx").on(table.userId, table.organizationId),
    userActiveIdx: index("membership_user_active_idx").on(table.userId, table.isActive),
  }),
);

export const incidents = mysqlTable(
  "incidents",
  {
    id: int("id").autoincrement().primaryKey(),
    publicReference: varchar("publicReference", { length: 32 }).notNull().unique(),
    reporterUserId: int("reporterUserId").notNull().references(() => users.id),
    category: mysqlEnum("category", [
      "medical",
      "fire",
      "security",
      "road_accident",
      "disaster",
      "rescue",
      "missing_person",
      "other",
    ]).notNull(),
    status: mysqlEnum("status", [
      "submitted",
      "received",
      "triaged",
      "assigned",
      "responding",
      "arrived",
      "resolved",
      "cancelled",
      "duplicate",
      "unable_to_verify",
      "escalated",
      "closed",
    ]).default("submitted").notNull(),
    priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).default("medium").notNull(),
    description: text("description").notNull(),
    structuredAnswers: text("structuredAnswers").notNull(),
    latitude: varchar("latitude", { length: 32 }),
    longitude: varchar("longitude", { length: 32 }),
    locationLabel: varchar("locationLabel", { length: 220 }),
    locationSource: mysqlEnum("locationSource", ["device", "manual", "operator", "unknown"]).default("manual").notNull(),
    reporterPhone: varchar("reporterPhone", { length: 32 }),
    reporterEmail: varchar("reporterEmail", { length: 320 }),
    assignedOrganizationId: int("assignedOrganizationId").references(() => organizations.id),
    assignedResponderId: int("assignedResponderId").references(() => users.id),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    resolvedAt: timestamp("resolvedAt"),
  },
  table => ({
    statusQueueIdx: index("incident_status_queue_idx").on(table.status, table.priority, table.createdAt),
    reporterIdx: index("incident_reporter_idx").on(table.reporterUserId, table.createdAt),
    assignedOrgIdx: index("incident_assigned_org_idx").on(table.assignedOrganizationId, table.status),
  }),
);

export const incidentEvents = mysqlTable(
  "incidentEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    incidentId: int("incidentId").notNull().references(() => incidents.id),
    actorUserId: int("actorUserId").references(() => users.id),
    eventType: mysqlEnum("eventType", [
      "created",
      "received",
      "triaged",
      "routed",
      "assigned",
      "status_changed",
      "note",
      "closed",
    ]).notNull(),
    fromStatus: varchar("fromStatus", { length: 40 }),
    toStatus: varchar("toStatus", { length: 40 }),
    note: text("note"),
    metadata: text("metadata").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
      incidentTimelineIdx: index("incident_timeline_idx").on(table.incidentId, table.createdAt),
  }),
);

export const agencyNotifications = mysqlTable(
  "agencyNotifications",
  {
    id: int("id").autoincrement().primaryKey(),
    incidentId: int("incidentId").notNull().references(() => incidents.id),
    organizationId: int("organizationId").notNull().references(() => organizations.id),
    channel: mysqlEnum("channel", ["in_app", "sms", "voice", "webhook"]).default("in_app").notNull(),
    deliveryStatus: mysqlEnum("deliveryStatus", ["queued", "sent", "failed", "acknowledged"]).default("queued").notNull(),
    deliveryProvider: varchar("deliveryProvider", { length: 64 }).default("pending_connector"),
    destination: varchar("destination", { length: 220 }).notNull(),
    payload: text("payload").notNull(),
    attempts: int("attempts").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    sentAt: timestamp("sentAt"),
  },
  table => ({
    incidentNotificationIdx: index("agency_notification_incident_idx").on(table.incidentId, table.createdAt),
    organizationNotificationIdx: index("agency_notification_org_idx").on(table.organizationId, table.deliveryStatus, table.createdAt),
    uniqueIncidentAgencyChannel: uniqueIndex("agency_notification_unique_idx").on(table.incidentId, table.organizationId, table.channel),
  }),
);

export const auditLogs = mysqlTable(
  "auditLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorUserId: int("actorUserId").references(() => users.id),
    action: varchar("action", { length: 96 }).notNull(),
    resourceType: varchar("resourceType", { length: 64 }).notNull(),
    resourceId: varchar("resourceId", { length: 64 }),
    requestId: varchar("requestId", { length: 96 }),
    metadata: text("metadata").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    resourceIdx: index("audit_resource_idx").on(table.resourceType, table.resourceId, table.createdAt),
    actorIdx: index("audit_actor_idx").on(table.actorUserId, table.createdAt),
  }),
);

export const idempotencyKeys = mysqlTable(
  "idempotencyKeys",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    commandKey: varchar("commandKey", { length: 96 }).notNull(),
    incidentId: int("incidentId").references(() => incidents.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    userCommandIdx: uniqueIndex("idempotency_user_command_idx").on(table.userId, table.commandKey),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Incident = typeof incidents.$inferSelect;
export type IncidentEvent = typeof incidentEvents.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
