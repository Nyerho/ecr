import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const user = { uid: "reporter-1", getIdToken: vi.fn() };
  return {
    user,
    auth: { currentUser: user as typeof user | null },
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    query: vi.fn(),
    writeBatch: vi.fn(),
    runTransaction: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
  };
});

vi.mock("firebase/app", () => ({ getApps: () => [{}], getApp: () => ({}), initializeApp: () => ({}) }));
vi.mock("firebase/auth", async importOriginal => ({
  ...await importOriginal<typeof import("firebase/auth")>(),
  getAuth: () => mocks.auth,
}));
vi.mock("firebase/firestore", async importOriginal => ({
  ...await importOriginal<typeof import("firebase/firestore")>(),
  getFirestore: () => ({}),
  doc: (_database: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  collection: (_database: unknown, name: string) => ({ path: name }),
  where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
  limit: (count: number) => ({ limit: count }),
  query: mocks.query,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  writeBatch: mocks.writeBatch,
  runTransaction: mocks.runTransaction,
}));

function snapshot(data: Record<string, unknown> | null) {
  return { exists: () => data !== null, data: () => data };
}

describe("deleting your own incident reports", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const key of ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "APP_ID"]) {
      vi.stubEnv(`VITE_FIREBASE_${key}`, "configured-for-test");
    }
    vi.stubEnv("VITE_ECR_TRUSTED_COMMANDS_ENABLED", "false");
    vi.stubEnv("VITE_ECR_TRUSTED_API_URL", "");
    mocks.auth.currentUser = mocks.user;
    mocks.user.getIdToken.mockResolvedValue("owner-token");
    mocks.getDoc.mockReset()
      .mockResolvedValueOnce(snapshot({ reporterUid: "reporter-1", publicReference: "ECR-2026-ABC123" }))
      .mockResolvedValueOnce(snapshot({ ownerUid: "reporter-1" }));
    mocks.getDocs.mockReset().mockResolvedValue({ size: 0, docs: [] });
    mocks.query.mockImplementation((source, ...constraints) => ({ source, constraints }));
    mocks.commit.mockReset().mockResolvedValue(undefined);
    mocks.writeBatch.mockReturnValue({ delete: mocks.delete, commit: mocks.commit });
    mocks.runTransaction.mockImplementation(async (_database, callback) => {
      const result = await callback({ get: mocks.getDoc, delete: mocks.delete });
      await mocks.commit();
      return result;
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires authentication before reading or deleting anything", async () => {
    mocks.auth.currentUser = null;
    const { deleteReportIncident } = await import("./firebase");
    await expect(deleteReportIncident("incident-1")).rejects.toMatchObject({ code: "unauthenticated" });
    expect(mocks.getDoc).not.toHaveBeenCalled();
    expect(mocks.runTransaction).not.toHaveBeenCalled();
    expect(mocks.writeBatch).not.toHaveBeenCalled();
  });

  it("rejects another person's report using its persisted owner", async () => {
    mocks.getDoc.mockReset().mockResolvedValueOnce(snapshot({ reporterUid: "another-reporter", publicReference: "ECR-2026-ABC123" }));
    const { deleteReportIncident } = await import("./firebase");
    await expect(deleteReportIncident("incident-1")).rejects.toMatchObject({ code: "permission-denied" });
    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.writeBatch).not.toHaveBeenCalled();
  });

  it("does not delete related documents when the incident is missing", async () => {
    mocks.getDoc.mockReset().mockResolvedValueOnce(snapshot(null));
    const { deleteReportIncident } = await import("./firebase");
    await expect(deleteReportIncident("incident-1")).rejects.toMatchObject({ code: "not-found" });
    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.writeBatch).not.toHaveBeenCalled();
  });

  it("atomically deletes the actual incident, its tracking record, and linked public messages", async () => {
    mocks.getDocs.mockResolvedValue({ size: 2, docs: [{ ref: { path: "chatMessages/alert-1" } }, { ref: { path: "chatMessages/update-1" } }] });
    const { deleteReportIncident } = await import("./firebase");
    await expect(deleteReportIncident("incident-1")).resolves.toBeUndefined();
    expect(mocks.getDoc.mock.calls[0][0]).toEqual({ path: "incidents/incident-1" });
    expect(mocks.query).toHaveBeenCalledWith(
      { path: "chatMessages" },
      { field: "publicReference", operator: "==", value: "ECR-2026-ABC123" },
      { field: "visibility", operator: "==", value: "public" },
      { limit: 500 }
    );
    expect(mocks.delete.mock.calls.map(([reference]) => reference.path)).toEqual([
      "incidents/incident-1", "publicTracking/ECR-2026-ABC123", "chatMessages/alert-1", "chatMessages/update-1",
    ]);
    expect(mocks.runTransaction).toHaveBeenCalledOnce();
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it("can remove an owned report whose tracking record is already absent", async () => {
    mocks.getDoc.mockReset()
      .mockResolvedValueOnce(snapshot({ reporterUid: "reporter-1", publicReference: "ECR-2026-ABC123" }))
      .mockResolvedValueOnce(snapshot(null));
    const { deleteReportIncident } = await import("./firebase");
    await expect(deleteReportIncident("incident-1")).resolves.toBeUndefined();
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.delete).toHaveBeenCalledWith({ path: "incidents/incident-1" });
  });

  it("refreshes linked public updates when Firestore retries after a concurrent status change", async () => {
    mocks.getDoc.mockReset()
      .mockResolvedValueOnce(snapshot({ reporterUid: "reporter-1", publicReference: "ECR-2026-ABC123", version: 1 }))
      .mockResolvedValueOnce(snapshot({ ownerUid: "reporter-1", status: "submitted" }))
      .mockResolvedValueOnce(snapshot({ reporterUid: "reporter-1", publicReference: "ECR-2026-ABC123", version: 2 }))
      .mockResolvedValueOnce(snapshot({ ownerUid: "reporter-1", status: "received" }));
    mocks.getDocs
      .mockResolvedValueOnce({ size: 1, docs: [{ ref: { path: "chatMessages/alert-1" } }] })
      .mockResolvedValueOnce({ size: 2, docs: [{ ref: { path: "chatMessages/alert-1" } }, { ref: { path: "chatMessages/concurrent-update" } }] });
    const discardedDelete = vi.fn();
    mocks.runTransaction.mockImplementationOnce(async (_database, callback) => {
      await callback({ get: mocks.getDoc, delete: discardedDelete });
      // Firestore discards the first attempt after a read document changes.
      const result = await callback({ get: mocks.getDoc, delete: mocks.delete });
      await mocks.commit();
      return result;
    });

    const { deleteReportIncident } = await import("./firebase");
    await expect(deleteReportIncident("incident-1")).resolves.toBeUndefined();

    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
    expect(discardedDelete).toHaveBeenCalledTimes(3);
    expect(mocks.delete.mock.calls.map(([reference]) => reference.path)).toEqual([
      "incidents/incident-1", "publicTracking/ECR-2026-ABC123", "chatMessages/alert-1", "chatMessages/concurrent-update",
    ]);
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it("does not attempt a partial deletion when the atomic batch would exceed its limit", async () => {
    mocks.getDocs.mockResolvedValue({ size: 499, docs: Array.from({ length: 499 }, (_, index) => ({ ref: { path: `chatMessages/${index}` } })) });
    const { deleteReportIncident } = await import("./firebase");
    await expect(deleteReportIncident("incident-1")).rejects.toMatchObject({ code: "failed-precondition" });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.writeBatch).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("permits a full batch at the 500-operation boundary", async () => {
    mocks.getDocs.mockResolvedValue({ size: 498, docs: Array.from({ length: 498 }, (_, index) => ({ ref: { path: `chatMessages/${index}` } })) });
    const { deleteReportIncident } = await import("./firebase");
    await expect(deleteReportIncident("incident-1")).resolves.toBeUndefined();
    expect(mocks.delete).toHaveBeenCalledTimes(500);
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it("propagates a rejected atomic commit instead of reporting success", async () => {
    const rejected = Object.assign(new Error("Service rules rejected deletion"), { code: "permission-denied" });
    mocks.commit.mockRejectedValue(rejected);
    const { deleteReportIncident } = await import("./firebase");
    await expect(deleteReportIncident("incident-1")).rejects.toBe(rejected);
  });

  it("uses the authenticated owner-only DELETE API in trusted mode", async () => {
    vi.stubEnv("VITE_ECR_TRUSTED_COMMANDS_ENABLED", "true");
    vi.stubEnv("VITE_ECR_TRUSTED_API_URL", "https://trusted.example.test/");
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "incident #1", deleted: true }) });
    vi.stubGlobal("fetch", request);
    const { deleteReportIncident } = await import("./firebase");
    await expect(deleteReportIncident("incident #1")).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("https://trusted.example.test/api/v1/incidents/incident%20%231", {
      method: "DELETE", headers: { Authorization: "Bearer owner-token" },
    });
    expect(mocks.getDoc).not.toHaveBeenCalled();
    expect(mocks.writeBatch).not.toHaveBeenCalled();
  });

  it("keeps the trusted API's ownership rejection for the UI", async () => {
    vi.stubEnv("VITE_ECR_TRUSTED_COMMANDS_ENABLED", "true");
    vi.stubEnv("VITE_ECR_TRUSTED_API_URL", "https://trusted.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Only the reporter can delete this report", code: "FORBIDDEN" }) }));
    const { deleteReportIncident } = await import("./firebase");
    await expect(deleteReportIncident("incident-1")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403, message: "Only the reporter can delete this report" });
  });

  it("requires a positive deletion confirmation before reporting trusted API success", async () => {
    vi.stubEnv("VITE_ECR_TRUSTED_COMMANDS_ENABLED", "true");
    vi.stubEnv("VITE_ECR_TRUSTED_API_URL", "https://trusted.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const { deleteReportIncident } = await import("./firebase");
    await expect(deleteReportIncident("incident-1")).rejects.toMatchObject({ code: "failed-precondition" });
  });
});
