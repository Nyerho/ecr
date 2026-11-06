export type ReportFormData = {
  description: string;
  locationLabel: string;
  lat: string;
  lng: string;
  people: string;
  name: string;
  phone: string;
  email: string;
  photos: string[];
};

export function reportHistoryKey(uid: string) {
  return `ecr-reports:${uid}`;
}

export function getDraftReference(
  saved: unknown,
  createReference: () => string
) {
  return typeof saved === "string" && /^ECR-\d{4}-[A-Z0-9]+$/.test(saved)
    ? saved
    : createReference();
}

export function normalizeIncidentCategory(category: string) {
  return category === "violence" ? "security" : category;
}

function coordinate(value: string, max: number, label: string) {
  const text = value.trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || Math.abs(number) > max) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return String(number);
}

export function createIncidentPayload(
  form: ReportFormData,
  category: string,
  commandKey: string
) {
  const description = form.description.trim();
  if (description.length < 4 || description.length > 2000) {
    throw new Error("Describe what is happening using 4 to 2,000 characters.");
  }
  const latitude = coordinate(form.lat, 90, "latitude");
  const longitude = coordinate(form.lng, 180, "longitude");
  if ((latitude === null) !== (longitude === null)) {
    throw new Error("Enter both latitude and longitude, or leave both blank.");
  }
  const peopleAffected = form.people.trim() ? Number(form.people) : null;
  if (
    peopleAffected !== null &&
    (!Number.isSafeInteger(peopleAffected) || peopleAffected < 0)
  ) {
    throw new Error("Enter a whole, non-negative number of people affected.");
  }
  return {
    commandKey,
    category: normalizeIncidentCategory(category),
    description,
    locationLabel: form.locationLabel.trim() || null,
    latitude,
    longitude,
    reporterName: form.name.trim(),
    reporterPhone: form.phone.trim(),
    reporterEmail: form.email.trim(),
    peopleAffected,
  };
}

export function parseIncidentReceipt(value: unknown) {
  if (typeof value !== "object" || value === null) {
    throw new Error("The incident service returned an invalid report receipt.");
  }
  const receipt = value as Record<string, unknown>;
  if (
    typeof receipt.id !== "string" ||
    !receipt.id ||
    typeof receipt.publicReference !== "string" ||
    !/^ECR-\d{4}-[A-Z0-9]+$/.test(receipt.publicReference)
  ) {
    throw new Error("The incident service returned an invalid report receipt.");
  }
  return { id: receipt.id, publicReference: receipt.publicReference };
}

export async function deleteIncidentViaApi(
  input: { baseUrl: string; incidentId: string; token: string },
  request: typeof fetch = fetch
) {
  const response = await request(
    `${input.baseUrl.replace(/\/+$/, "")}/api/v1/incidents/${encodeURIComponent(input.incidentId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${input.token}` } }
  );
  const value: unknown = await response.json().catch(() => null);
  const result =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : `The report could not be deleted (${response.status}).`
    );
  }
  if (result.id !== input.incidentId || result.deleted !== true) {
    throw new Error(
      "The incident service did not confirm that the report was deleted."
    );
  }
}

export function updatedReportStatuses(
  reports: Array<{ publicReference: string; status: string }>,
  previous: Record<string, string>
) {
  return reports.filter(
    report =>
      previous[report.publicReference] &&
      previous[report.publicReference] !== report.status
  );
}
