import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ADMIN_UNLOCK_COOKIE, COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { createAdminUnlockToken, isAdminUnlocked, ADMIN_UNLOCK_TTL_MS, verifyAdminPassword } from "./_core/adminAuth";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createIncident,
  getIncidentForUser,
  acknowledgeAgencyNotification,
  createOrganization,
  listAgencyNotifications,
  listCitizenIncidents,
  listOrganizations,
  listOperationsIncidents,
  updateOrganization,
  updateIncident,
} from "./db";

const category = z.enum([
  "medical",
  "fire",
  "security",
  "road_accident",
  "disaster",
  "rescue",
  "missing_person",
  "other",
]);
const status = z.enum([
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
]);
const priority = z.enum(["critical", "high", "medium", "low"]);
const organizationType = z.enum(["dispatch", "police", "fire", "medical", "disaster", "community", "other"]);
const serviceArea = z.string().trim().max(50000).refine(value => {
  try {
    const parsed = JSON.parse(value) as { type?: string; coordinates?: unknown };
    return ["Polygon", "MultiPolygon"].includes(parsed.type ?? "") && parsed.coordinates !== undefined;
  } catch {
    return false;
  }
}, "Service area must be valid Polygon or MultiPolygon GeoJSON");
const safeDescription = z.string().trim().min(4).max(2000);
const coordinate = z.string().trim().refine(value => Number.isFinite(Number(value)), "Invalid coordinate");
const phone = z.string().trim().min(7).max(32).regex(/^[+0-9()\-\s]+$/, "Invalid phone number").optional();
const email = z.string().trim().email().max(320).optional();
const structuredAnswers = z.record(z.string(), z.union([z.string().max(300), z.number(), z.boolean(), z.null()]));

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Operations access is restricted to authorized personnel." });
  }
  if (!isAdminUnlocked(ctx.req, ctx.user.id)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Unlock the control center to continue." });
  }
  return next();
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(ADMIN_UNLOCK_COOKIE, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  admin: router({
    status: protectedProcedure.query(({ ctx }) => ({
      unlocked: ctx.user.role === "admin" && isAdminUnlocked(ctx.req, ctx.user.id),
    })),
    unlock: protectedProcedure
      .input(z.object({ password: z.string().min(1).max(128) }))
      .mutation(({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Operations access is restricted to authorized personnel." });
        }
        if (!verifyAdminPassword(input.password)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect control-center password." });
        }
        ctx.res.cookie(ADMIN_UNLOCK_COOKIE, createAdminUnlockToken(ctx.user.id), {
          ...getSessionCookieOptions(ctx.req),
          maxAge: ADMIN_UNLOCK_TTL_MS,
        });
        return { success: true } as const;
      }),
    lock: protectedProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(ADMIN_UNLOCK_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  incidents: router({
    listMine: protectedProcedure.query(({ ctx }) => listCitizenIncidents(ctx.user.id)),

    get: protectedProcedure
      .input(z.object({ incidentId: z.number().int().positive() }))
      .query(({ ctx, input }) => getIncidentForUser(input.incidentId, ctx.user.id, ctx.user.role === "admin" && isAdminUnlocked(ctx.req, ctx.user.id))),

    create: protectedProcedure
      .input(z.object({
        category,
        description: safeDescription,
        structuredAnswers: structuredAnswers.optional(),
        latitude: coordinate.optional(),
        longitude: coordinate.optional(),
        locationLabel: z.string().trim().max(220).optional(),
        locationSource: z.enum(["device", "manual", "operator", "unknown"]).default("manual"),
        reporterPhone: phone,
        reporterEmail: email,
        commandKey: z.string().regex(/^[A-Za-z0-9._:-]{8,96}$/, "Invalid command key"),
      }).refine(input => Boolean(input.reporterPhone || input.reporterEmail), "Add a phone number or email so responders can reach you."))
      .mutation(({ ctx, input }) => createIncident({ ...input, reporterUserId: ctx.user.id })),
  }),

  operations: router({
    list: adminProcedure.query(() => listOperationsIncidents()),
    notifications: adminProcedure.query(() => listAgencyNotifications()),
    organizations: adminProcedure.query(() => listOrganizations()),

    createOrganization: adminProcedure
      .input(z.object({
        name: z.string().trim().min(2).max(180),
        type: organizationType,
        code: z.string().trim().min(2).max(48).regex(/^[A-Za-z0-9_-]+$/),
        latitude: coordinate.optional(),
        longitude: coordinate.optional(),
        contactPhone: phone,
        contactEmail: email,
        serviceAreaGeoJson: serviceArea.optional(),
        isVerified: z.boolean().default(false),
      }))
      .mutation(({ ctx, input }) => createOrganization({ ...input, actorUserId: ctx.user.id, serviceAreaGeoJson: input.serviceAreaGeoJson || undefined })),

    updateOrganization: adminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(2).max(180).optional(),
        type: organizationType.optional(),
        code: z.string().trim().min(2).max(48).regex(/^[A-Za-z0-9_-]+$/).optional(),
        latitude: coordinate.nullable().optional(),
        longitude: coordinate.nullable().optional(),
        contactPhone: phone.nullable().optional(),
        contactEmail: email.nullable().optional(),
        serviceAreaGeoJson: serviceArea.nullable().optional(),
        isVerified: z.boolean().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(({ ctx, input }) => updateOrganization({ ...input, actorUserId: ctx.user.id })),

    acknowledgeNotification: adminProcedure
      .input(z.object({ notificationId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => acknowledgeAgencyNotification(input.notificationId, ctx.user.id)),

    update: adminProcedure
      .input(z.object({
        incidentId: z.number().int().positive(),
        status: status.optional(),
        priority: priority.optional(),
        assignedOrganizationId: z.number().int().positive().nullable().optional(),
        assignedResponderId: z.number().int().positive().nullable().optional(),
        note: z.string().trim().max(500).optional(),
        expectedVersion: z.number().int().positive().optional(),
      }))
      .mutation(({ ctx, input }) => updateIncident({ ...input, actorUserId: ctx.user.id })),
  }),
});

export type AppRouter = typeof appRouter;
