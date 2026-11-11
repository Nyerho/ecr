import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "author-1" } as { uid: string } | null },
  get: vi.fn(),
  delete: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  getApps: () => [{}],
  getApp: () => ({}),
  initializeApp: () => ({}),
}));
vi.mock("firebase/auth", async importOriginal => ({
  ...(await importOriginal<typeof import("firebase/auth")>()),
  getAuth: () => mocks.auth,
}));
vi.mock("firebase/firestore", async importOriginal => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  getFirestore: () => ({}),
  doc: (_database: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  }),
  runTransaction: mocks.runTransaction,
}));

function snapshot(authorUid: string | null) {
  return { exists: () => authorUid !== null, data: () => ({ authorUid }) };
}

function adminSnapshot(data: Record<string, unknown> | null) {
  return { exists: () => data !== null, data: () => data };
}

describe("deleting community messages", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    for (const key of [
      "API_KEY",
      "AUTH_DOMAIN",
      "PROJECT_ID",
      "STORAGE_BUCKET",
      "MESSAGING_SENDER_ID",
      "APP_ID",
    ]) {
      vi.stubEnv(`VITE_FIREBASE_${key}`, "configured-for-test");
    }
    mocks.auth.currentUser = { uid: "author-1" };
    mocks.get.mockResolvedValue(snapshot("author-1"));
    mocks.runTransaction.mockImplementation(async (_database, callback) =>
      callback({ get: mocks.get, delete: mocks.delete })
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("requires authentication before starting a deletion", async () => {
    mocks.auth.currentUser = null;
    const { deleteCommunityMessage } = await import("./firebase");
    await expect(deleteCommunityMessage("message-1")).rejects.toMatchObject({
      code: "unauthenticated",
    });
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it.each(["", "room/message-1"])(
    "rejects an invalid message identifier",
    async id => {
      const { deleteCommunityMessage } = await import("./firebase");
      await expect(deleteCommunityMessage(id)).rejects.toMatchObject({
        code: "invalid-argument",
      });
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    }
  );

  it("deletes the persisted author's message in a transaction", async () => {
    const { deleteCommunityMessage } = await import("./firebase");
    await expect(deleteCommunityMessage("message-1")).resolves.toBeUndefined();
    expect(mocks.get).toHaveBeenCalledWith({ path: "chatMessages/message-1" });
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.delete).toHaveBeenCalledWith({
      path: "chatMessages/message-1",
    });
  });

  it("rejects deletion of somebody else's message", async () => {
    mocks.get
      .mockResolvedValueOnce(snapshot("another-author"))
      .mockResolvedValueOnce(adminSnapshot(null));
    const { deleteCommunityMessage } = await import("./firebase");
    await expect(deleteCommunityMessage("message-1")).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("allows an active administrator to delete another author's message", async () => {
    mocks.get
      .mockResolvedValueOnce(snapshot("another-author"))
      .mockResolvedValueOnce(adminSnapshot({ active: true }));
    const { deleteCommunityMessage } = await import("./firebase");
    await expect(deleteCommunityMessage("message-1")).resolves.toBeUndefined();
    expect(mocks.get).toHaveBeenNthCalledWith(2, { path: "admins/author-1" });
    expect(mocks.delete).toHaveBeenCalledWith({
      path: "chatMessages/message-1",
    });
  });

  it.each([false, undefined, "true"])(
    "rejects a nonowner whose administrator record is inactive or invalid",
    async active => {
      mocks.get
        .mockResolvedValueOnce(snapshot("another-author"))
        .mockResolvedValueOnce(adminSnapshot({ active }));
      const { deleteCommunityMessage } = await import("./firebase");
      await expect(deleteCommunityMessage("message-1")).rejects.toMatchObject({
        code: "permission-denied",
      });
      expect(mocks.delete).not.toHaveBeenCalled();
    }
  );

  it("allows an active administrator to remove a legacy message without an author", async () => {
    mocks.get
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ text: "Legacy update" }),
      })
      .mockResolvedValueOnce(adminSnapshot({ active: true }));
    const { deleteCommunityMessage } = await import("./firebase");
    await expect(deleteCommunityMessage("message-1")).resolves.toBeUndefined();
    expect(mocks.delete).toHaveBeenCalledWith({
      path: "chatMessages/message-1",
    });
  });

  it("rechecks administrator authority when Firestore retries a concurrent deletion", async () => {
    mocks.get
      .mockResolvedValueOnce(snapshot("another-author"))
      .mockResolvedValueOnce(adminSnapshot({ active: true }))
      .mockResolvedValueOnce(snapshot("another-author"))
      .mockResolvedValueOnce(adminSnapshot({ active: false }));
    const discardedDelete = vi.fn();
    mocks.runTransaction.mockImplementationOnce(async (_database, callback) => {
      await callback({ get: mocks.get, delete: discardedDelete });
      return callback({ get: mocks.get, delete: mocks.delete });
    });
    const { deleteCommunityMessage } = await import("./firebase");
    await expect(deleteCommunityMessage("message-1")).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(discardedDelete).toHaveBeenCalledOnce();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("safely accepts a retry after the message was already removed", async () => {
    mocks.get.mockResolvedValue(snapshot(null));
    const { deleteCommunityMessage } = await import("./firebase");
    await expect(deleteCommunityMessage("message-1")).resolves.toBeUndefined();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("propagates failed commits so the room can offer a retry", async () => {
    mocks.runTransaction.mockRejectedValue(new Error("Connection unavailable"));
    const { deleteCommunityMessage } = await import("./firebase");
    await expect(deleteCommunityMessage("message-1")).rejects.toThrow(
      "Connection unavailable"
    );
  });
});
