import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Activity, ArrowLeft, CheckCircle2, Filter, MapPin, ShieldCheck, Siren, X } from "lucide-react";
import { getLocalOrganizations, isLocalDispatcher, loadAllLocalIncidents, setLocalDispatcher, updateSharedLocalIncident } from "@/lib/localDispatch";
import type { LocalIncident } from "@/lib/localIncidents";
import IncidentPhotoGallery from "@/components/IncidentPhotoGallery";

const statuses = ["all", "submitted", "received", "triaged", "assigned", "responding", "arrived", "resolved"];
const categories = ["all", "medical", "fire", "security", "road_accident", "disaster", "rescue", "missing_person", "other"];
const priorities = ["all", "critical", "high", "medium", "low"];
const statusLabels: Record<string, string> = { submitted: "Submitted", received: "Received", triaged: "Triaged", assigned: "Assigned", responding: "Responding", arrived: "Arrived", resolved: "Resolved" };

function formatTime(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function Dispatch() {
  const [, navigate] = useLocation();
  const [active, setActive] = useState(() => isLocalDispatcher());
  const [incidents, setIncidents] = useState<LocalIncident[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState("all");
  const [message, setMessage] = useState("");

  function refresh() {
    const next = loadAllLocalIncidents();
    setIncidents(next);
    setSelectedId(current => current && next.some(incident => incident.id === current) ? current : next[0]?.id ?? null);
  }

  useEffect(() => {
    if (!active) return;
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => window.clearInterval(timer);
  }, [active]);

  const filtered = useMemo(() => incidents.filter(incident =>
    (statusFilter === "all" || incident.status === statusFilter) &&
    (categoryFilter === "all" || incident.category === categoryFilter) &&
    (priorityFilter === "all" || incident.priority === priorityFilter) &&
    (jurisdictionFilter === "all" || (incident.jurisdiction || "Pilot area") === jurisdictionFilter)
  ), [incidents, statusFilter, categoryFilter, priorityFilter, jurisdictionFilter]);
  const jurisdictions = useMemo(() => ["all", ...Array.from(new Set(incidents.map(incident => incident.jurisdiction || "Pilot area")))], [incidents]);
  const selected = incidents.find(incident => incident.id === selectedId) ?? null;

  function updateIncident(changes: Parameters<typeof updateSharedLocalIncident>[1]) {
    if (!selected) return;
    const updated = updateSharedLocalIncident(selected.id, { ...changes, expectedVersion: selected.version, actor: "dispatcher" });
    if (!updated) {
      setMessage("This incident changed in another view. The queue has been refreshed; review it before trying again.");
      refresh();
      return;
    }
    setMessage(`${updated.publicReference} updated successfully.`);
    refresh();
  }

  if (!active) {
    return <main className="min-h-screen bg-[#f5f8f7] px-4 py-10 text-slate-950"><div className="mx-auto max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-xl"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#063f3d] text-white"><ShieldCheck size={28} /></span><p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">ECR operations prototype</p><h1 className="mt-3 text-3xl font-black">Local dispatcher access</h1><p className="mt-4 text-sm leading-6 text-slate-500">This temporary console lets the pilot team test triage, routing, assignment, status updates, and audit history before Firestore authentication is connected.</p><button onClick={() => { setLocalDispatcher(true); setActive(true); }} className="mt-7 w-full rounded-xl bg-[#063f3d] px-5 py-3.5 text-sm font-black text-white hover:bg-[#075b55]">Enter dispatcher console</button><Link href="/" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-emerald-700"><ArrowLeft size={16} /> Return to ECR</Link></div></main>;
  }

  return <main className="min-h-screen bg-[#f5f8f7] text-slate-950">
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur-xl"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#063f3d] text-white"><ShieldCheck size={21} /></span><div><p className="text-sm font-black tracking-[0.18em] text-[#063f3d]">ECR DISPATCH</p><p className="text-xs text-slate-400">Local operations console · Pilot area</p></div></div><div className="flex items-center gap-2"><Link href="/app" className="rounded-full px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Citizen app</Link><button onClick={() => { setLocalDispatcher(false); setActive(false); navigate("/"); }} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">Exit console</button></div></div></header>
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8"><div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="min-w-0"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Dispatcher queue</p><h1 className="mt-2 text-3xl font-black tracking-tight">Active incidents</h1><p className="mt-2 text-sm text-slate-500">Review, triage, route, and update reports from the local pilot store.</p></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-500 ring-1 ring-slate-200">{filtered.length} visible</span></div>
        <div className="mt-5 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-4"><label className="text-xs font-bold text-slate-500">Status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"><option value="all">All statuses</option>{statuses.slice(1).map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label><label className="text-xs font-bold text-slate-500">Category<select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"><option value="all">All categories</option>{categories.slice(1).map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label className="text-xs font-bold text-slate-500">Priority<select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"><option value="all">All priorities</option>{priorities.slice(1).map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-xs font-bold text-slate-500">Jurisdiction<select value={jurisdictionFilter} onChange={event => setJurisdictionFilter(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">{jurisdictions.map(value => <option key={value} value={value}>{value === "all" ? "All jurisdictions" : value}</option>)}</select></label></div>
        {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</p>}
        <div className="mt-5 grid gap-3">{filtered.length ? filtered.map(incident => <button key={incident.id} onClick={() => setSelectedId(incident.id)} className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selectedId === incident.id ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"}`}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black capitalize">{incident.category.replaceAll("_", " ")}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${incident.priority === "critical" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{incident.priority}</span>{Boolean(incident.photos?.length) && <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-800">{incident.photos?.length} photo{incident.photos?.length === 1 ? "" : "s"}</span>}</div><p className="mt-1 text-xs text-slate-500">{incident.publicReference} · {formatTime(incident.createdAt)}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">{statusLabels[incident.status] ?? incident.status}</span></div><p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{incident.description}</p><p className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-slate-400"><MapPin size={13} /> {incident.locationLabel || "Location not supplied"}</p></button>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Filter className="mx-auto text-slate-300" size={24} /><p className="mt-3 text-sm font-black">No incidents match these filters</p><p className="mt-1 text-xs text-slate-500">Submit a report in the citizen app, then return here to triage it.</p></div>}</div>
      </section>
      <section className="min-w-0">{selected ? <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Incident detail</p><h2 className="mt-2 text-2xl font-black capitalize">{selected.category.replaceAll("_", " ")}</h2><p className="mt-1 text-xs text-slate-500">{selected.publicReference} · Created {formatTime(selected.createdAt)}</p></div><button onClick={() => setSelectedId(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="Close incident detail"><X size={19} /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Description</p><p className="mt-2 text-sm leading-6 text-slate-700">{selected.description}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Location</p><p className="mt-2 flex items-center gap-2 text-sm text-slate-700"><MapPin size={15} /> {selected.locationLabel || "Not supplied"}</p><p className="mt-3 text-xs text-slate-500">Jurisdiction: {selected.jurisdiction || "Pilot area"}</p></div></div>{Boolean(selected.photos?.length) && <IncidentPhotoGallery incidentId={selected.id} publicReference={selected.publicReference} />}<div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-500">Priority<select value={selected.priority} onChange={event => updateIncident({ priority: event.target.value, action: `Priority set to ${event.target.value}` })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label className="text-xs font-bold text-slate-500">Route to organization<select value={selected.assignedOrganizationId ?? ""} onChange={event => updateIncident({ assignedOrganizationId: event.target.value ? Number(event.target.value) : null, action: event.target.value ? `Routed to ${getLocalOrganizations().find(org => org.id === Number(event.target.value))?.name}` : "Route cleared" })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"><option value="">Unassigned</option>{getLocalOrganizations().map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => updateIncident({ status: "received", action: "Dispatcher acknowledged report" })} disabled={selected.status !== "submitted"} className="rounded-xl bg-[#063f3d] px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Acknowledge</button><button onClick={() => updateIncident({ status: selected.status === "resolved" ? "resolved" : selected.status === "submitted" ? "received" : selected.status === "received" ? "triaged" : selected.status === "triaged" ? "assigned" : selected.status === "assigned" ? "responding" : selected.status === "responding" ? "arrived" : "resolved", action: "Dispatcher advanced operational status" })} disabled={selected.status === "resolved"} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-emerald-950 disabled:cursor-not-allowed disabled:opacity-40">Advance status</button></div><div className="mt-7 border-t border-slate-100 pt-5"><div className="flex items-center gap-2"><Activity size={17} className="text-emerald-700" /><h3 className="text-sm font-black">Audit timeline</h3></div><div className="mt-4 space-y-3">{selected.events.map((event, index) => <div key={event.id} className="flex gap-3"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${index === selected.events.length - 1 ? "bg-emerald-500" : "bg-slate-300"}`} /><div><p className="text-sm font-bold text-slate-700">{event.label}</p><p className="text-xs text-slate-400">{formatTime(event.createdAt)} · {event.actor ?? "system"}{event.previousValue !== undefined && <> · {event.previousValue || "none"} → {event.newValue || "none"}</>}</p></div></div>)}</div></div></div> : <div className="grid min-h-[420px] place-items-center rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center"><Siren className="text-slate-300" size={32} /><p className="mt-4 text-sm font-black">Select an incident to inspect its details</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">The dispatcher can review sensitive details, set priority, route the report, and record each action.</p></div>}</section>
    </div></div>
  </main>;
}
