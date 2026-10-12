import { beforeAll, describe, expect, it } from "vitest";

process.env.FIREBASE_USE_EMULATORS = "true";
process.env.FIREBASE_PROJECT_ID = "demo-ecr";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const enabled = process.env.ECR_RUN_EMULATOR_TESTS === "true";

type TrustedCommands = typeof import("./trustedIncidentCommands");
let commands: TrustedCommands;
let firestore: ReturnType<typeof import("./_core/firebaseAdmin").getFirebaseFirestore>;

async function createEmulatorUser(email: string) {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-ecr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true }),
  });
  if (!response.ok) throw new Error(`Emulator Auth user creation failed: ${await response.text()}`);
  return (await response.json()) as { localId: string; idToken: string };
}

describe.skipIf(!enabled)("trusted Firebase commands against emulators", () => {
  beforeAll(async () => {
    commands = await import("./trustedIncidentCommands");
    const admin = await import("./_core/firebaseAdmin");
    firestore = admin.getFirebaseFirestore();
  });

  it("authenticates an emulator user and creates an auditable incident transaction", async () => {
    const user = await createEmulatorUser("citizen@example.test");
    const principal = await commands.authenticateBearerToken(`Bearer ${user.idToken}`);
    const result = await commands.createTrustedIncident({
      principal,
      category: "medical",
      description: "A person needs urgent assistance.",
      reporterPhone: "08012345678",
      locationLabel: "Community clinic",
      commandKey: "create-citizen-001",
    });

    expect(result.replayed).toBe(false);
    const incident = await firestore.collection("incidents").doc(result.id).get();
    expect(incident.data()).toMatchObject({ status: "received", version: 1, reporterUid: user.localId });
    expect(incident.data()?.reporterPhone).toBe("08012345678");

    const eventSnapshot = await firestore.collection("incidentEvents").where("incidentId", "==", result.id).get();
    const auditSnapshot = await firestore.collection("auditEvents").where("resourceId", "==", result.id).get();
    const publicTracking = await firestore.collection("publicTracking").doc(result.publicReference).get();
    expect(eventSnapshot.size).toBe(1);
    expect(auditSnapshot.size).toBe(1);
    expect(publicTracking.data()).not.toHaveProperty("reporterPhone");
    expect(publicTracking.data()).not.toHaveProperty("description");
  });

  it("replays the same idempotent create command without creating a duplicate", async () => {
    const user = await createEmulatorUser("replay@example.test");
    const principal = await commands.authenticateBearerToken(`Bearer ${user.idToken}`);
    const input = {
      principal,
      category: "fire",
      description: "Smoke is visible near the entrance.",
      reporterEmail: "replay@example.test",
      commandKey: "create-replay-001",
    };
    const first = await commands.createTrustedIncident(input);
    const second = await commands.createTrustedIncident(input);
    const incidents = await firestore.collection("incidents").where("reporterUid", "==", user.localId).get();

    expect(second).toMatchObject({ id: first.id, publicReference: first.publicReference, replayed: true });
    expect(incidents.size).toBe(1);
  });

  it("requires active admin authorization for status transitions and rejects stale versions", async () => {
    const citizen = await createEmulatorUser("transition-citizen@example.test");
    const citizenPrincipal = await commands.authenticateBearerToken(`Bearer ${citizen.idToken}`);
    const incident = await commands.createTrustedIncident({
      principal: citizenPrincipal,
      category: "security",
      description: "A security incident needs review.",
      reporterEmail: "transition-citizen@example.test",
      commandKey: "create-transition-001",
    });

    await expect(commands.transitionTrustedIncident({
      principal: citizenPrincipal,
      incidentId: incident.id,
      nextStatus: "triaged",
      expectedVersion: 1,
      commandKey: "transition-citizen-001",
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    const admin = await createEmulatorUser("admin@example.test");
    await firestore.collection("admins").doc(admin.localId).set({ active: true });
    const adminPrincipal = await commands.authenticateBearerToken(`Bearer ${admin.idToken}`);
    const transitioned = await commands.transitionTrustedIncident({
      principal: adminPrincipal,
      incidentId: incident.id,
      nextStatus: "triaged",
      expectedVersion: 1,
      commandKey: "transition-admin-001",
    });
    expect(transitioned).toMatchObject({ status: "triaged", version: 2, replayed: false });

    await expect(commands.transitionTrustedIncident({
      principal: adminPrincipal,
      incidentId: incident.id,
      nextStatus: "assigned",
      expectedVersion: 1,
      commandKey: "transition-stale-001",
    })).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("provisions an active scoped membership and exposes it to the trusted principal", async () => {
    const admin = await createEmulatorUser("membership-admin@example.test");
    await firestore.collection("admins").doc(admin.localId).set({ active: true });
    const adminPrincipal = await commands.authenticateBearerToken(`Bearer ${admin.idToken}`);
    const responder = await createEmulatorUser("responder@example.test");
    const membership = await commands.upsertOrganizationMembership({
      principal: adminPrincipal,
      uid: responder.localId,
      organizationId: "org-ughelli",
      jurisdictionId: "jurisdiction-delta",
      role: "responder",
    });
    const responderPrincipal = await commands.authenticateBearerToken(`Bearer ${responder.idToken}`);

    expect(membership).toMatchObject({ uid: responder.localId, organizationId: "org-ughelli", role: "responder", active: true });
    expect(responderPrincipal.memberships).toEqual([expect.objectContaining({ organizationId: "org-ughelli", role: "responder" })]);
  });

  it("offers an assignment and lets only the scoped responder accept it", async () => {
    const admin = await createEmulatorUser("assignment-admin@example.test");
    await firestore.collection("admins").doc(admin.localId).set({ active: true });
    const adminPrincipal = await commands.authenticateBearerToken(`Bearer ${admin.idToken}`);
    const responder = await createEmulatorUser("assignment-responder@example.test");
    await commands.upsertOrganizationMembership({
      principal: adminPrincipal,
      uid: responder.localId,
      organizationId: "org-assignment",
      role: "responder",
    });
    const citizen = await createEmulatorUser("assignment-citizen@example.test");
    const citizenPrincipal = await commands.authenticateBearerToken(`Bearer ${citizen.idToken}`);
    const incident = await commands.createTrustedIncident({
      principal: citizenPrincipal,
      category: "rescue",
      description: "A person is trapped and needs rescue assistance.",
      reporterEmail: "assignment-citizen@example.test",
      commandKey: "create-assignment-001",
    });
    const assignment = await commands.assignTrustedIncident({
      principal: adminPrincipal,
      incidentId: incident.id,
      responderUid: responder.localId,
      organizationId: "org-assignment",
      commandKey: "assign-responder-001",
    });
    const responderPrincipal = await commands.authenticateBearerToken(`Bearer ${responder.idToken}`);
    const accepted = await commands.respondToTrustedAssignment({
      principal: responderPrincipal,
      assignmentId: assignment.id,
      decision: "accept",
      commandKey: "accept-assignment-001",
    });
    const incidentSnapshot = await firestore.collection("incidents").doc(incident.id).get();
    const assignmentSnapshot = await firestore.collection("assignments").doc(assignment.id).get();

    expect(assignment).toMatchObject({ incidentId: incident.id, status: "offered", version: 1 });
    expect(accepted).toMatchObject({ status: "accepted", version: 2, replayed: false });
    expect(incidentSnapshot.data()).toMatchObject({ status: "responding", assignedOrganizationId: "org-assignment", assignedResponderUid: responder.localId });
    expect(assignmentSnapshot.data()).toMatchObject({ status: "accepted", decision: "accept", version: 2 });
  });
});
