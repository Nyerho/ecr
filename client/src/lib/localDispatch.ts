import type { LocalIncident } from "./localIncidents";

export const DISPATCHER_SESSION_KEY = "ecr-local-dispatcher";
const INCIDENT_PREFIX = "ecr-local-incidents:";
const ORGANIZATIONS = [
  { id: 1, name: "Lagos Emergency Coordination", type: "dispatch" },
  { id: 2, name: "Community Medical Response", type: "medical" },
  { id: 3, name: "Fire & Rescue Pilot Unit", type: "fire" },
];

export function getLocalOrganizations() {
  return ORGANIZATIONS;
}

export function isLocalDispatcher() {
  return localStorage.getItem(DISPATCHER_SESSION_KEY) === "active";
}

export function setLocalDispatcher(active: boolean) {
  if (active) localStorage.setItem(DISPATCHER_SESSION_KEY, "active");
  else localStorage.removeItem(DISPATCHER_SESSION_KEY);
}

function normalize(incident: LocalIncident): LocalIncident {
  return {
    ...incident,
    priority: incident.priority || "medium",
    jurisdiction: incident.jurisdiction || "Pilot area",
    assignedOrganizationId: incident.assignedOrganizationId ?? null,
    events: (incident.events ?? [{ id: `${incident.id}-submitted`, status: "submitted", label: "Report submitted", createdAt: incident.createdAt, actor: "citizen", previousValue: null, newValue: "submitted" }]).map(event => ({
      ...event,
      actor: event.actor ?? "system",
    })),
  };
}

export function loadAllLocalIncidents(): LocalIncident[] {
  const incidents: LocalIncident[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(INCIDENT_PREFIX)) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "[]") as LocalIncident[];
      incidents.push(...parsed.map(normalize));
    } catch {
      // Ignore malformed prototype data and keep the queue usable.
    }
  }
  return incidents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function updateSharedLocalIncident(id: number, changes: Partial<Pick<LocalIncident, "status" | "priority" | "jurisdiction" | "assignedOrganizationId">> & { action?: string; actor?: string; expectedVersion?: number }): LocalIncident | null {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(INCIDENT_PREFIX)) continue;
    try {
      const incidents = (JSON.parse(localStorage.getItem(key) ?? "[]") as LocalIncident[]).map(normalize);
      const current = incidents.find(incident => incident.id === id);
      if (!current) continue;
      if (changes.expectedVersion !== undefined && current.version !== changes.expectedVersion) return null;
      const now = new Date().toISOString();
      const { action: requestedAction, actor: _actor, expectedVersion: _expectedVersion, ...fieldChanges } = changes;
      const nextStatus = fieldChanges.status ?? current.status;
      const statusChanged = nextStatus !== current.status;
      const action = requestedAction ?? (statusChanged ? `Status changed to ${nextStatus}` : "Incident updated");
      const changedField = fieldChanges.status !== undefined ? "status" : fieldChanges.priority !== undefined ? "priority" : fieldChanges.jurisdiction !== undefined ? "jurisdiction" : "assignedOrganizationId";
      const previousValue = String(current[changedField] ?? "");
      const newValue = String(fieldChanges[changedField] ?? current[changedField] ?? "");
      const updated: LocalIncident = {
        ...current,
        ...fieldChanges,
        status: nextStatus,
        version: current.version + 1,
        events: [...current.events, { id: `${id}-dispatch-${Date.now()}`, status: nextStatus, label: action, createdAt: now, actor: "dispatcher", previousValue, newValue }],
      };
      localStorage.setItem(key, JSON.stringify(incidents.map(incident => incident.id === id ? updated : incident)));
      return updated;
    } catch {
      continue;
    }
  }
  return null;
}
