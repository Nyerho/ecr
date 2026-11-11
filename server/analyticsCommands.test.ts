import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFirebaseFirestore } from "./_core/firebaseAdmin";
import { getTrustedAnalytics } from "./analyticsCommands";
import type { CommandPrincipal } from "./trustedIncidentCommands";

vi.mock("./_core/firebaseAdmin", () => ({
  getFirebaseFirestore: vi.fn(),
  getFirebaseAuth: vi.fn(),
}));

const principal = {
  uid: "analytics-operator",
  role: "coordinator",
  organizationId: "organization-1",
  jurisdictionId: "area-1",
  memberships: [{
    id: "analytics-membership",
    uid: "analytics-operator",
    organizationId: "organization-1",
    jurisdictionId: "area-1",
    role: "coordinator",
    active: true,
  }],
} as CommandPrincipal;

const records = [
  { id: "in-scope", organizationId: "organization-1", jurisdictionId: "area-1", category: "medical" },
  { id: "other-area", organizationId: "organization-1", jurisdictionId: "area-2", category: "fire" },
  { id: "other-organization", organizationId: "organization-2", jurisdictionId: "area-1", category: "security" },
];
const query = {
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  get: vi.fn(async () => ({
    docs: records.map(record => ({
      id: record.id,
      data: () => ({ ...record, createdAt: new Date().toISOString(), status: "received" }),
    })),
  })),
  add: vi.fn(),
};
const database = { collection: vi.fn(() => query) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFirebaseFirestore).mockReturnValue(database as unknown as ReturnType<typeof getFirebaseFirestore>);
});

describe("analytics authorization", () => {
  it.each([
    ["missing organization", { ...principal, organizationId: null }],
    ["missing membership", { ...principal, memberships: [] }],
    ["inactive membership", { ...principal, memberships: [{ ...principal.memberships[0]!, active: false }] }],
    ["membership in another organization", { ...principal, memberships: [{ ...principal.memberships[0]!, organizationId: "organization-2" }] }],
    ["responder-only membership", { ...principal, memberships: [{ ...principal.memberships[0]!, role: "responder" as const }] }],
  ])("denies a role-only operator with %s before querying incidents", async (_label, operator) => {
    await expect(getTrustedAnalytics(operator, 30)).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(getFirebaseFirestore).not.toHaveBeenCalled();
  });

  it("includes only incidents inside an active membership's organization and jurisdiction", async () => {
    const result = await getTrustedAnalytics(principal, 30);

    expect(query.where).toHaveBeenCalledWith("organizationId", "==", "organization-1");
    expect(result.totals.incidents).toBe(1);
    expect(result.byCategory).toEqual([{ key: "medical", value: 1 }]);
    expect(result.byOrganization).toEqual([{ key: "organization-1", value: 1 }]);
    expect(query.add).toHaveBeenCalledWith(expect.objectContaining({
      action: "analytics.viewed",
      metadata: { days: 30, incidentCount: 1 },
    }));
  });

  it("allows an organization-wide membership to include its jurisdictions", async () => {
    const operator = {
      ...principal,
      jurisdictionId: null,
      memberships: [{ ...principal.memberships[0]!, jurisdictionId: null }],
    };

    const result = await getTrustedAnalytics(operator, 30);

    expect(result.totals.incidents).toBe(2);
    expect(result.byOrganization).toEqual([{ key: "organization-1", value: 2 }]);
  });

  it("preserves global analytics for an administrator", async () => {
    const result = await getTrustedAnalytics({ ...principal, role: "admin", organizationId: null, memberships: [] }, 30);

    expect(result.totals.incidents).toBe(3);
    expect(query.where).not.toHaveBeenCalled();
  });
});
