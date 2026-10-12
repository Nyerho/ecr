import { beforeEach, describe, expect, it } from "vitest";
import {
  loadPendingReports,
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
});
