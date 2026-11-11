import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadReportCommandKey, newReportCommandKey } from "./reportCommandKey";
import { loadPendingReports, queuePendingReport } from "./localOfflineReports";

describe("report command keys", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reuses one saved key across attempts and after reloading the client module", async () => {
    const key = loadReportCommandKey();
    expect(loadReportCommandKey()).toBe(key);
    vi.resetModules();
    const reloaded = await import("./reportCommandKey");
    expect(reloaded.loadReportCommandKey()).toBe(key);
  });

  it("retains the original key in the offline queue when the next draft gets a new key", () => {
    const key = loadReportCommandKey();
    const pending = queuePendingReport({ commandKey: key, category: "fire", description: "Smoke near the market" });
    const nextKey = newReportCommandKey();
    expect(nextKey).not.toBe(key);
    expect(loadReportCommandKey()).toBe(nextKey);
    expect(loadPendingReports().find(report => report.id === pending.id)?.commandKey).toBe(key);
  });
});
