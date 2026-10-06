import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Mail,
  MessageCircle,
  LockKeyhole,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Share2,
  Phone,
  Trash2,
  Users,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import BrandLogo from "@/components/BrandLogo";
import CommunityChat from "@/components/CommunityChat";
import { Button } from "@/components/ui/button";
import {
  firebaseConfigured,
  ensurePublicTrackingRecord,
  subscribeToAdminCollection,
  updateFirestoreIncident,
  updateFirestoreUserRole,
  createFirestoreOrganization,
  createEmergencyContact,
  deleteEmergencyContact,
  ensureDefaultEmergencyContacts,
  subscribeToEmergencyContacts,
  writeFirestoreAudit,
  type EmergencyContactRecord,
  type FirebaseProfile,
  type FirestoreIncident,
  type UserRole,
} from "@/lib/firebase";
import { toast } from "sonner";

type Organization = {
  name: string;
  type: string;
  code: string;
  isActive?: boolean;
  isVerified?: boolean;
  createdAt?: unknown;
};
type AuditLog = {
  actorUid: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  createdAt?: unknown;
};
type EmergencyContactForm = {
  name: string;
  area: string;
  description: string;
  numbers: string;
  icon: EmergencyContactRecord["icon"];
};
type Tab =
  | "overview"
  | "incidents"
  | "community"
  | "users"
  | "organizations"
  | "contacts"
  | "audit";
const roles: UserRole[] = [
  "citizen",
  "dispatcher",
  "coordinator",
  "responder",
  "moderator",
];
const incidentStatusOptions = [
  ["submitted", "Report submitted"],
  ["received", "Seen by ECR"],
  ["triaged", "Authorities contacted"],
  ["assigned", "Response assigned"],
  ["responding", "Help on the way"],
  ["arrived", "Responder arrived"],
  ["resolved", "Resolved"],
  ["unable_to_verify", "Unable to verify"],
  ["duplicate", "Duplicate report"],
  ["cancelled", "Cancelled"],
] as const;

function dateLabel(value: unknown) {
  if (!value) return "—";
  const date =
    typeof value === "object" && value !== null && "toDate" in value
      ? (value as { toDate: () => Date }).toDate()
      : new Date(value as string | number);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
function toneForStatus(status: string) {
  if (["resolved", "closed"].includes(status))
    return "bg-slate-100 text-slate-600";
  if (["critical", "escalated"].includes(status))
    return "bg-rose-50 text-rose-700";
  return "bg-emerald-50 text-emerald-700";
}
function locationUrl(incident: FirestoreIncident) {
  if (!incident.latitude || !incident.longitude) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${incident.latitude},${incident.longitude}`)}`;
}
function incidentLocation(incident: FirestoreIncident) {
  if (incident.locationLabel) return incident.locationLabel;
  if (incident.latitude && incident.longitude)
    return `${incident.latitude}, ${incident.longitude}`;
  return "Location not provided";
}

export default function Admin() {
  const { user, loading } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: "/sign-in",
  });
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const [incidents, setIncidents] = useState<FirestoreIncident[]>([]);
  const [users, setUsers] = useState<FirebaseProfile[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<
    EmergencyContactRecord[]
  >([]);
  const [selectedIncident, setSelectedIncident] =
    useState<FirestoreIncident | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [orgForm, setOrgForm] = useState({
    name: "",
    type: "medical",
    code: "",
  });
  const [contactForm, setContactForm] = useState({
    name: "",
    area: "",
    description: "",
    numbers: "",
    icon: "default" as EmergencyContactRecord["icon"],
  });

  useEffect(() => {
    if (!user || user.role !== "admin" || !firebaseConfigured) return;
    let ready = 0;
    const markReady = () => {
      ready += 1;
      if (ready >= 5) setLoadingData(false);
    };
    const stops = [
      subscribeToAdminCollection<FirestoreIncident>("incidents", rows => {
        setIncidents(rows);
        void Promise.all(rows.map(ensurePublicTrackingRecord)).catch(
          () => undefined
        );
        markReady();
      }),
      subscribeToAdminCollection<FirebaseProfile>("users", rows => {
        setUsers(rows);
        markReady();
      }),
      subscribeToAdminCollection<Organization>("organizations", rows => {
        setOrganizations(rows);
        markReady();
      }),
      subscribeToAdminCollection<AuditLog>("auditLogs", rows => {
        setAuditLogs(rows);
        markReady();
      }),
      subscribeToEmergencyContacts(
        rows => {
          setEmergencyContacts(rows);
          markReady();
          if (!rows.length) {
            void ensureDefaultEmergencyContacts().catch(() => undefined);
          }
        },
        () => markReady()
      ),
    ];
    return () => stops.forEach(stop => stop());
  }, [user]);

  const stats = useMemo(
    () => ({
      activeIncidents: incidents.filter(
        incident =>
          !["resolved", "closed", "cancelled"].includes(incident.status)
      ).length,
      criticalIncidents: incidents.filter(
        incident =>
          ["critical", "escalated"].includes(incident.priority) ||
          incident.status === "escalated"
      ).length,
      operators: users.filter(profile => profile.role !== "citizen").length,
      activeOrganizations: organizations.filter(
        organization => organization.isActive !== false
      ).length,
    }),
    [incidents, organizations, users]
  );

  async function changeRole(profile: FirebaseProfile, role: UserRole) {
    if (!user || profile.role === role) return;
    try {
      await updateFirestoreUserRole(profile.uid, role, user.uid);
      await writeFirestoreAudit({
        actorUid: user.uid,
        action: "user.role_updated",
        resourceType: "user",
        resourceId: profile.uid,
        metadata: { previousRole: profile.role, role },
      });
      toast.success(`${profile.name || profile.email} is now ${role}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update the role."
      );
    }
  }

  async function addOrganization() {
    if (!user || !orgForm.name.trim() || !orgForm.code.trim()) return;
    try {
      await createFirestoreOrganization(
        {
          name: orgForm.name.trim(),
          code: orgForm.code.trim().toUpperCase(),
          type: orgForm.type,
        },
        user.uid
      );
      await writeFirestoreAudit({
        actorUid: user.uid,
        action: "organization.created",
        resourceType: "organization",
        metadata: {
          name: orgForm.name.trim(),
          code: orgForm.code.trim().toUpperCase(),
        },
      });
      setOrgForm({ name: "", type: "medical", code: "" });
      toast.success("Organization added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add organization."
      );
    }
  }

  async function addEmergencyContact() {
    if (
      !user ||
      !contactForm.name.trim() ||
      !contactForm.area.trim() ||
      !contactForm.description.trim() ||
      !contactForm.numbers.trim()
    )
      return;
    try {
      await createEmergencyContact(
        {
          name: contactForm.name.trim(),
          area: contactForm.area.trim(),
          description: contactForm.description.trim(),
          numbers: contactForm.numbers
            .split(",")
            .map(number => number.trim())
            .filter(Boolean),
          icon: contactForm.icon,
          tone:
            contactForm.icon === "medical"
              ? "border-emerald-100 bg-emerald-50/70 text-emerald-900"
              : contactForm.icon === "police"
                ? "border-blue-100 bg-blue-50/70 text-blue-900"
                : contactForm.icon === "fire"
                  ? "border-orange-100 bg-orange-50/70 text-orange-900"
                  : "border-slate-200 bg-slate-50 text-slate-900",
        },
        user.uid
      );
      await writeFirestoreAudit({
        actorUid: user.uid,
        action: "emergency_contact.created",
        resourceType: "emergencyContact",
        metadata: { name: contactForm.name.trim() },
      });
      setContactForm({
        name: "",
        area: "",
        description: "",
        numbers: "",
        icon: "default",
      });
      toast.success("Emergency contact added");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not add emergency contact."
      );
    }
  }

  async function removeEmergencyContact(contact: EmergencyContactRecord) {
    if (!user || !window.confirm(`Remove ${contact.name} from the directory?`))
      return;
    try {
      await deleteEmergencyContact(contact.id);
      await writeFirestoreAudit({
        actorUid: user.uid,
        action: "emergency_contact.deleted",
        resourceType: "emergencyContact",
        resourceId: contact.id,
        metadata: { name: contact.name },
      });
      toast.success("Emergency contact removed");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not remove emergency contact."
      );
    }
  }

  async function updateIncidentStatus(
    incident: FirestoreIncident,
    status: string
  ) {
    if (!user || incident.status === status) return;
    try {
      await updateFirestoreIncident(
        incident.id,
        { status },
        user.uid,
        incident.version,
        incident.status,
        incident.publicReference
      );
      await writeFirestoreAudit({
        actorUid: user.uid,
        action: "incident.status_updated",
        resourceType: "incident",
        resourceId: incident.id,
        metadata: { previousStatus: incident.status, status },
      });
      toast.success(
        `${incident.publicReference} is now ${status.replaceAll("_", " ")}`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update the incident."
      );
    }
  }

  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading secure admin session…
      </div>
    );
  if (!firebaseConfigured) return <SetupState />;
  if (!user) return null;
  if (user.role !== "admin")
    return <AccessDenied onBack={() => navigate("/app")} />;

  const navigation: Array<{ key: Tab; label: string; icon: typeof Activity }> =
    [
      { key: "overview", label: "Overview", icon: Activity },
      { key: "incidents", label: "Incidents", icon: FileText },
      { key: "community", label: "Community room", icon: MessageCircle },
      { key: "users", label: "Users & roles", icon: Users },
      { key: "organizations", label: "Organizations", icon: Building2 },
      { key: "contacts", label: "Emergency contacts", icon: Phone },
      { key: "audit", label: "Audit log", icon: ShieldCheck },
    ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <BrandLogo className="w-20" imageClassName="rounded-xl" />
            <span>
              <span className="block text-sm font-black tracking-[0.16em] text-primary">
                ECR ADMIN
              </span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                ECR control center
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-semibold text-muted-foreground sm:block">
              {user.email}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/app")}
            >
              Citizen app
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              Exit
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-2">
          <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-800">
              <LockKeyhole size={14} /> Protected
            </div>
            <p className="mt-2 text-xs leading-5 text-emerald-900/75">
              Every role change and operational action is recorded in the audit
              trail.
            </p>
          </div>
          {navigation.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black transition ${tab === item.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </aside>
        <section className="min-w-0">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">Administrator workspace</p>
              <h1 className="page-title">System overview</h1>
              <p className="page-description">
                Manage the ECR pilot without mixing operational data with
                presentation state.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={15} /> Refresh
            </Button>
          </div>
          {loadingData ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Connecting to operational data…
            </div>
          ) : (
            <>
              {tab === "overview" && (
                <Overview
                  stats={stats}
                  incidents={incidents}
                  organizations={organizations}
                  onSelect={setTab}
                />
              )}
              {tab === "incidents" && (
                <IncidentTable
                  incidents={incidents}
                  onSelect={setSelectedIncident}
                  onUpdateStatus={updateIncidentStatus}
                />
              )}
              {tab === "community" && <CommunityChat adminMode />}
              {tab === "users" && (
                <UserTable users={users} onChangeRole={changeRole} />
              )}
              {tab === "organizations" && (
                <OrganizationPanel
                  organizations={organizations}
                  form={orgForm}
                  setForm={setOrgForm}
                  onAdd={addOrganization}
                />
              )}
              {tab === "contacts" && (
                <EmergencyContactsPanel
                  contacts={emergencyContacts}
                  form={contactForm}
                  setForm={setContactForm}
                  onAdd={addEmergencyContact}
                  onRemove={removeEmergencyContact}
                />
              )}
              {tab === "audit" && <AuditTable logs={auditLogs} />}
            </>
          )}
        </section>
      </div>
      {selectedIncident && (
        <IncidentDetail
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onUpdateStatus={updateIncidentStatus}
        />
      )}
    </main>
  );
}

function Overview({
  stats,
  incidents,
  organizations,
  onSelect,
}: {
  stats: {
    activeIncidents: number;
    criticalIncidents: number;
    operators: number;
    activeOrganizations: number;
  };
  incidents: FirestoreIncident[];
  organizations: Organization[];
  onSelect: (tab: Tab) => void;
}) {
  const cards = [
    {
      label: "Active incidents",
      value: stats.activeIncidents,
      icon: FileText,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Critical attention",
      value: stats.criticalIncidents,
      icon: Clock3,
      tone: "bg-rose-50 text-rose-700",
    },
    {
      label: "Operators",
      value: stats.operators,
      icon: Users,
      tone: "bg-cyan-50 text-cyan-700",
    },
    {
      label: "Active organizations",
      value: stats.activeOrganizations,
      icon: Building2,
      tone: "bg-violet-50 text-violet-700",
    },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <span
                className={`grid size-10 place-items-center rounded-xl ${card.tone}`}
              >
                <Icon size={18} />
              </span>
              <p className="mt-5 text-3xl font-black tracking-tight">
                {card.value}
              </p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {card.label}
              </p>
            </div>
          );
        })}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Live queue</p>
              <h2 className="section-title">Recent incidents</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelect("incidents")}
            >
              View all
            </Button>
          </div>
          <div className="mt-4 divide-y divide-border">
            {incidents.slice(0, 5).map(incident => (
              <div
                key={incident.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black capitalize">
                    {incident.category.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {incident.publicReference} · {incident.description}
                  </p>
                  <p className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-foreground">
                    <MapPin size={12} className="shrink-0 text-emerald-600" />{" "}
                    {incidentLocation(incident)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black capitalize ${toneForStatus(incident.status)}`}
                >
                  {incident.status.replaceAll("_", " ")}
                </span>
              </div>
            ))}
            {!incidents.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No incidents yet.
              </p>
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="eyebrow">Directory</p>
          <h2 className="section-title">Response organizations</h2>
          <div className="mt-4 space-y-3">
            {organizations.slice(0, 5).map(org => (
              <div
                key={org.code}
                className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-3"
              >
                <div>
                  <p className="text-sm font-black">{org.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {org.code} · {org.type}
                  </p>
                </div>
                <CheckCircle2
                  size={16}
                  className={
                    org.isVerified
                      ? "text-emerald-600"
                      : "text-muted-foreground"
                  }
                />
              </div>
            ))}
            {!organizations.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Add the first organization.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function IncidentTable({
  incidents,
  onSelect,
  onUpdateStatus,
}: {
  incidents: FirestoreIncident[];
  onSelect: (incident: FirestoreIncident) => void;
  onUpdateStatus: (incident: FirestoreIncident, status: string) => void;
}) {
  return (
    <DataPanel
      eyebrow="Operational data"
      title="Incidents"
      description="Live incident records. Review reporter biodata, contact details, and keep the status trail current for the person reporting."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-3 py-3">Reference</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Reporter</th>
              <th className="px-3 py-3">Contact</th>
              <th className="px-3 py-3">Location</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map(incident => (
              <tr
                key={incident.id}
                className="border-b border-border last:border-0"
              >
                <td className="px-3 py-3 align-top font-black">
                  <button
                    type="button"
                    onClick={() => onSelect(incident)}
                    className="text-left text-primary hover:underline"
                  >
                    {incident.publicReference}
                  </button>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {dateLabel(incident.createdAt)}
                  </span>
                </td>
                <td className="px-3 py-3 align-top capitalize">
                  {incident.category.replaceAll("_", " ")}
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex items-start gap-2">
                    <UserRound size={15} className="mt-0.5 text-cyan-700" />
                    <div>
                      <p className="font-bold">
                        {incident.reporterName || "Name not provided"}
                      </p>
                      <p className="mt-1 max-w-[180px] truncate text-xs text-muted-foreground">
                        {incident.reporterUid}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="grid gap-1 text-xs">
                    {incident.reporterPhone ? (
                      <a
                        href={`tel:${incident.reporterPhone}`}
                        className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
                      >
                        <Phone size={12} /> {incident.reporterPhone}
                      </a>
                    ) : null}
                    {incident.reporterEmail ? (
                      <a
                        href={`mailto:${incident.reporterEmail}`}
                        className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
                      >
                        <Mail size={12} /> {incident.reporterEmail}
                      </a>
                    ) : null}
                    {!incident.reporterPhone && !incident.reporterEmail && (
                      <span className="text-muted-foreground">
                        Not provided
                      </span>
                    )}
                  </div>
                </td>
                <td className="max-w-[220px] px-3 py-3 align-top">
                  <div className="flex items-start gap-1.5">
                    <MapPin
                      size={15}
                      className="mt-0.5 shrink-0 text-emerald-600"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {incidentLocation(incident)}
                      </span>
                      {incident.latitude && incident.longitude && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {incident.latitude}, {incident.longitude}
                        </span>
                      )}
                      {locationUrl(incident) && (
                        <a
                          href={locationUrl(incident) ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800"
                        >
                          Open map <ExternalLink size={11} />
                        </a>
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <select
                    value={incident.status}
                    onChange={event =>
                      onUpdateStatus(incident, event.target.value)
                    }
                    className={`rounded-xl border border-border bg-card px-2.5 py-2 text-xs font-black capitalize outline-none focus:ring-2 focus:ring-primary ${toneForStatus(incident.status)}`}
                    aria-label={`Update status for ${incident.publicReference}`}
                  >
                    {incidentStatusOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    v{incident.version} · {incident.priority}
                  </p>
                </td>
                <td className="px-3 py-3 align-top">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onSelect(incident)}
                  >
                    View report
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!incidents.length && <EmptyState text="No incidents found." />}
      </div>
    </DataPanel>
  );
}

function IncidentDetail({
  incident,
  onClose,
  onUpdateStatus,
}: {
  incident: FirestoreIncident;
  onClose: () => void;
  onUpdateStatus: (incident: FirestoreIncident, status: string) => void;
}) {
  const [copiedOutreach, setCopiedOutreach] = useState(false);
  const publicUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/?report=${encodeURIComponent(incident.publicReference)}#track-report`;
  const outreachText = `ECR emergency update\n${incident.publicReference} · ${incident.category.replaceAll("_", " ")} · ${incident.status.replaceAll("_", " ")}\nLocation: ${incidentLocation(incident)}\nTrack status: ${publicUrl}`;

  async function copyOutreach() {
    await navigator.clipboard?.writeText(outreachText);
    setCopiedOutreach(true);
    window.setTimeout(() => setCopiedOutreach(false), 1800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Incident details</p>
            <h2 className="mt-1 text-2xl font-black">
              {incident.publicReference}
            </h2>
            <p className="mt-1 text-sm capitalize text-muted-foreground">
              {incident.category.replaceAll("_", " ")} ·{" "}
              {dateLabel(incident.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-muted-foreground hover:bg-muted"
            aria-label="Close incident details"
          >
            <X size={20} />
          </button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-800">
              Reporter biodata
            </p>
            <p className="mt-3 text-lg font-black">
              {incident.reporterName || "Name not provided"}
            </p>
            <p className="mt-1 break-all text-xs text-cyan-950/70">
              Reporter ID: {incident.reporterUid}
            </p>
            <div className="mt-4 grid gap-2 text-sm">
              {incident.reporterPhone ? (
                <a
                  href={`tel:${incident.reporterPhone}`}
                  className="inline-flex items-center gap-2 font-bold text-primary hover:underline"
                >
                  <Phone size={15} /> {incident.reporterPhone}
                </a>
              ) : null}
              {incident.reporterEmail ? (
                <a
                  href={`mailto:${incident.reporterEmail}`}
                  className="inline-flex items-center gap-2 font-bold text-primary hover:underline"
                >
                  <Mail size={15} /> {incident.reporterEmail}
                </a>
              ) : null}
              {!incident.reporterPhone && !incident.reporterEmail && (
                <span className="text-sm text-muted-foreground">
                  No contact details provided.
                </span>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
              Update for reporter
            </p>
            <label className="mt-3 block text-sm font-bold">
              Current status
              <select
                value={incident.status}
                onChange={event => onUpdateStatus(incident, event.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-primary"
              >
                {incidentStatusOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              The reporter sees this status and the timeline update live in
              their incident history.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
            Report
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
            {incident.description}
          </p>
          <p className="mt-4 inline-flex items-center gap-2 text-sm font-bold">
            <MapPin size={15} className="text-emerald-600" />{" "}
            {incidentLocation(incident)}
          </p>
        </div>
        <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700">
              <Share2 size={17} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-800">
                Public outreach
              </p>
              <p className="mt-1 text-xs leading-5 text-violet-950/75">
                Share only the emergency category, status, location, reference,
                and public tracking link. Reporter biodata is never included.
                Platforms still require an authorized human to review and
                publish.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyOutreach}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white hover:bg-violet-800"
            >
              {copiedOutreach ? <Check size={14} /> : <Copy size={14} />}
              {copiedOutreach ? "Copied" : "Copy safe update"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(outreachText)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl bg-[#25D366] px-3 py-2 text-xs font-black text-white hover:bg-[#1ebe5d]"
            >
              WhatsApp
            </a>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(outreachText)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-700"
            >
              X / Twitter
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}&quote=${encodeURIComponent(outreachText)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white hover:bg-blue-800"
            >
              Facebook
            </a>
            <a
              href="https://www.tiktok.com/@emergency_com_response"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl bg-black px-3 py-2 text-xs font-black text-white hover:bg-slate-800"
            >
              TikTok page
            </a>
            <a
              href="https://whatsapp.com/channel/0029VbEChke5a246BfQBdw0G"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800"
            >
              WhatsApp channel
            </a>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
            Live status timeline
          </p>
          <div className="mt-4 space-y-3">
            {(incident.events ?? [])
              .slice()
              .reverse()
              .map((event, index) => (
                <div key={`${event.label}-${index}`} className="flex gap-3">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500" />
                  <div>
                    <p className="text-sm font-bold">{event.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {dateLabel(event.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            {!incident.events?.length && (
              <p className="text-sm text-muted-foreground">
                No timeline events yet.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
function UserTable({
  users,
  onChangeRole,
}: {
  users: FirebaseProfile[];
  onChangeRole: (profile: FirebaseProfile, role: UserRole) => void;
}) {
  return (
    <DataPanel
      eyebrow="Access control"
      title="Users & roles"
      description="Non-admin roles are stored in users. Admin access is controlled separately by the admins collection."
    >
      <div className="divide-y divide-border">
        {users.map(profile => (
          <div
            key={profile.uid}
            className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
          >
            <div>
              <p className="text-sm font-black">
                {profile.name || "Unnamed user"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {profile.email} · {profile.uid}
              </p>
            </div>
            <select
              value={profile.role}
              onChange={event =>
                onChangeRole(profile, event.target.value as UserRole)
              }
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-black capitalize outline-none focus:ring-2 focus:ring-ring/50"
            >
              {roles.map(role => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
        ))}
        {!users.length && <EmptyState text="No users found." />}
      </div>
    </DataPanel>
  );
}
function OrganizationPanel({
  organizations,
  form,
  setForm,
  onAdd,
}: {
  organizations: Organization[];
  form: { name: string; type: string; code: string };
  setForm: (form: { name: string; type: string; code: string }) => void;
  onAdd: () => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <DataPanel
        eyebrow="Directory"
        title="Add organization"
        description="Create a response organization in the response directory."
      >
        <div className="space-y-4">
          <label className="field-label">
            Name
            <input
              className="field-control"
              value={form.name}
              onChange={event => setForm({ ...form, name: event.target.value })}
              placeholder="Lagos Medical Response"
            />
          </label>
          <label className="field-label">
            Code
            <input
              className="field-control uppercase"
              value={form.code}
              onChange={event => setForm({ ...form, code: event.target.value })}
              placeholder="LMR"
            />
          </label>
          <label className="field-label">
            Type
            <select
              className="field-control"
              value={form.type}
              onChange={event => setForm({ ...form, type: event.target.value })}
            >
              <option value="medical">Medical</option>
              <option value="fire">Fire</option>
              <option value="police">Police</option>
              <option value="dispatch">Dispatch</option>
              <option value="community">Community</option>
              <option value="other">Other</option>
            </select>
          </label>
          <Button
            className="w-full"
            onClick={onAdd}
            disabled={!form.name.trim() || !form.code.trim()}
          >
            <Building2 size={16} /> Add organization
          </Button>
        </div>
      </DataPanel>
      <DataPanel
        eyebrow="Directory"
        title="Organizations"
        description="Active and verified status is visible to authorized operators."
      >
        <div className="space-y-3">
          {organizations.map(org => (
            <div
              key={org.code}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-4"
            >
              <div>
                <p className="text-sm font-black">{org.name}</p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {org.code} · {org.type}
                </p>
              </div>
              <div className="flex gap-2">
                {org.isVerified && (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
                    Verified
                  </span>
                )}
                <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-black text-muted-foreground">
                  {org.isActive === false ? "Inactive" : "Active"}
                </span>
              </div>
            </div>
          ))}
          {!organizations.length && (
            <EmptyState text="No organizations found." />
          )}
        </div>
      </DataPanel>
    </div>
  );
}
function EmergencyContactsPanel({
  contacts,
  form,
  setForm,
  onAdd,
  onRemove,
}: {
  contacts: EmergencyContactRecord[];
  form: EmergencyContactForm;
  setForm: (form: EmergencyContactForm) => void;
  onAdd: () => void;
  onRemove: (contact: EmergencyContactRecord) => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <DataPanel
        eyebrow="Public directory"
        title="Add emergency contact"
        description="Publish a verified authority, hospital, responder, or support contact to the citizen directory."
      >
        <div className="space-y-4">
          <label className="field-label">
            Name
            <input
              className="field-control"
              value={form.name}
              onChange={event => setForm({ ...form, name: event.target.value })}
              placeholder="Ughelli rescue service"
            />
          </label>
          <label className="field-label">
            Area or department
            <input
              className="field-control"
              value={form.area}
              onChange={event => setForm({ ...form, area: event.target.value })}
              placeholder="Fire and rescue · Ughelli"
            />
          </label>
          <label className="field-label">
            Description
            <textarea
              className="field-control min-h-24"
              value={form.description}
              onChange={event =>
                setForm({ ...form, description: event.target.value })
              }
              placeholder="What should residents contact this service for?"
            />
          </label>
          <label className="field-label">
            Phone numbers
            <input
              className="field-control"
              value={form.numbers}
              onChange={event => setForm({ ...form, numbers: event.target.value })}
              placeholder="112, 0803 123 4567"
            />
            <span className="text-[11px] font-medium text-muted-foreground">
              Separate multiple numbers with commas.
            </span>
          </label>
          <label className="field-label">
            Directory icon
            <select
              className="field-control"
              value={form.icon}
              onChange={event =>
                setForm({
                  ...form,
                  icon: event.target.value as EmergencyContactRecord["icon"],
                })
              }
            >
              <option value="default">General support</option>
              <option value="medical">Medical</option>
              <option value="police">Police / security</option>
              <option value="fire">Fire / rescue</option>
            </select>
          </label>
          <Button
            className="w-full"
            onClick={onAdd}
            disabled={
              !form.name.trim() ||
              !form.area.trim() ||
              !form.description.trim() ||
              !form.numbers.trim()
            }
          >
            <Phone size={16} /> Add emergency contact
          </Button>
        </div>
      </DataPanel>
      <DataPanel
        eyebrow="Public directory"
        title="Published emergency contacts"
        description="Removing a contact takes it out of the citizen app immediately."
      >
        <div className="space-y-3">
          {contacts.map(contact => (
            <div
              key={contact.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-black">{contact.name}</p>
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  {contact.area}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {contact.numbers.join(" · ")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                onClick={() => onRemove(contact)}
              >
                <Trash2 size={14} /> Remove
              </Button>
            </div>
          ))}
          {!contacts.length && <EmptyState text="No emergency contacts published." />}
        </div>
      </DataPanel>
    </div>
  );
}
function AuditTable({ logs }: { logs: AuditLog[] }) {
  return (
    <DataPanel
      eyebrow="Governance"
      title="Audit log"
      description="Administrative actions are recorded separately from operational records."
    >
      <div className="divide-y divide-border">
        {logs.map((log, index) => (
          <div
            key={`${log.resourceId}-${index}`}
            className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-black">{log.action}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {log.resourceType}
                {log.resourceId ? ` · ${log.resourceId}` : ""} · actor{" "}
                {log.actorUid}
              </p>
            </div>
            <time className="text-xs font-semibold text-muted-foreground">
              {dateLabel(log.createdAt)}
            </time>
          </div>
        ))}
        {!logs.length && <EmptyState text="No audit events found." />}
      </div>
    </DataPanel>
  );
}
function DataPanel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="section-title">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
      {text}
    </div>
  );
}
function SetupState() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-card p-8 text-center shadow-sm">
        <BrandLogo
          variant="3d"
          className="mx-auto w-28"
          imageClassName="rounded-2xl shadow-lg"
          label="ECR 3D logo home"
        />
        <p className="eyebrow mt-5 text-amber-700">Service setup required</p>
        <h1 className="page-title mt-2">Connect the control center</h1>
        <p className="page-description mt-3">
          Connect the service configuration for this environment before opening
          the control center.
        </p>
        <Link href="/" className="mt-6 inline-flex">
          <Button>Return home</Button>
        </Link>
      </div>
    </div>
  );
}
function AccessDenied({ onBack }: { onBack: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <BrandLogo
          variant="3d"
          className="mx-auto w-28"
          imageClassName="rounded-2xl shadow-lg"
          label="ECR 3D logo home"
        />
        <h1 className="page-title mt-5">Administrator access required</h1>
        <p className="page-description mt-3">
          Your profile does not have the administrator role.
        </p>
        <Button className="mt-6" onClick={onBack}>
          Return to app
        </Button>
      </div>
    </div>
  );
}
