import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPendingReports,
  isRetryableReportError,
  queuePendingReport,
  removePendingReport,
  updatePendingReport,
} from "./localOfflineReports";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("local offline reports", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("stores a pending report and preserves its retry metadata", () => {
    const report = queuePendingReport(
      { category: "fire", description: "Smoke near the market" },
      "Waiting for a connection",
    );
    expect(loadPendingReports()).toEqual([report]);
    updatePendingReport(report.id, { attempts: 1, lastError: "Still offline" });
    expect(loadPendingReports()[0]).toMatchObject({ attempts: 1, lastError: "Still offline" });
  });

  it("removes only the confirmed pending report", () => {
    const first = queuePendingReport({ category: "medical", description: "Help needed" });
    const second = queuePendingReport({ category: "rescue", description: "Person trapped" });
    removePendingReport(first.id);
    expect(loadPendingReports().map(report => report.id)).toEqual([second.id]);
  });

  it("keeps valid queued reports usable when storage also contains malformed records", () => {
    const report = queuePendingReport({ category: "fire", description: "Smoke near a building" });
    localStorage.setItem("ecr-pending-reports", JSON.stringify([null, {}, { ...report, queuedAt: 7 }, report]));
    expect(loadPendingReports()).toEqual([report]);
  });

  it("never claims to queue a report when storage is unavailable or full", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => queuePendingReport({ category: "fire", description: "Smoke near a building" })).toThrow("cannot save");
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("Quota exceeded"); } });
    expect(() => queuePendingReport({ category: "fire", description: "Smoke near a building" })).toThrow("Quota exceeded");
  });

  it("recognizes browser network failures and temporary trusted API failures", () => {
    expect(isRetryableReportError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableReportError(new TypeError("Load failed"))).toBe(true);
    expect(isRetryableReportError({ code: "UNAVAILABLE" })).toBe(true);
    expect(isRetryableReportError({ status: 503 })).toBe(true);
    expect(isRetryableReportError({ status: 429 })).toBe(true);
    expect(isRetryableReportError({ code: "permission-denied", status: 403 })).toBe(false);
    expect(isRetryableReportError(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });
});
