import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  LockKeyhole,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import {
  firebaseConfigured,
  subscribeToAdminCollection,
  updateFirestoreUserRole,
  createFirestoreOrganization,
  writeFirestoreAudit,
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
type Tab = "overview" | "incidents" | "users" | "organizations" | "audit";
const roles: UserRole[] = [
  "citizen",
  "dispatcher",
  "coordinator",
  "responder",
  "moderator",
];

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
  const [loadingData, setLoadingData] = useState(true);
  const [orgForm, setOrgForm] = useState({
    name: "",
    type: "medical",
    code: "",
  });

  useEffect(() => {
    if (!user || user.role !== "admin" || !firebaseConfigured) return;
    let ready = 0;
    const markReady = () => {
      ready += 1;
      if (ready >= 4) setLoadingData(false);
    };
    const stops = [
      subscribeToAdminCollection<FirestoreIncident>("incidents", rows => {
        setIncidents(rows);
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
      { key: "users", label: "Users & roles", icon: Users },
      { key: "organizations", label: "Organizations", icon: Building2 },
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
              {tab === "incidents" && <IncidentTable incidents={incidents} />}
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
              {tab === "audit" && <AuditTable logs={auditLogs} />}
            </>
          )}
        </section>
      </div>
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

function IncidentTable({ incidents }: { incidents: FirestoreIncident[] }) {
  return (
    <DataPanel
      eyebrow="Operational data"
      title="Incidents"
      description="Live incident records. New reports and their locations appear here as soon as citizens submit them."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-3 py-3">Reference</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Location</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Priority</th>
              <th className="px-3 py-3">Version</th>
              <th className="px-3 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map(incident => (
              <tr
                key={incident.id}
                className="border-b border-border last:border-0"
              >
                <td className="px-3 py-3 font-black">
                  {incident.publicReference}
                </td>
                <td className="px-3 py-3 capitalize">
                  {incident.category.replaceAll("_", " ")}
                </td>
                <td className="max-w-[260px] px-3 py-3">
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
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${toneForStatus(incident.status)}`}
                  >
                    {incident.status.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="px-3 py-3 capitalize">{incident.priority}</td>
                <td className="px-3 py-3 text-muted-foreground">
                  {incident.version}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {dateLabel(incident.createdAt)}
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
