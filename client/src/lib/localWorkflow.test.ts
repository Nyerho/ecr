import { beforeEach, describe, expect, it } from "vitest";
import { createLocalIncident, loadLocalIncidents, type LocalUser } from "./localIncidents";
import { loadAllLocalIncidents, updateSharedLocalIncident } from "./localDispatch";
import { MAX_INCIDENT_PHOTO_BYTES, MAX_INCIDENT_PHOTO_TOTAL_BYTES, MAX_INCIDENT_PHOTOS, validateIncidentPhotoFiles } from "./localIncidentPhotos";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const citizen: LocalUser = {
  id: "local-citizen-1",
  name: "Test Citizen",
  email: "citizen@example.com",
  role: "user",
  createdAt: "2026-09-24T12:00:00.000Z",
};

describe("shared local workflow", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
  });

  it("makes citizen reports discoverable by the dispatcher and records structured audit events", () => {
    const created = createLocalIncident(citizen, {
      category: "medical",
      description: "A person needs urgent assistance",
      locationLabel: "Pilot market",
      reporterPhone: "+2348000000000",
    });

    expect(loadAllLocalIncidents()).toHaveLength(1);
    const updated = updateSharedLocalIncident(created.id, {
      priority: "critical",
      jurisdiction: "Pilot area",
      action: "Dispatcher prioritized report",
      actor: "dispatcher",
      expectedVersion: created.version,
    });

    expect(updated?.priority).toBe("critical");
    expect(updated?.version).toBe(2);
    expect(updated?.events.at(-1)).toMatchObject({
      actor: "dispatcher",
      previousValue: "medium",
      newValue: "critical",
      label: "Dispatcher prioritized report",
    });
    expect(loadLocalIncidents(citizen)[0].events[0]).toMatchObject({ actor: "citizen", newValue: "submitted" });
  });

  it("rejects a stale dispatcher update without overwriting newer data", () => {
    const created = createLocalIncident(citizen, {
      category: "fire",
      description: "Smoke is visible near the road",
      locationLabel: "Station road",
    });
    const firstUpdate = updateSharedLocalIncident(created.id, { status: "received", expectedVersion: 1 });
    const staleUpdate = updateSharedLocalIncident(created.id, { priority: "high", expectedVersion: 1 });

    expect(firstUpdate?.version).toBe(2);
    expect(staleUpdate).toBeNull();
    expect(loadAllLocalIncidents()[0]).toMatchObject({ status: "received", priority: "medium", version: 2 });
  });

  it("accepts only supported photos within per-image, total-size, and count limits", () => {
    expect(validateIncidentPhotoFiles([{ type: "image/jpeg", size: MAX_INCIDENT_PHOTO_BYTES }])).toBeNull();
    expect(validateIncidentPhotoFiles([{ type: "image/svg+xml", size: 100 }])).toContain("JPEG, PNG, or WebP");
    expect(validateIncidentPhotoFiles([{ type: "image/png", size: MAX_INCIDENT_PHOTO_BYTES + 1 }])).toContain("8 MB");
    expect(validateIncidentPhotoFiles([{ type: "image/jpeg", size: MAX_INCIDENT_PHOTO_BYTES }], MAX_INCIDENT_PHOTOS)).toContain("up to");
    expect(validateIncidentPhotoFiles([{ type: "image/webp", size: MAX_INCIDENT_PHOTO_BYTES }], 0, MAX_INCIDENT_PHOTO_TOTAL_BYTES)).toContain("16 MB");
  });

  it("keeps photo labels visible to the local dispatcher queue without storing image blobs in localStorage", () => {
    const photo = { id: "photo-1", kind: "missing_person" as const, mimeType: "image/jpeg", size: 1200, createdAt: "2026-09-25T10:00:00.000Z" };
    const incident = createLocalIncident(citizen, {
      category: "missing_person",
      description: "A person has been missing since this morning",
      locationLabel: "Central market",
      photos: [photo],
    });

    expect(loadAllLocalIncidents()[0].photos).toEqual([photo]);
    expect(loadLocalIncidents(citizen)[0].photos).toEqual([photo]);
    expect(localStorage.getItem("ecr-local-incidents:citizen@example.com")).not.toContain("blob:");
  });
});
