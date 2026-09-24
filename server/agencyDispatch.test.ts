import { describe, expect, it } from "vitest";
import { buildAgencyNotificationPayload, selectNearestAgency } from "./agencyDispatch";

describe("agency dispatch", () => {
  it("selects the nearest verified agency in the category routing priority", () => {
    const selected = selectNearestAgency(
      { category: "security", latitude: "6.5244", longitude: "3.3792" },
      [
        { id: 1, name: "Unverified Police Post", type: "police", latitude: "6.52", longitude: "3.37", isVerified: false, isActive: true },
        { id: 2, name: "Ikeja Police Division", type: "police", latitude: "6.6018", longitude: "3.3515", isVerified: true, isActive: true },
        { id: 3, name: "Lagos Dispatch Hub", type: "dispatch", latitude: "6.53", longitude: "3.38", isVerified: true, isActive: true },
      ],
    );

    expect(selected?.id).toBe(2);
  });

  it("returns no destination when there are no active verified agencies", () => {
    expect(selectNearestAgency({ category: "medical", latitude: "6.5", longitude: "3.3" }, [])).toBeNull();
  });

  it("prefers a verified agency whose service boundary contains the incident", () => {
    const selected = selectNearestAgency(
      { category: "security", latitude: "6.5", longitude: "3.3" },
      [
        { id: 10, name: "Police Outside Area", type: "police", latitude: "6.5", longitude: "3.3", isVerified: true, isActive: true },
        { id: 11, name: "Regional Dispatch Area", type: "dispatch", latitude: "6.8", longitude: "3.8", isVerified: true, isActive: true, serviceAreaGeoJson: JSON.stringify({ type: "Polygon", coordinates: [[[3.0, 6.0], [3.6, 6.0], [3.6, 6.8], [3.0, 6.8], [3.0, 6.0]]] }) },
      ],
    );

    expect(selected?.id).toBe(11);
  });

  it("makes the connector boundary explicit in the queued payload", () => {
    const payload = buildAgencyNotificationPayload({
      publicReference: "ECR-TEST-001",
      category: "medical",
      description: "Person needs urgent help",
      locationLabel: "Central market",
      latitude: "6.5",
      longitude: "3.3",
      reporterPhone: "+2348000000000",
      reporterEmail: "reporter@example.com",
    });

    expect(payload.kind).toBe("ecr.incident.received");
    expect(payload.deliveryNote).toContain("approved agency");
  });
});
