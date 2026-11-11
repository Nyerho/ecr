import assert from "node:assert/strict";
import test from "node:test";
import {
  createIncidentPayload,
  deleteIncidentViaApi,
  getDraftReference,
  parseIncidentReceipt,
  reportHistoryKey,
  updatedReportStatuses,
} from "./reportData.ts";

const form = {
  description: "A person needs assistance.",
  locationLabel: "",
  lat: "",
  lng: "",
  people: "",
  name: "",
  phone: "",
  email: "",
  photos: [],
};

test("reports without optional fields remain valid Firestore data", () => {
  const payload = createIncidentPayload(form, "medical", "mobile-test-001");
  assert.equal(payload.locationLabel, null);
  assert.equal(payload.peopleAffected, null);
  assert.equal(payload.latitude, null);
  assert.equal(payload.longitude, null);
  assert(Object.values(payload).every(value => value !== undefined));
});

test("mobile protection reports and GPS coordinates follow the trusted API contract", () => {
  const payload = createIncidentPayload(
    { ...form, lat: "5.50", lng: "0", people: "2" },
    "violence",
    "mobile-test-002"
  );
  assert.equal(payload.category, "security");
  assert.equal(payload.latitude, "5.5");
  assert.equal(payload.longitude, "0");
  assert.equal(payload.peopleAffected, 2);
});

test("invalid or partial GPS locations and invalid affected counts are rejected", () => {
  for (const change of [
    { lat: "91", lng: "5" },
    { lat: "0" },
    { lat: "NaN", lng: "2" },
    { people: "-1" },
    { people: "1.5" },
  ]) {
    assert.throws(() =>
      createIncidentPayload(
        { ...form, ...change },
        "medical",
        "mobile-test-003"
      )
    );
  }
});

test("the server receipt supplies the real document ID and public tracking reference", () => {
  assert.deepEqual(
    parseIncidentReceipt({
      id: "server-document",
      publicReference: "ECR-2026-A12345",
      replayed: false,
    }),
    {
      id: "server-document",
      publicReference: "ECR-2026-A12345",
    }
  );
  assert.throws(() => parseIncidentReceipt({ id: "server-document" }));
  assert.throws(() => parseIncidentReceipt(null));
});

test("report history is separated by authenticated account", () => {
  assert.notEqual(
    reportHistoryKey("first-user"),
    reportHistoryKey("second-user")
  );
});

test("status updates ignore first loads and report later transitions once", () => {
  const reports = [
    { publicReference: "ECR-2026-A12345", status: "responding" },
  ];
  assert.deepEqual(updatedReportStatuses(reports, {}), []);
  assert.deepEqual(
    updatedReportStatuses(reports, { "ECR-2026-A12345": "received" }),
    reports
  );
  assert.deepEqual(
    updatedReportStatuses(reports, { "ECR-2026-A12345": "responding" }),
    []
  );
});

test("device-only photo URIs are not included in incident payloads", () => {
  const payload = createIncidentPayload(
    { ...form, photos: ["file:///local-photo.jpg"] },
    "medical",
    "mobile-test-004"
  );
  assert.equal("photos" in payload, false);
});

test("a saved draft reuses its incident key after retries and relaunch", () => {
  let generated = 0;
  const createReference = () => `ECR-2026-TEST${++generated}`;
  const reference = getDraftReference(null, createReference);
  const retryReference = getDraftReference(reference, createReference);
  const restored = JSON.parse(JSON.stringify({ reference, form }));
  const restoredReference = getDraftReference(
    restored.reference,
    createReference
  );
  assert.equal(retryReference, reference);
  assert.equal(restoredReference, reference);
  assert.equal(generated, 1);
  assert.equal(
    createIncidentPayload(form, "medical", restoredReference).commandKey,
    reference
  );
});

test("new, discarded, and invalid drafts receive a fresh incident key", () => {
  let generated = 0;
  const createReference = () => `ECR-2026-TEST${++generated}`;
  const first = getDraftReference(undefined, createReference);
  assert.notEqual(getDraftReference(null, createReference), first);
  assert.notEqual(getDraftReference("invalid", createReference), first);
});

test("trusted deletion uses the selected incident ID and authenticated owner token", async () => {
  let called = false;
  await deleteIncidentViaApi(
    {
      baseUrl: "https://ecr.example.test/",
      incidentId: "incident/123",
      token: "test-owner-token",
    },
    async (url, options) => {
      called = true;
      assert.equal(
        url,
        "https://ecr.example.test/api/v1/incidents/incident%2F123"
      );
      assert.equal(options.method, "DELETE");
      assert.equal(options.headers.Authorization, "Bearer test-owner-token");
      return new Response(
        JSON.stringify({ id: "incident/123", deleted: true }),
        { status: 200 }
      );
    }
  );
  assert.equal(called, true);
});

test("failed or unconfirmed remote deletions are rejected", async () => {
  const input = {
    baseUrl: "https://ecr.example.test",
    incidentId: "incident-123",
    token: "test-owner-token",
  };
  for (const [status, body] of [
    [403, { error: "Only the reporter may delete this report." }],
    [200, { id: "another-incident", deleted: true }],
    [200, { id: "incident-123", deleted: false }],
  ]) {
    await assert.rejects(
      deleteIncidentViaApi(
        input,
        async () => new Response(JSON.stringify(body), { status })
      )
    );
  }
  await assert.rejects(
    deleteIncidentViaApi(input, async () => {
      throw new Error("Network unavailable");
    })
  );
});
