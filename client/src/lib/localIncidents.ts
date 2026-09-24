import type { LocalUser } from "./localAuth";

export type LocalIncidentEvent = {
  id: string;
  status: string;
  label: string;
  createdAt: string;
};

export type LocalIncident = {
  id: number;
  publicReference: string;
  category: string;
  status: string;
  priority: string;
  jurisdiction?: string;
  description: string;
  locationLabel: string | null;
  reporterPhone: string | null;
  reporterEmail: string | null;
  assignedOrganizationId: number | null;
  createdAt: string;
  version: number;
  events: LocalIncidentEvent[];
};

const INCIDENTS_KEY = "ecr-local-incidents";
const LIFECYCLE: Array<{ status: string; label: string }> = [
  { status: "submitted", label: "Report submitted" },
  { status: "received", label: "Received by ECR" },
  { status: "triaged", label: "Incident triaged" },
  { status: "assigned", label: "Response assigned" },
  { status: "responding", label: "Responder on the way" },
  { status: "arrived", label: "Responder arrived" },
  { status: "resolved", label: "Incident resolved" },
];

function storageKey(user: LocalUser) {
  return `${INCIDENTS_KEY}:${user.email}`;
}

export function loadLocalIncidents(user: LocalUser | null): LocalIncident[] {
  if (!user) return [];
  try {
    const raw = localStorage.getItem(storageKey(user));
    if (!raw) return [];
    return (JSON.parse(raw) as LocalIncident[]).map(incident => ({
      ...incident,
      events: incident.events ?? [{ id: `${incident.id}-submitted`, status: "submitted", label: "Report submitted", createdAt: incident.createdAt }],
    }));
  } catch {
    return [];
  }
}

export function createLocalIncident(user: LocalUser, input: {
  category: string;
  description: string;
  locationLabel?: string;
  reporterPhone?: string;
  reporterEmail?: string;
}): LocalIncident {
  const current = loadLocalIncidents(user);
  const createdAt = new Date().toISOString();
  const incident: LocalIncident = {
    id: Date.now(),
    publicReference: `ECR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    category: input.category,
    status: "submitted",
    priority: "medium",
    jurisdiction: "Pilot area",
    description: input.description,
    locationLabel: input.locationLabel || null,
    reporterPhone: input.reporterPhone || null,
    reporterEmail: input.reporterEmail || null,
    assignedOrganizationId: null,
    createdAt,
    version: 1,
    events: [{ id: `${Date.now()}-submitted`, status: "submitted", label: "Report submitted", createdAt }],
  };
  localStorage.setItem(storageKey(user), JSON.stringify([incident, ...current]));
  return incident;
}

export function advanceLocalIncident(user: LocalUser, incidentId: number): LocalIncident | null {
  const incidents = loadLocalIncidents(user);
  const current = incidents.find(incident => incident.id === incidentId);
  if (!current) return null;
  const currentIndex = LIFECYCLE.findIndex(step => step.status === current.status);
  const next = LIFECYCLE[currentIndex + 1];
  if (!next) return current;
  const now = new Date().toISOString();
  const updated: LocalIncident = {
    ...current,
    status: next.status,
    version: current.version + 1,
    events: [...current.events, { id: `${current.id}-${next.status}-${Date.now()}`, status: next.status, label: next.label, createdAt: now }],
  };
  localStorage.setItem(storageKey(user), JSON.stringify(incidents.map(incident => incident.id === incidentId ? updated : incident)));
  return updated;
}

export function getNextLocalStatus(status: string) {
  const index = LIFECYCLE.findIndex(step => step.status === status);
  return LIFECYCLE[index + 1]?.label ?? null;
}
