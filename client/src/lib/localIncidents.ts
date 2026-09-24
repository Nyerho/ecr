import type { LocalUser } from "./localAuth";

export type LocalIncident = {
  id: number;
  publicReference: string;
  category: string;
  status: string;
  priority: string;
  description: string;
  locationLabel: string | null;
  reporterPhone: string | null;
  reporterEmail: string | null;
  assignedOrganizationId: number | null;
  createdAt: string;
  version: number;
};

const INCIDENTS_KEY = "ecr-local-incidents";

function storageKey(user: LocalUser) {
  return `${INCIDENTS_KEY}:${user.email}`;
}

export function loadLocalIncidents(user: LocalUser | null): LocalIncident[] {
  if (!user) return [];
  try {
    const raw = localStorage.getItem(storageKey(user));
    return raw ? (JSON.parse(raw) as LocalIncident[]) : [];
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
  const incident: LocalIncident = {
    id: Date.now(),
    publicReference: `ECR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    category: input.category,
    status: "submitted",
    priority: "medium",
    description: input.description,
    locationLabel: input.locationLabel || null,
    reporterPhone: input.reporterPhone || null,
    reporterEmail: input.reporterEmail || null,
    assignedOrganizationId: null,
    createdAt: new Date().toISOString(),
    version: 1,
  };
  localStorage.setItem(storageKey(user), JSON.stringify([incident, ...current]));
  return incident;
}
