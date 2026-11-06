import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFirebaseFirestore } from "./_core/firebaseAdmin";
import { listTrustedIncidentMedia } from "./mediaCommands";
import { assignTrustedIncident, expireStaleAssignments, respondToTrustedAssignment, type CommandPrincipal } from "./trustedIncidentCommands";

vi.mock("./_core/firebaseAdmin", () => ({
  getFirebaseFirestore: vi.fn(),
  getFirebaseAuth: vi.fn(),
}));

const principal = {
  uid: "operator-fixture",
  role: "coordinator",
  organizationId: "organization-1",
  jurisdictionId: "area-1",
  memberships: [{
    id: "membership-1",
    uid: "operator-fixture",
    organizationId: "organization-1",
    jurisdictionId: "area-1",
    role: "coordinator",
    active: true,
  }],
} as CommandPrincipal;

const records = new Map<string, Record<string, unknown>>();
function reference(path: string) {
  return { path, id: path.split("/").at(-1)!, get: async () => snapshot(path) };
}
function snapshot(path: string) {
  return {
    id: path.split("/").at(-1)!,
    ref: reference(path),
    exists: records.has(path),
    data: () => records.get(path),
  };
}
const transaction = {
  get: vi.fn(async (ref: { path: string }) => snapshot(ref.path)),
  update: vi.fn(),
  create: vi.fn(),
  set: vi.fn(),
};
const addAudit = vi.fn();
function collection(name: string) {
  const query = {
    doc: (id = "generated-fixture") => reference(`${name}/${id}`),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: async () => ({
      docs: [...records.keys()].filter(path => path.startsWith(`${name}/`)).map(snapshot),
    }),
    add: addAudit,
  };
  return query;
}
const database = {
  collection: vi.fn(collection),
  runTransaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
};

function seedIncident(organizationId: string, jurisdictionId: string) {
  records.set("incidents/incident-1", {
    organizationId,
    jurisdictionId,
    reporterUid: "another-reporter",
    status: "assigned",
    publicReference: "ECR-2026-ABC123",
    version: 1,
    assignedOrganizationId: organizationId,
    assignedResponderUid: "responder-fixture",
    activeAssignmentId: "assignment-1",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  records.clear();
  vi.mocked(getFirebaseFirestore).mockReturnValue(database as unknown as ReturnType<typeof getFirebaseFirestore>);
  records.set("assignments/assignment-1", {
    incidentId: "incident-1",
    organizationId: "organization-1",
    responderUid: "responder-fixture",
    status: "offered",
    version: 1,
    offeredBy: "operator-fixture",
    createdAt: { toDate: () => new Date(Date.now() - 20 * 60_000) },
  });
});

describe("assignment expiry scope", () => {
  it.each([
    ["another organization", "organization-2", "area-1"],
    ["another jurisdiction", "organization-1", "area-2"],
  ])("does not expire assignments in %s", async (_label, organizationId, jurisdictionId) => {
    seedIncident(organizationId, jurisdictionId);

    await expect(expireStaleAssignments(principal)).resolves.toEqual({ expired: 0 });

    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it("expires stale assignments inside the operator's incident scope", async () => {
    seedIncident("organization-1", "area-1");

    await expect(expireStaleAssignments(principal)).resolves.toEqual({ expired: 1 });

    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "assignments/assignment-1" }),
      expect.objectContaining({ status: "expired" }),
    );
  });

  it("does not escalate the incident when expiring a superseded assignment", async () => {
    seedIncident("organization-1", "area-1");
    records.get("incidents/incident-1")!.activeAssignmentId = "newer-assignment";

    await expect(expireStaleAssignments(principal)).resolves.toEqual({ expired: 1 });

    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "assignments/assignment-1" }),
      expect.objectContaining({ status: "expired" }),
    );
  });

  it.each([0, -10, NaN, Infinity, "invalid"])("rejects invalid expiry periods (%s) before querying assignments", async value => {
    await expect(expireStaleAssignments(principal, value as number)).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });

    expect(database.collection).not.toHaveBeenCalled();
  });
});

describe("incident media jurisdiction scope", () => {
  it("denies a member of the same organization in another jurisdiction", async () => {
    seedIncident("organization-1", "area-2");

    await expect(listTrustedIncidentMedia(principal, "incident-1")).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(addAudit).not.toHaveBeenCalled();
    expect(database.collection).toHaveBeenCalledTimes(1);
  });

  it("allows a member in the incident's organization and jurisdiction", async () => {
    seedIncident("organization-1", "area-1");

    await expect(listTrustedIncidentMedia(principal, "incident-1")).resolves.toEqual([]);

    expect(addAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sensitive_read.incident_media" }));
  });
});

describe("assignment state consistency", () => {
  it("sets the incident organization used by the scoped queue and media access", async () => {
    seedIncident("organization-1", "area-1");
    records.get("incidents/incident-1")!.status = "received";
    records.set("organizationMemberships/responder-1", {
      uid: "responder-fixture",
      organizationId: "organization-2",
      role: "responder",
      active: true,
    });

    await assignTrustedIncident({
      principal: { ...principal, role: "admin" },
      incidentId: "incident-1",
      responderUid: "responder-fixture",
      organizationId: "organization-2",
      commandKey: "assignment-fixture-001",
    });

    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "incidents/incident-1" }),
      expect.objectContaining({ organizationId: "organization-2", assignedOrganizationId: "organization-2" }),
    );
  });

  it.each([
    ["resolved incident", "resolved", "responder-fixture", "assignment-1"],
    ["reassigned incident", "assigned", "another-responder", "assignment-1"],
    ["newer offer to the same responder", "assigned", "responder-fixture", "newer-assignment"],
  ])("rejects an old offer for a %s", async (_label, status, assignedResponderUid, activeAssignmentId) => {
    seedIncident("organization-1", "area-1");
    Object.assign(records.get("incidents/incident-1")!, {
      status,
      assignedResponderUid,
      assignedOrganizationId: "organization-1",
      activeAssignmentId,
    });
    records.get("assignments/assignment-1")!.responderUid = "responder-fixture";
    const responder = {
      ...principal,
      uid: "responder-fixture",
      role: "responder",
      memberships: principal.memberships.map(membership => ({ ...membership, uid: "responder-fixture", role: "responder" as const })),
    };

    await expect(respondToTrustedAssignment({
      principal: responder,
      assignmentId: "assignment-1",
      decision: "accept",
      commandKey: "accept-fixture-001",
    })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(transaction.update).not.toHaveBeenCalled();
  });
});
