import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getFirebaseFirestore } from "./_core/firebaseAdmin";
import { CommandError, type CommandPrincipal } from "./trustedIncidentCommands";

function requireOperator(principal: CommandPrincipal) {
  if (!['admin', 'dispatcher', 'coordinator'].includes(principal.role)) throw new CommandError('FORBIDDEN', 'Analytics access is restricted to operational roles.');
}

function dateValue(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate: () => Date }).toDate();
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function getTrustedAnalytics(principal: CommandPrincipal, requestedDays: unknown) {
  requireOperator(principal);
  const days = Number(requestedDays ?? 30);
  if (!Number.isInteger(days) || days < 7 || days > 90) throw new CommandError('INVALID_ARGUMENT', 'Analytics period must be between 7 and 90 days.');
  const database = getFirebaseFirestore();
  const cutoff = new Date(Date.now() - days * 86_400_000);
  let query = database.collection('incidents').orderBy('createdAt', 'desc').limit(5000);
  if (principal.role !== 'admin' && principal.organizationId) query = database.collection('incidents').where('organizationId', '==', principal.organizationId).orderBy('createdAt', 'desc').limit(5000) as typeof query;
  const snapshot = await query.get();
  const incidents: Array<DocumentData & { id: string }> = snapshot.docs.map(document => ({ id: document.id, ...document.data() } as DocumentData & { id: string })).filter(incident => { const created = dateValue(incident.createdAt); return Boolean(created && created >= cutoff); });
  const byStatus = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byDay = new Map<string, number>();
  const byOrganization = new Map<string, number>();
  let resolved = 0;
  let resolutionHours = 0;
  let resolutionSamples = 0;
  for (const incident of incidents) {
    const status = String(incident.status ?? 'unknown');
    const category = String(incident.category ?? 'other');
    const created = dateValue(incident.createdAt);
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    if (created) byDay.set(created.toISOString().slice(0, 10), (byDay.get(created.toISOString().slice(0, 10)) ?? 0) + 1);
    const organization = typeof incident.organizationId === 'string' && incident.organizationId ? incident.organizationId : 'unassigned';
    byOrganization.set(organization, (byOrganization.get(organization) ?? 0) + 1);
    if (['resolved', 'closed'].includes(status)) resolved += 1;
    const events = Array.isArray(incident.events) ? incident.events as DocumentData[] : [];
    const resolvedEvent = events.find(event => ['resolved', 'closed'].includes(String(event?.newValue ?? event?.status)));
    const resolvedAt = dateValue(resolvedEvent?.createdAt);
    if (created && resolvedAt && resolvedAt >= created) { resolutionHours += (resolvedAt.getTime() - created.getTime()) / 3_600_000; resolutionSamples += 1; }
  }
  await database.collection('auditEvents').add({ action: 'analytics.viewed', actorUid: principal.uid, resourceType: 'analytics', resourceId: principal.organizationId ?? 'all', result: 'success', metadata: { days, incidentCount: incidents.length }, createdAt: FieldValue.serverTimestamp() });
  const sortEntries = (map: Map<string, number>) => Array.from(map.entries()).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
  return { periodDays: days, generatedAt: new Date().toISOString(), totals: { incidents: incidents.length, active: incidents.filter(incident => !['resolved', 'closed', 'cancelled'].includes(String(incident.status))).length, resolved, resolutionRate: incidents.length ? Math.round((resolved / incidents.length) * 100) : 0, averageResolutionHours: resolutionSamples ? Math.round((resolutionHours / resolutionSamples) * 10) / 10 : null }, byStatus: sortEntries(byStatus), byCategory: sortEntries(byCategory), byOrganization: sortEntries(byOrganization).slice(0, 20), daily: Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })) };
}
