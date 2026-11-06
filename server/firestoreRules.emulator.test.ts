import { beforeAll, describe, expect, it } from "vitest";

process.env.FIREBASE_USE_EMULATORS = "true";
process.env.FIREBASE_PROJECT_ID = "demo-ecr";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const enabled = process.env.ECR_RUN_EMULATOR_TESTS === "true";
type EmulatorUser = { localId: string; idToken: string };
let citizen: EmulatorUser;
let other: EmulatorUser;
let admin: EmulatorUser;

async function createUser(): Promise<EmulatorUser> {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-ecr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!response.ok) throw new Error("Could not create an isolated emulator test user.");
  return response.json();
}

function writeDocument(user: EmulatorUser, collection: string, id: string, data: Record<string, string | boolean>) {
  const fields = Object.fromEntries(Object.entries(data).map(([key, value]) => [
    key, typeof value === "boolean" ? { booleanValue: value } : { stringValue: value },
  ]));
  return fetch(`http://127.0.0.1:8080/v1/projects/demo-ecr/databases/(default)/documents/${collection}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ fields }),
  });
}

function deleteDocuments(user: EmulatorUser, paths: string[]) {
  return fetch("http://127.0.0.1:8080/v1/projects/demo-ecr/databases/(default)/documents:commit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({
      writes: paths.map(path => ({ delete: `projects/demo-ecr/databases/(default)/documents/${path}` })),
    }),
  });
}

describe.skipIf(!enabled)("Firestore client authorization rules", () => {
  beforeAll(async () => {
    [citizen, other, admin] = await Promise.all([createUser(), createUser(), createUser()]);
    const { getFirebaseFirestore } = await import("./_core/firebaseAdmin");
    await getFirebaseFirestore().collection("admins").doc(admin.localId).set({ active: true });
  });

  it("allows citizens to post ordinary community comments", async () => {
    const response = await writeDocument(citizen, "chatMessages", "rules-comment", {
      authorUid: citizen.localId, kind: "comment", visibility: "public", text: "A safe community update.",
    });
    expect(response.status).toBe(200);
  });

  it("rejects a citizen impersonating a verified ECR update", async () => {
    const response = await writeDocument(citizen, "chatMessages", "rules-forged-admin", {
      authorUid: citizen.localId, kind: "admin_update", visibility: "public", text: "A forged verified update.",
    });
    expect(response.status).toBe(403);
  });

  it("allows an active administrator to publish ECR updates", async () => {
    const response = await writeDocument(admin, "chatMessages", "rules-admin-update", {
      authorUid: admin.localId, kind: "admin_update", visibility: "public", text: "A verified ECR update.",
    });
    expect(response.status).toBe(200);
  });

  it("rejects forged authors and unsupported verification metadata", async () => {
    const forgedAuthor = await writeDocument(citizen, "chatMessages", "rules-forged-author", {
      authorUid: admin.localId, kind: "comment", visibility: "public", text: "A forged author.",
    });
    const forgedMetadata = await writeDocument(citizen, "chatMessages", "rules-forged-metadata", {
      authorUid: citizen.localId, kind: "comment", visibility: "public", text: "A forged badge.", verified: true,
    });
    expect(forgedAuthor.status).toBe(403);
    expect(forgedMetadata.status).toBe(403);
  });

  it("allows mobile comment metadata and batched-report alert fields", async () => {
    const { getFirebaseFirestore } = await import("./_core/firebaseAdmin");
    await getFirebaseFirestore().collection("publicTracking").doc("ECR-2026-RULES01").set({ public: true, ownerUid: citizen.localId });
    const comment = await writeDocument(citizen, "chatMessages", "rules-mobile-comment", {
      authorUid: citizen.localId, kind: "comment", visibility: "public", text: "A community observation.",
      category: "hazard", urgency: "medium", status: "open", locationLabel: "Test area",
    });
    const alert = await writeDocument(citizen, "chatMessages", "rules-report-alert", {
      authorUid: citizen.localId, kind: "alert", visibility: "public", text: "A report was submitted.",
      publicReference: "ECR-2026-RULES01", category: "medical", locationLabel: "Test area",
    });
    expect(comment.status).toBe(200);
    expect(alert.status).toBe(200);
  });

  it("rejects another account taking ownership of a registered push token", async () => {
    const initial = await writeDocument(citizen, "deviceTokens", "rules-device-token", {
      uid: citizen.localId, token: "test-push-token", platform: "android",
    });
    const takeover = await writeDocument(other, "deviceTokens", "rules-device-token", {
      uid: other.localId, token: "test-push-token", platform: "android",
    });
    const ownerUpdate = await writeDocument(citizen, "deviceTokens", "rules-device-token", {
      uid: citizen.localId, token: "updated-test-push-token", platform: "android",
    });
    expect(initial.status).toBe(200);
    expect(takeover.status).toBe(403);
    expect(ownerUpdate.status).toBe(200);
  });

  it("lets only the report owner atomically remove a report, its tracking record, and official updates", async () => {
    const { getFirebaseFirestore } = await import("./_core/firebaseAdmin");
    const database = getFirebaseFirestore();
    const incidentId = "rules-delete-owned-incident";
    const reference = "ECR-2026-DELETE01";
    const alertId = "rules-delete-alert";
    const updateId = "rules-delete-admin-update";
    await Promise.all([
      database.collection("incidents").doc(incidentId).set({ reporterUid: citizen.localId, publicReference: reference, status: "submitted" }),
      database.collection("publicTracking").doc(reference).set({ public: true, ownerUid: citizen.localId, publicReference: reference }),
      database.collection("chatMessages").doc(alertId).set({ authorUid: citizen.localId, kind: "alert", visibility: "public", publicReference: reference, text: "Test report alert" }),
      database.collection("chatMessages").doc(updateId).set({ authorUid: admin.localId, kind: "admin_update", visibility: "public", publicReference: reference, text: "Test status update" }),
    ]);
    const paths = [`incidents/${incidentId}`, `publicTracking/${reference}`, `chatMessages/${alertId}`, `chatMessages/${updateId}`];
    const denied = await deleteDocuments(other, paths);
    expect(denied.status).toBe(403);
    expect((await database.collection("incidents").doc(incidentId).get()).exists).toBe(true);
    const deleted = await deleteDocuments(citizen, paths);
    expect(deleted.status).toBe(200);
    for (const path of paths) expect((await database.doc(path).get()).exists).toBe(false);
  });

  it("does not let a report owner delete updates linked to someone else's report", async () => {
    const { getFirebaseFirestore } = await import("./_core/firebaseAdmin");
    const database = getFirebaseFirestore();
    const reference = "ECR-2026-FOREIGN01";
    await database.collection("publicTracking").doc(reference).set({ public: true, ownerUid: other.localId, publicReference: reference });
    await database.collection("chatMessages").doc("rules-foreign-update").set({ authorUid: admin.localId, kind: "admin_update", visibility: "public", publicReference: reference, text: "Another report's update" });
    const denied = await deleteDocuments(citizen, ["chatMessages/rules-foreign-update"]);
    expect(denied.status).toBe(403);
    expect((await database.collection("chatMessages").doc("rules-foreign-update").get()).exists).toBe(true);
  });

  it("blocks direct deletion while the trusted backend is cleaning up the report", async () => {
    const { getFirebaseFirestore } = await import("./_core/firebaseAdmin");
    await getFirebaseFirestore().collection("incidents").doc("rules-deletion-pending").set({ reporterUid: citizen.localId, status: "submitted", deletionPending: true });
    const denied = await deleteDocuments(citizen, ["incidents/rules-deletion-pending"]);
    expect(denied.status).toBe(403);
  });

  it("allows an owner to delete a report whose public tracking record is already absent", async () => {
    const { getFirebaseFirestore } = await import("./_core/firebaseAdmin");
    const database = getFirebaseFirestore();
    const reference = "ECR-2026-MISSING01";
    await database.collection("incidents").doc("rules-missing-tracking").set({ reporterUid: citizen.localId, publicReference: reference, status: "submitted" });
    await database.collection("chatMessages").doc("rules-missing-tracking-alert").set({ authorUid: citizen.localId, kind: "alert", visibility: "public", publicReference: reference, text: "A prior report alert" });
    const missingTracking = await fetch(`http://127.0.0.1:8080/v1/projects/demo-ecr/databases/(default)/documents/publicTracking/${reference}`, {
      headers: { Authorization: `Bearer ${citizen.idToken}` },
    });
    expect(missingTracking.status).toBe(404);
    const deleted = await deleteDocuments(citizen, ["incidents/rules-missing-tracking", "chatMessages/rules-missing-tracking-alert"]);
    expect(deleted.status).toBe(200);
    expect((await database.collection("incidents").doc("rules-missing-tracking").get()).exists).toBe(false);
  });

  it("rejects new public updates when a report is being deleted or its tracking has been removed", async () => {
    const { getFirebaseFirestore } = await import("./_core/firebaseAdmin");
    const database = getFirebaseFirestore();
    const reference = "ECR-2026-PENDING01";
    await database.collection("publicTracking").doc(reference).set({ public: true, ownerUid: citizen.localId, deletionPending: true });
    const pendingUpdate = await writeDocument(admin, "chatMessages", "rules-late-pending-update", {
      authorUid: admin.localId, kind: "admin_update", visibility: "public", publicReference: reference, text: "A late status update",
    });
    expect(pendingUpdate.status).toBe(403);
    await database.collection("publicTracking").doc(reference).delete();
    const deletedUpdate = await writeDocument(admin, "chatMessages", "rules-late-deleted-update", {
      authorUid: admin.localId, kind: "admin_update", visibility: "public", publicReference: reference, text: "Another late update",
    });
    expect(deletedUpdate.status).toBe(403);
  });
});
