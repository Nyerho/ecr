import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { advanceLocalIncident, createLocalIncident, getNextLocalStatus, loadLocalIncidents, type LocalIncident } from "@/lib/localIncidents";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crosshair,
  FileWarning,
  Flame,
  HeartPulse,
  KeyRound,
  LockKeyhole,
  Mail,
  MapPin,
  Menu,
  Phone,
  Radio,
  ShieldCheck,
  Siren,
  Smartphone,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";

const BEACON_IMAGE = "/ecr-response-beacon.png";

const categories = [
  { key: "medical", label: "Medical", detail: "Illness, injury or ambulance", icon: HeartPulse, tone: "rose" },
  { key: "fire", label: "Fire", detail: "Fire, smoke or gas leak", icon: Flame, tone: "orange" },
  { key: "security", label: "Police / Security", detail: "Crime or immediate danger", icon: ShieldCheck, tone: "blue" },
  { key: "road_accident", label: "Road accident", detail: "Collision or vehicle hazard", icon: Siren, tone: "indigo" },
  { key: "disaster", label: "Flood / disaster", detail: "Flood, storm or collapse", icon: Activity, tone: "cyan" },
  { key: "rescue", label: "Rescue", detail: "Trapped person or hazard", icon: UsersRound, tone: "emerald" },
  { key: "missing_person", label: "Missing person", detail: "Someone lost or missing", icon: AlertTriangle, tone: "amber" },
  { key: "other", label: "Other emergency", detail: "Something else urgent", icon: FileWarning, tone: "slate" },
] as const;

type CategoryKey = (typeof categories)[number]["key"];
type Status = "submitted" | "received" | "triaged" | "assigned" | "responding" | "arrived" | "resolved" | "cancelled" | "duplicate" | "unable_to_verify" | "escalated" | "closed";
type IncidentCard = {
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
  createdAt: Date;
  version: number;
  events?: LocalIncident["events"];
};

function toIncidentCard(incident: LocalIncident): IncidentCard {
  return { ...incident, createdAt: new Date(incident.createdAt) };
}

type AgencyNotificationCard = {
  id: number;
  incidentId: number;
  publicReference: string | null;
  organizationName: string | null;
  channel: string;
  deliveryStatus: string;
  deliveryProvider: string | null;
  destination: string;
  createdAt: Date;
  sentAt: Date | null;
};

type AgencyCard = {
  id: number;
  name: string;
  type: string;
  code: string;
  latitude: string | null;
  longitude: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  serviceAreaGeoJson: string | null;
  isVerified: boolean;
  isActive: boolean;
};

type ReportForm = {
  description: string;
  locationLabel: string;
  latitude: string;
  longitude: string;
  injured: string;
  peopleAffected: string;
  reporterPhone: string;
  reporterEmail: string;
};

const statusLabels: Record<Status, string> = {
  submitted: "Report submitted",
  received: "Received by ECR",
  triaged: "Incident triaged",
  assigned: "Response assigned",
  responding: "Responder on the way",
  arrived: "Responder arrived",
  resolved: "Incident resolved",
  cancelled: "Report cancelled",
  duplicate: "Duplicate report",
  unable_to_verify: "Unable to verify",
  escalated: "Incident escalated",
  closed: "Incident closed",
};

const toneClasses: Record<string, string> = {
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  orange: "bg-orange-50 text-orange-700 ring-orange-100",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
};

function emptyForm(): ReportForm {
  return { description: "", locationLabel: "", latitude: "", longitude: "", injured: "", peopleAffected: "", reporterPhone: "", reporterEmail: "" };
}

function formatTime(value: Date | string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusPill({ status }: { status: Status }) {
  const active = ["submitted", "received", "triaged", "assigned", "responding", "arrived"].includes(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? "bg-emerald-50 text-emerald-700" : status === "resolved" || status === "closed" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : status === "resolved" || status === "closed" ? "bg-slate-400" : "bg-amber-500"}`} />
      {statusLabels[status]}
    </span>
  );
}

function playAlertTone() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const audio = new AudioContextClass();
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.38);
    const oscillator = audio.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1040, audio.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.4);
    window.setTimeout(() => void audio.close(), 600);
  } catch {
    // Browsers can block sound until a user gesture; the visible alert remains available.
  }
}

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const [localIncidents, setLocalIncidents] = useState<IncidentCard[]>(() => loadLocalIncidents(user).map(toIncidentCard));
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const [localLifecycleMessage, setLocalLifecycleMessage] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportStep, setReportStep] = useState<"category" | "details" | "location" | "review">("category");
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  const [form, setForm] = useState<ReportForm>(emptyForm);
  const [view, setView] = useState<"citizen" | "operations">("citizen");
  const [adminPromptOpen, setAdminPromptOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [newIncidentIds, setNewIncidentIds] = useState<number[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const seenIncidentIds = useRef<Set<number>>(new Set());
  const hasInitialOperationsSnapshot = useRef(false);

  const isAdmin = false;
  const adminStatus = trpc.admin.status.useQuery(undefined, { enabled: isAuthenticated && isAdmin, retry: false, refetchOnWindowFocus: false });
  const mine = { data: localIncidents, isLoading: false };
  const operations = trpc.operations.list.useQuery(undefined, {
    enabled: isAuthenticated && isAdmin && Boolean(adminStatus.data?.unlocked),
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
  });
  const agencyNotifications = trpc.operations.notifications.useQuery(undefined, {
    enabled: isAuthenticated && isAdmin && Boolean(adminStatus.data?.unlocked),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
  const agencyDirectory = trpc.operations.organizations.useQuery(undefined, {
    enabled: isAuthenticated && isAdmin && Boolean(adminStatus.data?.unlocked),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  const utils = trpc.useUtils();

  const unlockAdmin = trpc.admin.unlock.useMutation({
    onSuccess: async () => {
      setAdminPromptOpen(false);
      setAdminPassword("");
      setView("operations");
      await utils.admin.status.invalidate();
      toast.success("Control center unlocked");
    },
    onError: error => toast.error(error.message || "Could not unlock the control center."),
  });
  const lockAdmin = trpc.admin.lock.useMutation({
    onSuccess: async () => {
      setView("citizen");
      setNewIncidentIds([]);
      await utils.admin.status.invalidate();
    },
  });
  const updateIncident = trpc.operations.update.useMutation({
    onSuccess: async () => {
      toast.success("Incident updated and audit logged");
      await utils.operations.list.invalidate();
      await utils.operations.notifications.invalidate();
    },
    onError: error => toast.error(error.message || "The incident could not be updated."),
  });
  const acknowledgeNotification = trpc.operations.acknowledgeNotification.useMutation({
    onSuccess: async () => {
      toast.success("Agency acknowledgement recorded");
      await utils.operations.notifications.invalidate();
    },
    onError: error => toast.error(error.message || "Could not record agency acknowledgement."),
  });

  const selected = useMemo(() => categories.find(item => item.key === selectedCategory), [selectedCategory]);
  const canAdvanceDetails = Boolean(selectedCategory && form.description.trim().length >= 4 && (form.reporterPhone.trim() || form.reporterEmail.trim()));
  const canAdvanceLocation = Boolean(form.locationLabel.trim() || (form.latitude && form.longitude));

  useEffect(() => {
    setLocalIncidents(loadLocalIncidents(user).map(toIncidentCard));
  }, [user]);

  useEffect(() => {
    if (!operations.data) return;
    const snapshot = operations.data;
    if (!hasInitialOperationsSnapshot.current) {
      snapshot.forEach(incident => seenIncidentIds.current.add(incident.id));
      hasInitialOperationsSnapshot.current = true;
      return;
    }
    const fresh = snapshot.filter(incident => !seenIncidentIds.current.has(incident.id));
    snapshot.forEach(incident => seenIncidentIds.current.add(incident.id));
    if (!fresh.length) return;
    setNewIncidentIds(current => Array.from(new Set([...current, ...fresh.map(incident => incident.id)])));
    if (soundEnabled) playAlertTone();
  }, [operations.data, soundEnabled]);

  function openReport() {
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    setReportOpen(true);
    setReportStep("category");
  }

  function startReportWithCategory(categoryKey: CategoryKey) {
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    setSelectedCategory(categoryKey);
    setReportOpen(true);
    setReportStep("details");
  }

  function openControlCenter() {
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    if (!isAdmin) {
      toast.error("This area is restricted to authorized ECR administrators.");
      return;
    }
    if (adminStatus.data?.unlocked) setView("operations");
    else setAdminPromptOpen(true);
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      toast.error("Location is not available on this device. Add a landmark instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        setForm(current => ({ ...current, latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6) }));
        toast.success("Location captured. Review it before sending.");
      },
      () => toast.error("Location permission was not granted. You can continue with a landmark."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }

  function submitReport() {
    if (!selectedCategory || !canAdvanceDetails || !canAdvanceLocation) return;
    if (!user) return;
    setIsSubmittingLocal(true);
    try {
      const result = createLocalIncident(user, {
        category: selectedCategory,
        description: form.description.trim(),
        locationLabel: form.locationLabel.trim() || undefined,
        reporterPhone: form.reporterPhone.trim() || undefined,
        reporterEmail: form.reporterEmail.trim() || undefined,
      });
      setLocalIncidents(current => [toIncidentCard(result), ...current]);
      toast.success(`Report ${result.publicReference} saved locally`);
      setReportOpen(false);
      setReportStep("category");
      setSelectedCategory(null);
      setForm(emptyForm());
    } catch {
      toast.error("The report could not be saved in this browser.");
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  function advanceLocalReport(incidentId: number) {
    if (!user) return;
    const updated = advanceLocalIncident(user, incidentId);
    if (!updated) return;
    setLocalIncidents(current => current.map(incident => incident.id === incidentId ? toIncidentCard(updated) : incident));
    setLocalLifecycleMessage(`${updated.publicReference} moved to ${statusLabels[updated.status as Status] ?? updated.status}.`);
  }

  function dismissAlerts() {
    setNewIncidentIds([]);
  }

  return (
    <div className="min-h-screen bg-[#f5f8f7] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/75 shadow-[0_12px_40px_rgba(6,63,61,0.06)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <button onClick={() => { setView("citizen"); setShowMenu(false); }} className="flex items-center gap-3 text-left" aria-label="ECR home">
            <span className="brand-mark grid h-10 w-10 place-items-center rounded-2xl bg-[#063f3d] text-white shadow-lg shadow-emerald-950/10"><ShieldCheck size={21} /></span>
            <span><span className="block text-[15px] font-black tracking-[0.18em] text-[#063f3d]">ECR</span><span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Emergency Community Response</span></span>
          </button>
          <div className="hidden items-center gap-2 md:flex">
            {isAdmin && <button onClick={openControlCenter} className="relative inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-bold text-slate-600 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:text-emerald-800"><KeyRound size={14} />{adminStatus.data?.unlocked ? "Open control center" : "Unlock control center"}{newIncidentIds.length > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white shadow-lg shadow-rose-500/30">{newIncidentIds.length}</span>}</button>}
            {isAuthenticated ? <button onClick={() => logout()} className="rounded-full px-4 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100">Sign out</button> : <button onClick={() => startLogin()} className="rounded-full bg-[#063f3d] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#075b55]">Sign in</button>}
          </div>
          <button className="rounded-xl p-2 text-slate-600 md:hidden" onClick={() => setShowMenu(value => !value)} aria-label="Open menu"><Menu size={22} /></button>
        </div>
        {showMenu && <div className="border-t border-slate-100 bg-white/90 px-4 py-3 backdrop-blur-xl md:hidden">{isAdmin && <button onClick={() => { openControlCenter(); setShowMenu(false); }} className="mb-2 flex w-full items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-left text-sm font-bold"><KeyRound size={16} />{adminStatus.data?.unlocked ? "Open control center" : "Unlock control center"}{newIncidentIds.length > 0 && <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] text-white">{newIncidentIds.length} new</span>}</button>}{isAuthenticated ? <button onClick={() => logout()} className="block w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-slate-500">Sign out</button> : <button onClick={() => startLogin()} className="block w-full rounded-xl bg-[#063f3d] px-4 py-3 text-left text-sm font-bold text-white">Sign in</button>}</div>}
      </header>

      {view === "operations" && isAdmin && adminStatus.data?.unlocked ? (
        <OperationsConsole incidents={(operations.data ?? []) as IncidentCard[]} agencyNotifications={(agencyNotifications.data ?? []) as AgencyNotificationCard[]} agencyDirectory={(agencyDirectory.data ?? []) as AgencyCard[]} loading={operations.isLoading} alertCount={newIncidentIds.length} soundEnabled={soundEnabled} onToggleSound={() => setSoundEnabled(value => !value)} onDismissAlerts={dismissAlerts} onTestAlert={playAlertTone} onLock={() => lockAdmin.mutate()} onAcknowledge={notificationId => acknowledgeNotification.mutate({ notificationId })} onUpdate={(incidentId, status, version, assignedOrganizationId) => updateIncident.mutate({ incidentId, status, assignedOrganizationId, expectedVersion: version })} />
      ) : (
        <main>
          <section className="hero-surface relative overflow-hidden bg-[#063f3d]">
            <div className="hero-grid absolute inset-0 opacity-40" />
            <div className="absolute -right-20 -top-32 h-96 w-96 rounded-full bg-emerald-300/15 blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
            <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-20">
              <div className="reveal-up">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-100 shadow-[0_0_40px_rgba(52,211,153,0.16)]"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> Pilot coordination network</div>
                <h1 className="max-w-3xl text-4xl font-black leading-[1.03] tracking-[-0.04em] text-white sm:text-6xl">When every second matters, make the first step clear.</h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-emerald-50/75 sm:text-lg">Report an emergency, share where help is needed, and stay connected while authorized responders coordinate the next move.</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button onClick={openReport} className="h-13 rounded-2xl bg-[#13b981] px-6 text-sm font-black text-[#022c2b] shadow-xl shadow-emerald-950/20 hover:-translate-y-1 hover:bg-[#34d399]"><Siren className="mr-2" size={18} /> Report emergency <ArrowRight className="ml-2" size={17} /></Button><a href="tel:112" className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-6 text-sm font-black text-white transition hover:-translate-y-1 hover:bg-white/15"><Radio size={17} /> Call 112</a></div>
                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-emerald-100/65"><span className="inline-flex items-center gap-2"><LockKeyhole size={14} /> Private by design</span><span className="inline-flex items-center gap-2"><Smartphone size={14} /> Built for weak networks</span><span className="inline-flex items-center gap-2"><CheckCircle2 size={14} /> Human-led response</span></div>
              </div>
              <div className="relative min-h-[360px] reveal-float">
                <div className="glass-card absolute inset-x-4 top-8 z-10 rounded-[2rem] border border-white/20 bg-white/10 p-3 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:inset-x-7">
                  <div className="rounded-[1.5rem] bg-[#f4faf8]/95 p-5 shadow-inner shadow-white sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Your response loop</p><p className="mt-1 max-w-[245px] text-lg font-black text-slate-900">One clear thread from report to resolution</p></div><span className="icon-orb rounded-2xl bg-emerald-100 p-3 text-emerald-700"><Activity size={20} /></span></div><div className="mt-6 space-y-4">{[["01", "Report", "Choose what is happening and add the essentials"], ["02", "Locate", "Confirm where responders should go"], ["03", "Coordinate", "Authorized teams triage and take ownership"], ["04", "Track", "See the status without chasing updates"]].map(([number, title, detail], index) => <div key={number} className="flex items-start gap-4"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black ${index === 0 ? "bg-[#063f3d] text-white" : "bg-white text-emerald-800 ring-1 ring-emerald-100"}`}>{number}</span><div><p className="text-sm font-black text-slate-900">{title}</p><p className="mt-0.5 max-w-[200px] text-xs leading-5 text-slate-500">{detail}</p></div></div>)}</div></div>
                </div>
                <div className="beacon-halo absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200/20" />
                <img src={BEACON_IMAGE} alt="3D glass response beacon" className="hero-beacon pointer-events-none absolute -right-6 bottom-0 z-20 h-64 w-64 object-contain drop-shadow-[0_30px_30px_rgba(0,0,0,0.28)] sm:-right-10 sm:h-80 sm:w-80" />
                <div className="glass-particle absolute left-3 top-6 h-3 w-3 rounded-full bg-cyan-200/80" /><div className="glass-particle absolute right-2 top-28 h-2 w-2 rounded-full bg-emerald-200/80 [animation-delay:800ms]" /><div className="glass-particle absolute bottom-10 left-16 h-2 w-2 rounded-full bg-white/70 [animation-delay:1400ms]" />
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Fast, structured reporting</p><h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">What kind of emergency is this?</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Pick the closest match. You can add details, your contact, and adjust your location before sending.</p></div><span className="inline-flex items-center gap-2 text-xs font-bold text-slate-400"><LockKeyhole size={14} /> Only authorized teams see incident details</span></div>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">{categories.map(item => { const Icon = item.icon; return <button key={item.key} onClick={() => startReportWithCategory(item.key)} className="glass-tile group rounded-2xl border border-slate-200/80 bg-white/80 p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-900/10 sm:p-5"><span className={`icon-orb grid h-10 w-10 place-items-center rounded-xl ring-1 ${toneClasses[item.tone]}`}><Icon size={19} /></span><span className="mt-4 block text-sm font-black text-slate-900">{item.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.detail}</span><span className="mt-4 inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 opacity-0 transition group-hover:opacity-100">Start report <ChevronRight size={13} /></span></button>; })}</div>
          </section>

          <section className="border-y border-slate-200/80 bg-white/80 backdrop-blur-xl"><div className="mx-auto grid max-w-7xl gap-8 px-4 py-9 sm:px-6 md:grid-cols-3 lg:px-8"><div className="flex gap-4"><span className="icon-orb grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><MapPin size={19} /></span><div><p className="text-sm font-black">Location with consent</p><p className="mt-1 text-xs leading-5 text-slate-500">Use device location when available or add a landmark manually.</p></div></div><div className="flex gap-4"><span className="icon-orb grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700"><Clock3 size={19} /></span><div><p className="text-sm font-black">A visible status trail</p><p className="mt-1 text-xs leading-5 text-slate-500">Follow received, assigned, responding, arrived and resolved updates.</p></div></div><div className="flex gap-4"><span className="icon-orb grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700"><LockKeyhole size={19} /></span><div><p className="text-sm font-black">Access is scoped</p><p className="mt-1 text-xs leading-5 text-slate-500">Operational data is restricted to authenticated, authorized users.</p></div></div></div></section>

          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14"><div className="flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Your incident history</p><h2 className="mt-2 text-2xl font-black tracking-tight">Track your reports</h2></div>{isAuthenticated && <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500">{mine.data?.length ?? 0} reports</span>}</div>{!isAuthenticated ? <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="text-sm font-black">Sign in to view your reports</p><p className="mt-1 text-sm text-slate-500">Your incident history is private and tied to your account.</p><Button onClick={() => startLogin()} className="mt-5 rounded-xl bg-[#063f3d]">Sign in securely</Button></div> : <div className="mt-5 grid gap-3">{mine.isLoading ? <div className="rounded-3xl bg-white p-8 text-center text-sm text-slate-500">Loading your reports…</div> : mine.data?.length ? mine.data.slice(0, 5).map(incident => <div key={incident.id} className="glass-tile flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="flex items-start gap-4"><span className="icon-orb grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600"><Siren size={18} /></span><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black capitalize">{incident.category.replaceAll("_", " ")}</p><StatusPill status={incident.status as Status} /></div><p className="mt-1 text-xs text-slate-500">{incident.publicReference} · Reported {formatTime(incident.createdAt)}</p><p className="mt-2 max-w-xl text-sm text-slate-600">{incident.description}</p></div></div><span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">Priority: <span className="capitalize text-slate-700">{incident.priority}</span></span></div>) : <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No reports yet. If something is happening, start with the emergency button above.</div>}</div>}</section>
        </main>
      )}

          <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8 lg:pb-14">
            <div className="rounded-3xl border border-cyan-100 bg-cyan-50/60 p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Local dispatcher preview</p><h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">Test the report-to-resolution loop</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Advance a local report through the PRD status model while Firestore and the dispatcher API are still being prepared. Every transition is retained in this browser timeline.</p></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-cyan-800 ring-1 ring-cyan-100">Prototype only</span></div>
              {localLifecycleMessage && <p role="status" className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-bold text-emerald-800 ring-1 ring-emerald-100">{localLifecycleMessage}</p>}
              <div className="mt-5 grid gap-4 lg:grid-cols-2">{localIncidents.slice(0, 4).map(incident => <div key={`lifecycle-${incident.id}`} className="rounded-2xl border border-white bg-white/80 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black capitalize">{incident.category.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{incident.publicReference} · {statusLabels[incident.status as Status] ?? incident.status}</p></div><button disabled={!getNextLocalStatus(incident.status)} onClick={() => advanceLocalReport(incident.id)} className="rounded-xl bg-[#063f3d] px-3 py-2 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{getNextLocalStatus(incident.status) ? `Advance to ${getNextLocalStatus(incident.status)}` : "Resolved"}</button></div><div className="mt-4 space-y-2">{(incident.events ?? []).map((event, index) => <div key={event.id} className="flex items-start gap-3 text-xs"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${index === (incident.events ?? []).length - 1 ? "bg-emerald-500" : "bg-slate-300"}`} /><div><p className={`font-bold ${index === (incident.events ?? []).length - 1 ? "text-emerald-800" : "text-slate-600"}`}>{event.label}</p><p className="text-slate-400">{formatTime(event.createdAt)}</p></div></div>)}</div></div>)}</div>
            </div>
          </section>

      <footer className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><span>Emergency Community Response · Pilot interface</span><span className="inline-flex items-center gap-2"><LockKeyhole size={13} /> Do not delay calling official emergency services</span></div></footer>

      {adminPromptOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-xl"><div className="glass-card w-full max-w-md rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><span className="icon-orb grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><KeyRound size={20} /></span><p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Restricted access</p><h2 className="mt-1 text-2xl font-black tracking-tight">Unlock the control center</h2><p className="mt-2 text-sm leading-6 text-slate-500">Use the administrator password to access live incident details and responder contacts.</p></div><button onClick={() => setAdminPromptOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="Close unlock dialog"><X size={19} /></button></div><label className="mt-6 block"><span className="text-sm font-black">Admin password</span><input autoFocus type="password" value={adminPassword} onChange={event => setAdminPassword(event.target.value)} onKeyDown={event => { if (event.key === "Enter") unlockAdmin.mutate({ password: adminPassword }); }} placeholder="Enter your secure password" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-emerald-500 transition focus:ring-2" /></label><div className="mt-6 flex gap-3"><Button variant="outline" onClick={() => setAdminPromptOpen(false)} className="flex-1 rounded-xl">Cancel</Button><Button disabled={!adminPassword || unlockAdmin.isPending} onClick={() => unlockAdmin.mutate({ password: adminPassword })} className="flex-1 rounded-xl bg-[#063f3d]">{unlockAdmin.isPending ? "Checking…" : "Unlock center"}</Button></div><p className="mt-4 text-center text-[11px] text-slate-400">Password is validated server-side and never stored in the browser.</p></div></div>}

      {reportOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"><div className="glass-card max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-white/95 p-5 shadow-2xl sm:rounded-[2rem] sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Secure emergency report</p><h2 className="mt-1 text-2xl font-black tracking-tight">{reportStep === "category" ? "What is happening?" : selected?.label ?? "Report details"}</h2><p className="mt-1 text-sm text-slate-500">Only share what is safe and necessary.</p></div><button onClick={() => setReportOpen(false)} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100" aria-label="Close report"><X size={20} /></button></div><div className="mt-6 flex items-center gap-2">{["category", "details", "location", "review"].map((step, index) => <span key={step} className={`h-1.5 flex-1 rounded-full ${["category", "details", "location", "review"].indexOf(reportStep) >= index ? "bg-emerald-500" : "bg-slate-200"}`} />)}</div>
        {reportStep === "category" && <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">{categories.map(item => { const Icon = item.icon; return <button key={item.key} onClick={() => { setSelectedCategory(item.key); setReportStep("details"); }} className="glass-tile rounded-2xl border border-slate-200 p-4 text-left transition hover:-translate-y-1 hover:border-emerald-400 hover:bg-emerald-50/50"><span className={`icon-orb grid h-10 w-10 place-items-center rounded-xl ring-1 ${toneClasses[item.tone]}`}><Icon size={18} /></span><span className="mt-3 block text-xs font-black">{item.label}</span></button>; })}</div>}
        {reportStep === "details" && <div className="mt-7 space-y-5"><label className="block"><span className="text-sm font-black">What happened?</span><textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} maxLength={2000} rows={5} placeholder="Describe the situation in a few words…" className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-emerald-500 transition focus:bg-white focus:ring-2" /><span className="mt-1 block text-right text-[11px] text-slate-400">{form.description.length}/2000</span></label><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="text-sm font-black">Are people injured?</span><select value={form.injured} onChange={event => setForm(current => ({ ...current, injured: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"><option value="">Select if known</option><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Not sure</option></select></label><label className="block"><span className="text-sm font-black">People affected</span><input value={form.peopleAffected} onChange={event => setForm(current => ({ ...current, peopleAffected: event.target.value }))} inputMode="numeric" maxLength={4} placeholder="e.g. 2" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500" /></label></div><div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4"><div className="flex items-center gap-2 text-sm font-black text-cyan-950"><Phone size={16} /> How can responders reach you?</div><p className="mt-1 text-xs leading-5 text-cyan-900/70">Add a phone number or email. ECR shares it only with authorized response teams.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="sr-only">Phone number</span><input value={form.reporterPhone} onChange={event => setForm(current => ({ ...current, reporterPhone: event.target.value }))} type="tel" inputMode="tel" maxLength={32} placeholder="Phone number" className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500" /></label><label><span className="sr-only">Email address</span><input value={form.reporterEmail} onChange={event => setForm(current => ({ ...current, reporterEmail: event.target.value }))} type="email" maxLength={320} placeholder="Email address" className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500" /></label></div></div><div className="flex justify-between gap-3"><Button variant="outline" onClick={() => setReportStep("category")} className="rounded-xl"><ArrowLeft className="mr-2" size={15} /> Back</Button><Button disabled={!canAdvanceDetails} onClick={() => setReportStep("location")} className="rounded-xl bg-[#063f3d]">Continue <ArrowRight className="ml-2" size={15} /></Button></div></div>}
        {reportStep === "location" && <div className="mt-7 space-y-5"><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><div className="flex gap-3"><span className="icon-orb grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-700"><Crosshair size={18} /></span><div><p className="text-sm font-black text-emerald-950">Confirm where help is needed</p><p className="mt-1 text-xs leading-5 text-emerald-900/70">ECR asks for location permission only to route help. You can use a landmark instead.</p></div></div><Button onClick={useDeviceLocation} variant="outline" className="mt-4 w-full rounded-xl border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100"><MapPin className="mr-2" size={16} /> Use my current location</Button></div><label className="block"><span className="text-sm font-black">Landmark or address</span><input value={form.locationLabel} onChange={event => setForm(current => ({ ...current, locationLabel: event.target.value }))} maxLength={220} placeholder="e.g. Near the central market, Lagos" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500" /></label>{form.latitude && form.longitude && <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500">Location captured: {form.latitude}, {form.longitude}. Review before sending.</p>}<div className="flex justify-between gap-3"><Button variant="outline" onClick={() => setReportStep("details")} className="rounded-xl"><ArrowLeft className="mr-2" size={15} /> Back</Button><Button disabled={!canAdvanceLocation} onClick={() => setReportStep("review")} className="rounded-xl bg-[#063f3d]">Review report <ArrowRight className="ml-2" size={15} /></Button></div></div>}
        {reportStep === "review" && <div className="mt-7 space-y-4"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Emergency type</span><span className="text-sm font-black capitalize">{selected?.label}</span></div><div className="mt-4 border-t border-slate-200 pt-4"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Description</span><p className="mt-1 text-sm leading-6 text-slate-700">{form.description}</p></div><div className="mt-4 border-t border-slate-200 pt-4"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Contact</span><p className="mt-1 text-sm text-slate-700">{form.reporterPhone || form.reporterEmail}</p></div><div className="mt-4 border-t border-slate-200 pt-4"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Location</span><p className="mt-1 text-sm text-slate-700">{form.locationLabel || "Device location captured"}</p></div></div><div className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"><strong>Safety reminder:</strong> Do not put yourself at risk to collect photos or more detail. For immediate danger, call official emergency services.</div><div className="flex justify-between gap-3"><Button variant="outline" onClick={() => setReportStep("location")} className="rounded-xl"><ArrowLeft className="mr-2" size={15} /> Edit</Button><Button disabled={isSubmittingLocal} onClick={submitReport} className="rounded-xl bg-[#13b981] font-black text-[#022c2b] hover:bg-[#34d399]">{isSubmittingLocal ? "Saving locally…" : "Send emergency report"}<Siren className="ml-2" size={16} /></Button></div></div>}
      </div></div>}
    </div>
  );
}

function OperationsConsole({ incidents, agencyNotifications, agencyDirectory, loading, alertCount, soundEnabled, onToggleSound, onDismissAlerts, onTestAlert, onLock, onAcknowledge, onUpdate }: { incidents: IncidentCard[]; agencyNotifications: AgencyNotificationCard[]; agencyDirectory: AgencyCard[]; loading: boolean; alertCount: number; soundEnabled: boolean; onToggleSound: () => void; onDismissAlerts: () => void; onTestAlert: () => void; onLock: () => void; onAcknowledge: (notificationId: number) => void; onUpdate: (incidentId: number, status: Status, version: number, assignedOrganizationId?: number | null) => void }) {
  const [filter, setFilter] = useState("all");
  const [editingAgencyId, setEditingAgencyId] = useState<number | null>(null);
  const [agencyForm, setAgencyForm] = useState({ name: "", type: "police", code: "", latitude: "", longitude: "", contactPhone: "", contactEmail: "", serviceAreaGeoJson: "", isVerified: false, isActive: true });
  const utils = trpc.useUtils();
  const visible = incidents.filter(incident => filter === "all" || incident.priority === filter || incident.status === filter);
  const latestDispatches = agencyNotifications.slice(0, 3);
  const createAgency = trpc.operations.createOrganization.useMutation({ onSuccess: async () => { toast.success("Agency added to the directory"); resetAgency(); await utils.operations.organizations.invalidate(); }, onError: error => toast.error(error.message || "Could not add agency") });
  const updateAgency = trpc.operations.updateOrganization.useMutation({ onSuccess: async () => { toast.success("Agency directory updated"); resetAgency(); await utils.operations.organizations.invalidate(); }, onError: error => toast.error(error.message || "Could not update agency") });

  function resetAgency() {
    setEditingAgencyId(null);
    setAgencyForm({ name: "", type: "police", code: "", latitude: "", longitude: "", contactPhone: "", contactEmail: "", serviceAreaGeoJson: "", isVerified: false, isActive: true });
  }

  function editAgency(agency: AgencyCard) {
    setEditingAgencyId(agency.id);
    setAgencyForm({ name: agency.name, type: agency.type, code: agency.code, latitude: agency.latitude ?? "", longitude: agency.longitude ?? "", contactPhone: agency.contactPhone ?? "", contactEmail: agency.contactEmail ?? "", serviceAreaGeoJson: agency.serviceAreaGeoJson ?? "", isVerified: agency.isVerified, isActive: agency.isActive });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  function submitAgency() {
    const input = { name: agencyForm.name.trim(), type: agencyForm.type as "dispatch" | "police" | "fire" | "medical" | "disaster" | "community" | "other", code: agencyForm.code.trim(), latitude: agencyForm.latitude.trim() || undefined, longitude: agencyForm.longitude.trim() || undefined, contactPhone: agencyForm.contactPhone.trim() || undefined, contactEmail: agencyForm.contactEmail.trim() || undefined, serviceAreaGeoJson: agencyForm.serviceAreaGeoJson.trim() || undefined, isVerified: agencyForm.isVerified, isActive: agencyForm.isActive };
    if (!input.name || !input.code) { toast.error("Agency name and code are required"); return; }
    if (editingAgencyId) updateAgency.mutate({ id: editingAgencyId, ...input });
    else createAgency.mutate(input);
  }

  return (
    <main className="operations-surface min-h-[calc(100vh-72px)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end"><div><div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.15em] text-emerald-700"><Radio size={13} /> Restricted operations view</div><h1 className="mt-3 text-3xl font-black tracking-tight">ECR control center</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Review, triage, and update incidents. Every action is recorded in the audit trail.</p></div><div className="flex flex-wrap items-center gap-2"><button onClick={onToggleSound} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${soundEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}><Bell size={14} /> Sound {soundEnabled ? "on" : "off"}</button><button onClick={onTestAlert} className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:ring-emerald-300">Test alert</button><button onClick={onLock} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-rose-200 hover:text-rose-700"><LockKeyhole size={14} /> Lock</button></div></div>
        {alertCount > 0 && <div className="alert-banner mt-6 flex flex-col gap-4 rounded-3xl border border-rose-200 bg-rose-50/90 p-4 shadow-lg shadow-rose-900/10 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="alert-bell grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-500 text-white"><BellRing size={20} /></span><div><p className="font-black text-rose-950">{alertCount} new emergency {alertCount === 1 ? "report" : "reports"}</p><p className="mt-1 text-xs leading-5 text-rose-900/70">Live queue refreshed. A response tone was played for this control center.</p></div></div><button onClick={onDismissAlerts} className="rounded-xl bg-white px-4 py-2 text-xs font-black text-rose-700 shadow-sm ring-1 ring-rose-200">Acknowledge alerts</button></div>}
        <section className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2 text-sm font-black text-emerald-950"><Radio size={16} /> Agency dispatch queue</div><p className="mt-1 text-xs leading-5 text-emerald-900/70">When you mark a report Received, ECR selects the nearest verified agency. Delivery state refreshes every 5 seconds.</p></div><span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-emerald-800 ring-1 ring-emerald-100">{agencyNotifications.length} alerts</span></div>{agencyNotifications.length === 0 && <p className="mt-4 rounded-2xl bg-white/70 px-3 py-3 text-xs leading-5 text-emerald-900/70">No agency alerts yet. Add active, verified agency records with coordinates below to enable nearest-agency routing.</p>}{latestDispatches.length > 0 && <div className="mt-4 grid gap-2">{latestDispatches.map(notification => <div key={notification.id} className="flex flex-col gap-2 rounded-2xl bg-white/80 px-3 py-3 text-xs ring-1 ring-emerald-100 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-800">{notification.organizationName ?? notification.destination}</p><p className="mt-0.5 text-slate-500">{notification.publicReference ?? `Incident #${notification.incidentId}`} · {notification.channel.replaceAll("_", " ")}</p></div><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 font-black ${notification.deliveryStatus === "acknowledged" ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-800"}`}><Clock3 size={12} /> {notification.deliveryStatus}{notification.deliveryStatus === "acknowledged" && notification.sentAt ? ` · ${formatTime(notification.sentAt)}` : ""}</span>{notification.deliveryStatus !== "acknowledged" && <button onClick={() => onAcknowledge(notification.id)} className="rounded-full bg-[#063f3d] px-2.5 py-1.5 text-[11px] font-black text-white">Mark accepted</button>}</div></div>)}</div>}</section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white/85 p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-emerald-700">Agency directory</p><h2 className="mt-1 text-xl font-black">Verified response network</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Maintain the agencies ECR can route to. Service areas use Polygon or MultiPolygon GeoJSON coordinates.</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-600">{agencyDirectory.filter(agency => agency.isActive).length} active</span></div><div className="mt-4 grid gap-3">{agencyDirectory.length ? agencyDirectory.map(agency => <div key={agency.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-900">{agency.name}</p><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{agency.type}</span>{agency.isVerified ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800">verified</span> : <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">review</span>}</div><p className="mt-1 text-xs text-slate-500">{agency.code} · {agency.latitude && agency.longitude ? `${agency.latitude}, ${agency.longitude}` : "No coordinates"} · {agency.contactPhone || agency.contactEmail || "No contact endpoint"}</p><p className="mt-1 text-[11px] text-slate-400">{agency.serviceAreaGeoJson ? "Service boundary configured" : "No service boundary"} · {agency.isActive ? "Active" : "Inactive"}</p></div><button onClick={() => editAgency(agency)} className="w-fit rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-300">Edit agency</button></div>) : <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-xs text-slate-500">No agencies configured yet. Add a verified station or response organization below.</p>}</div><div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4"><p className="text-sm font-black text-emerald-950">{editingAgencyId ? "Edit agency record" : "Add agency record"}</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input value={agencyForm.name} onChange={event => setAgencyForm(form => ({ ...form, name: event.target.value }))} placeholder="Agency name" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" /><select value={agencyForm.type} onChange={event => setAgencyForm(form => ({ ...form, type: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"><option value="police">Police / law enforcement</option><option value="dispatch">Dispatch</option><option value="fire">Fire</option><option value="medical">Medical</option><option value="disaster">Disaster</option><option value="community">Community responder</option><option value="other">Other</option></select><input value={agencyForm.code} onChange={event => setAgencyForm(form => ({ ...form, code: event.target.value }))} placeholder="Unique agency code" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" /><input value={agencyForm.contactPhone} onChange={event => setAgencyForm(form => ({ ...form, contactPhone: event.target.value }))} placeholder="Dispatch phone (optional)" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" /><input value={agencyForm.contactEmail} onChange={event => setAgencyForm(form => ({ ...form, contactEmail: event.target.value }))} placeholder="Dispatch email (optional)" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" /><input value={agencyForm.latitude} onChange={event => setAgencyForm(form => ({ ...form, latitude: event.target.value }))} placeholder="Latitude" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" /><input value={agencyForm.longitude} onChange={event => setAgencyForm(form => ({ ...form, longitude: event.target.value }))} placeholder="Longitude" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500" /><label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-slate-600"><input type="checkbox" checked={agencyForm.isVerified} onChange={event => setAgencyForm(form => ({ ...form, isVerified: event.target.checked }))} /> Verified for routing</label><label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-slate-600"><input type="checkbox" checked={agencyForm.isActive} onChange={event => setAgencyForm(form => ({ ...form, isActive: event.target.checked }))} /> Active for routing</label></div><textarea value={agencyForm.serviceAreaGeoJson} onChange={event => setAgencyForm(form => ({ ...form, serviceAreaGeoJson: event.target.value }))} placeholder='Service boundary GeoJSON, e.g. {"type":"Polygon","coordinates":[...]}' rows={3} className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-emerald-500" /><div className="mt-3 flex flex-wrap gap-2"><button onClick={submitAgency} disabled={createAgency.isPending || updateAgency.isPending} className="rounded-xl bg-[#063f3d] px-4 py-2.5 text-xs font-black text-white">{editingAgencyId ? "Save agency changes" : "Add agency"}</button>{editingAgencyId && <button onClick={resetAgency} className="rounded-xl bg-white px-4 py-2.5 text-xs font-black text-slate-600 ring-1 ring-slate-200">Cancel edit</button>}</div></div></section>

        <div className="mt-7 flex flex-wrap gap-2">{["all", "critical", "high", "medium", "low", "submitted", "received", "assigned"].map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition ${filter === value ? "bg-[#063f3d] text-white shadow-lg shadow-emerald-900/15" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:ring-emerald-300"}`}>{value}</button>)}</div>
        {loading ? <div className="mt-6 rounded-3xl bg-white p-10 text-center text-sm text-slate-500">Loading incident queue…</div> : <div className="mt-6 grid gap-4">{visible.length ? visible.map(incident => <div key={incident.id} className="glass-tile rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div className="flex gap-4"><span className={`icon-orb grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${incident.priority === "critical" ? "bg-rose-100 text-rose-700" : incident.priority === "high" ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600"}`}><Siren size={19} /></span><div><div className="flex flex-wrap items-center gap-2"><p className="font-black capitalize">{incident.category.replaceAll("_", " ")}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{incident.priority}</span><StatusPill status={incident.status as Status} /></div><p className="mt-1 text-xs text-slate-400">{incident.publicReference} · {formatTime(incident.createdAt)} · Version {incident.version}</p><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700">{incident.description}</p>{incident.locationLabel && <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><MapPin size={13} /> {incident.locationLabel}</p>}<div className="mt-4 flex flex-wrap gap-2">{incident.reporterPhone && <a href={`tel:${incident.reporterPhone}`} className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-800 hover:bg-cyan-100"><Phone size={13} /> {incident.reporterPhone}</a>}{incident.reporterEmail && <a href={`mailto:${incident.reporterEmail}`} className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800 hover:bg-violet-100"><Mail size={13} /> {incident.reporterEmail}</a>}</div><div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Route</span><select value={incident.assignedOrganizationId ?? ""} onChange={event => onUpdate(incident.id, incident.status as Status, incident.version, event.target.value ? Number(event.target.value) : null)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"><option value="">Auto / unassigned</option>{agencyDirectory.filter(agency => agency.isActive).map(agency => <option key={agency.id} value={agency.id}>{agency.name} · {agency.type}</option>)}</select>{incident.assignedOrganizationId && <span className="text-[11px] font-bold text-emerald-700">Manual override active</span>}</div></div></div><div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">{incident.status === "submitted" && <Button onClick={() => onUpdate(incident.id, "received", incident.version)} className="rounded-xl bg-[#063f3d] text-xs">Acknowledge & queue agency</Button>}{incident.status === "received" && <Button onClick={() => onUpdate(incident.id, "triaged", incident.version)} className="rounded-xl bg-[#063f3d] text-xs">Triage</Button>}{incident.status === "triaged" && <Button onClick={() => onUpdate(incident.id, "assigned", incident.version)} className="rounded-xl bg-[#063f3d] text-xs">Assign</Button>}{incident.status === "assigned" && <Button onClick={() => onUpdate(incident.id, "responding", incident.version)} className="rounded-xl bg-[#063f3d] text-xs">Mark responding</Button>}{incident.status === "responding" && <Button onClick={() => onUpdate(incident.id, "arrived", incident.version)} className="rounded-xl bg-[#063f3d] text-xs">Mark arrived</Button>}{incident.status === "arrived" && <Button onClick={() => onUpdate(incident.id, "resolved", incident.version)} className="rounded-xl bg-emerald-500 text-xs text-emerald-950 hover:bg-emerald-400">Resolve</Button>}</div></div></div>) : <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No incidents match this queue filter.</div>}</div>}
      </div>
    </main>
  );
}
