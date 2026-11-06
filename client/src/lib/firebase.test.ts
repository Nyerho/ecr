import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/app", () => ({
  getApps: () => [{}],
  getApp: () => ({}),
  initializeApp: () => ({}),
}));
vi.mock("firebase/auth", async importOriginal => ({
  ...await importOriginal<typeof import("firebase/auth")>(),
  getAuth: () => ({ currentUser: { getIdToken: async () => "test-token" } }),
}));
vi.mock("firebase/firestore", async importOriginal => ({
  ...await importOriginal<typeof import("firebase/firestore")>(),
  getFirestore: () => ({}),
}));

describe("public report tracking", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("reports missing service configuration through the error callback without crashing the page", async () => {
    for (const key of ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "APP_ID"]) {
      vi.stubEnv(`VITE_FIREBASE_${key}`, "");
    }
    const { trackPublicIncident } = await import("./firebase");
    const onError = vi.fn();
    const callback = vi.fn();
    const unsubscribe = trackPublicIncident("ECR-2026-ABC123", callback, onError);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(callback).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  it("sends the same supplied command key when a trusted report request is retried", async () => {
    for (const key of ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "APP_ID"]) {
      vi.stubEnv(`VITE_FIREBASE_${key}`, "configured-for-test");
    }
    vi.stubEnv("VITE_ECR_TRUSTED_COMMANDS_ENABLED", "true");
    vi.stubEnv("VITE_ECR_TRUSTED_API_URL", "https://trusted.example.test");
    const fetchReport = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "incident-1", publicReference: "ECR-2026-ABC123", replayed: true }) });
    vi.stubGlobal("fetch", fetchReport);
    const { createReportIncident } = await import("./firebase");
    const input = { reporterUid: "reporter-1", category: "fire", description: "Smoke near the market", commandKey: "web-stable-report-key" };
    await expect(createReportIncident(input)).rejects.toThrow("Failed to fetch");
    await expect(createReportIncident(input)).resolves.toMatchObject({ id: "incident-1", replayed: true });
    const sentKeys = fetchReport.mock.calls.map(([, options]) => JSON.parse(options.body).commandKey);
    expect(sentKeys).toEqual([input.commandKey, input.commandKey]);
  });
});
