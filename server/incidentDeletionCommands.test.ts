import type { Express, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFirebaseFirestore } from "./_core/firebaseAdmin";
import { deleteOwnedIncident } from "./incidentDeletionCommands";
import { deletePrivateMediaObject, isPrivateMediaConfigured } from "./privateMediaStorage";
import { authenticateBearerToken, createTrustedIncident, type CommandPrincipal } from "./trustedIncidentCommands";
import { registerTrustedIncidentRoutes } from "./trustedIncidentRoutes";

vi.mock("./_core/firebaseAdmin", () => ({ getFirebaseFirestore: vi.fn(), getFirebaseAuth: vi.fn() }));
vi.mock("./privateMediaStorage", async importOriginal => ({
  ...(await importOriginal<typeof import("./privateMediaStorage")>()),
  deletePrivateMediaObject: vi.fn(),
  isPrivateMediaConfigured: vi.fn(),
}));
vi.mock("./trustedIncidentCommands", async importOriginal => ({
  ...(await importOriginal<typeof import("./trustedIncidentCommands")>()),
  authenticateBearerToken: vi.fn(),
}));

const principal = { uid: "reporter-owner", role: "citizen", memberships: [], jurisdictionId: null } as unknown as CommandPrincipal;
const records = new Map<string, Record<string, unknown>>();
type Reference = { path: string; id: string };
type Query = { name: string; filters: Array<[string, unknown]>; maximum: number };
type ReadTarget = Reference | Query;
type Mutation = { operation: "delete" | "update" | "create"; reference: Reference; data?: Record<string, unknown> };

function reference(path: string): Reference {
  return { path, id: path.split("/").at(-1)! };
}
function snapshot(path: string) {
  return { id: path.split("/").at(-1)!, ref: reference(path), exists: records.has(path), data: () => records.get(path) };
}
function read(target: ReadTarget) {
  if ("path" in target) return snapshot(target.path);
  return {
    docs: [...records.entries()]
      .filter(([path, data]) => path.startsWith(`${target.name}/`) && target.filters.every(([field, value]) => data[field] === value))
      .slice(0, target.maximum).map(([path]) => snapshot(path)),
  };
}
function collection(name: string, filters: Array<[string, unknown]> = [], maximum = Infinity) {
  return {
    name, filters, maximum,
    doc: (id: string) => reference(`${name}/${id}`),
    where: (field: string, _operator: string, value: unknown) => collection(name, [...filters, [field, value]], maximum),
    limit: (limit: number) => collection(name, filters, limit),
    get: async () => read({ name, filters, maximum }),
  };
}
function apply(mutations: Mutation[]) {
  for (const mutation of mutations) {
    if (mutation.operation === "delete") records.delete(mutation.reference.path);
    else if (mutation.operation === "update") records.set(mutation.reference.path, { ...records.get(mutation.reference.path), ...mutation.data });
    else records.set(mutation.reference.path, mutation.data!);
  }
}
const batchSizes: number[] = [];
const database = {
  collection: vi.fn(collection),
  runTransaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) => {
    const mutations: Mutation[] = [];
    const result = await callback({
      get: async (target: ReadTarget) => read(target),
      update: (ref: Reference, data: Record<string, unknown>) => mutations.push({ operation: "update", reference: ref, data }),
      create: (ref: Reference, data: Record<string, unknown>) => mutations.push({ operation: "create", reference: ref, data }),
      delete: (ref: Reference) => mutations.push({ operation: "delete", reference: ref }),
    });
    apply(mutations);
    return result;
  }),
  batch: vi.fn(() => {
    const mutations: Mutation[] = [];
    return {
      delete: (ref: Reference) => mutations.push({ operation: "delete", reference: ref }),
      commit: async () => { batchSizes.push(mutations.length); apply(mutations); },
    };
  }),
};

function seedReport() {
  records.set("incidents/report-1", { reporterUid: principal.uid, publicReference: "ECR-2026-DELETE1", description: "Private report description", status: "assigned" });
  records.set("publicTracking/ECR-2026-DELETE1", { ownerUid: principal.uid, publicReference: "ECR-2026-DELETE1" });
  records.set("chatMessages/report-alert", { publicReference: "ECR-2026-DELETE1", authorUid: principal.uid });
  records.set("assignments/active-assignment", { incidentId: "report-1", status: "accepted" });
  records.set("notificationDeliveries/queued-delivery", { incidentId: "report-1", status: "queued" });
  records.set("notificationDeadLetters/failed-delivery", { incidentId: "report-1" });
  records.set("auditEvents/existing-audit", { resourceId: "report-1", action: "incident.created" });
  records.set("incidentEvents/existing-event", { incidentId: "report-1", type: "created" });
  records.set("idempotencyKeys/report-command", { incidentId: "report-1", actorUid: principal.uid, command: "incident.create" });
}

beforeEach(() => {
  vi.clearAllMocks();
  records.clear();
  batchSizes.length = 0;
  vi.mocked(getFirebaseFirestore).mockReturnValue(database as unknown as ReturnType<typeof getFirebaseFirestore>);
  vi.mocked(isPrivateMediaConfigured).mockReturnValue(true);
  vi.mocked(deletePrivateMediaObject).mockResolvedValue(undefined);
  vi.mocked(authenticateBearerToken).mockResolvedValue(principal);
  seedReport();
});

describe("owner-only incident deletion", () => {
  it.each(["citizen", "admin"])("denies a different %s even if it has operational privileges", async role => {
    await expect(deleteOwnedIncident({ ...principal, uid: "another-user", role }, "report-1"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(records.get("incidents/report-1")).not.toHaveProperty("deletionPending");
    expect(database.batch).not.toHaveBeenCalled();
    expect(deletePrivateMediaObject).not.toHaveBeenCalled();
  });

  it("removes only the owner's report and linked public, assignment, notification, and media data", async () => {
    records.set("incidentMedia/photo-1", { incidentId: "report-1", storagePath: "private/incidents/report-1/photo-1" });
    for (const name of ["incidents", "chatMessages", "assignments", "notificationDeliveries", "notificationDeadLetters", "incidentMedia"]) {
      records.set(`${name}/unrelated`, { reporterUid: "another-user", incidentId: "another-report", publicReference: "ECR-2026-OTHER1" });
    }

    await expect(deleteOwnedIncident(principal, "report-1")).resolves.toEqual({ id: "report-1", deleted: true });

    expect(records.has("incidents/report-1")).toBe(false);
    expect(records.has("publicTracking/ECR-2026-DELETE1")).toBe(false);
    expect(records.has("chatMessages/report-alert")).toBe(false);
    expect(records.has("assignments/active-assignment")).toBe(false);
    expect(records.has("notificationDeliveries/queued-delivery")).toBe(false);
    expect(records.has("notificationDeadLetters/failed-delivery")).toBe(false);
    expect(records.has("incidentMedia/photo-1")).toBe(false);
    expect(deletePrivateMediaObject).toHaveBeenCalledWith("private/incidents/report-1/photo-1");
    expect([...records.keys()].filter(path => path.endsWith("/unrelated"))).toHaveLength(6);
    expect(records.has("auditEvents/existing-audit")).toBe(true);
    expect(records.has("incidentEvents/existing-event")).toBe(true);
    expect(records.has("idempotencyKeys/report-command")).toBe(true);
    const deletedAudit = [...records.values()].find(data => data.action === "incident.deleted");
    expect(deletedAudit).toMatchObject({ actorUid: principal.uid, resourceId: "report-1", result: "success" });
    expect(deletedAudit).not.toHaveProperty("description");
    expect(deletedAudit).not.toHaveProperty("reporterPhone");
  });

  it("returns the same success for missing IDs and repeated deletion without duplicating audit events", async () => {
    await deleteOwnedIncident(principal, "report-1");
    await expect(deleteOwnedIncident(principal, "report-1")).resolves.toEqual({ id: "report-1", deleted: true });
    await expect(deleteOwnedIncident(principal, "missing-report")).resolves.toEqual({ id: "missing-report", deleted: true });
    expect([...records.values()].filter(data => data.action === "incident.deleted")).toHaveLength(1);
  });

  it("rejects malformed identifiers before accessing Firestore", async () => {
    await expect(deleteOwnedIncident(principal, "report/another-document")).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(getFirebaseFirestore).not.toHaveBeenCalled();
  });

  it("fails before marking or deleting anything if attachment storage is unavailable", async () => {
    records.set("incidentMedia/photo-1", { incidentId: "report-1", storagePath: "private/incidents/report-1/photo-1" });
    vi.mocked(isPrivateMediaConfigured).mockReturnValue(false);

    await expect(deleteOwnedIncident(principal, "report-1")).rejects.toMatchObject({ code: "UNAVAILABLE" });

    expect(records.get("incidents/report-1")).not.toHaveProperty("deletionPending");
    expect(records.has("incidentMedia/photo-1")).toBe(true);
    expect(records.has("chatMessages/report-alert")).toBe(true);
    expect(deletePrivateMediaObject).not.toHaveBeenCalled();
  });

  it("retains the incident and attachment metadata on object deletion failure and permits a safe retry", async () => {
    records.set("incidentMedia/photo-1", { incidentId: "report-1", storagePath: "private/incidents/report-1/photo-1" });
    vi.mocked(deletePrivateMediaObject).mockRejectedValueOnce(new Error("Object storage unavailable"));

    await expect(deleteOwnedIncident(principal, "report-1")).rejects.toMatchObject({ code: "UNAVAILABLE" });

    expect(records.get("incidents/report-1")).toMatchObject({ deletionPending: true, reporterUid: principal.uid });
    expect(records.get("publicTracking/ECR-2026-DELETE1")).toMatchObject({ deletionPending: true });
    expect(records.has("incidentMedia/photo-1")).toBe(true);
    expect(records.has("chatMessages/report-alert")).toBe(true);
    await expect(deleteOwnedIncident(principal, "report-1")).resolves.toEqual({ id: "report-1", deleted: true });
  });

  it("never deletes an object belonging to a different incident", async () => {
    records.set("incidentMedia/photo-1", { incidentId: "report-1", storagePath: "private/incidents/another-report/photo-1" });

    await expect(deleteOwnedIncident(principal, "report-1")).rejects.toMatchObject({ code: "CONFLICT" });

    expect(deletePrivateMediaObject).not.toHaveBeenCalled();
    expect(records.get("incidents/report-1")).not.toHaveProperty("deletionPending");
  });

  it("refuses to remove a public reference shared by another complaint", async () => {
    records.set("incidents/other-report", { reporterUid: "another-user", publicReference: "ECR-2026-DELETE1" });

    await expect(deleteOwnedIncident(principal, "report-1")).rejects.toMatchObject({ code: "CONFLICT" });

    expect(records.has("publicTracking/ECR-2026-DELETE1")).toBe(true);
    expect(database.batch).not.toHaveBeenCalled();
  });

  it("supports older trusted tracking projections with a unique owned incident", async () => {
    records.set("publicTracking/ECR-2026-DELETE1", { publicReference: "ECR-2026-DELETE1" });
    await expect(deleteOwnedIncident(principal, "report-1")).resolves.toEqual({ id: "report-1", deleted: true });
  });

  it("supports legacy projections that predate trusted create-command records", async () => {
    records.set("publicTracking/ECR-2026-DELETE1", { publicReference: "ECR-2026-DELETE1" });
    records.delete("idempotencyKeys/report-command");

    await expect(deleteOwnedIncident(principal, "report-1")).resolves.toEqual({ id: "report-1", deleted: true });
    expect(records.has("publicTracking/ECR-2026-DELETE1")).toBe(false);
  });

  it("bounds linked document deletions to 400 writes per batch", async () => {
    for (let index = 0; index < 805; index += 1) {
      records.set(`chatMessages/related-${index}`, { publicReference: "ECR-2026-DELETE1" });
    }

    await deleteOwnedIncident(principal, "report-1");

    expect(batchSizes.every(size => size <= 400)).toBe(true);
    expect([...records.keys()].filter(path => path.startsWith("chatMessages/"))).toHaveLength(0);
  });

  it("preserves the create-command tombstone so a queued retry cannot recreate a deleted report", async () => {
    const { createHash } = await import("node:crypto");
    const key = "create-deletion-replay-001";
    const keyId = createHash("sha256").update(`${principal.uid}:${key}`).digest("hex");
    records.set(`idempotencyKeys/${keyId}`, { command: "incident.create", actorUid: principal.uid, incidentId: "report-1" });
    await deleteOwnedIncident(principal, "report-1");

    await expect(createTrustedIncident({ principal, category: "medical", description: "Queued duplicate report", reporterPhone: "+2348000000000", commandKey: key }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(records.has(`idempotencyKeys/${keyId}`)).toBe(true);
    expect([...records.keys()].filter(path => path.startsWith("incidents/"))).toHaveLength(0);
  });
});

describe("DELETE incident route", () => {
  function route() {
    const remove = vi.fn();
    registerTrustedIncidentRoutes({ post: vi.fn(), get: vi.fn(), delete: remove } as unknown as Express);
    const handler = remove.mock.calls.find(([path]) => path === "/api/v1/incidents/:incidentId")![1] as (req: Request, res: Response) => Promise<void>;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    return { handler, res };
  }

  it("uses only the bearer principal and URL identifier", async () => {
    const { handler, res } = route();
    await handler({ params: { incidentId: "report-1" }, body: { principal: { uid: "another-user" } }, header: () => "Bearer fixture" } as unknown as Request, res as unknown as Response);

    expect(authenticateBearerToken).toHaveBeenCalledWith("Bearer fixture");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: "report-1", deleted: true });
  });

  it("rejects deletion before database access when authentication fails", async () => {
    const { handler, res } = route();
    vi.mocked(authenticateBearerToken).mockRejectedValueOnce(new Error("Invalid session"));
    await handler({ params: { incidentId: "report-1" }, header: () => undefined } as unknown as Request, res as unknown as Response);

    expect(getFirebaseFirestore).not.toHaveBeenCalled();
    expect(records.has("incidents/report-1")).toBe(true);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
