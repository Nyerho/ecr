import { useEffect, useState } from "react";
import { CheckCircle2, Copy, RefreshCw, X, XCircle } from "lucide-react";
import { firebaseConfigured } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

type Check = { label: string; detail: string; ok: boolean };

function collectChecks(): Check[] {
  const notificationState = typeof Notification === "undefined" ? "Not supported" : Notification.permission;
  return [
    {
      label: "Network connection",
      detail: typeof navigator !== "undefined" && navigator.onLine ? "Browser reports an online connection." : "Browser reports offline. Pending reports remain on this device.",
      ok: typeof navigator !== "undefined" && navigator.onLine,
    },
    {
      label: "Firebase service configuration",
      detail: firebaseConfigured ? "Firebase configuration is available to this app." : "Firebase configuration is missing in this environment.",
      ok: firebaseConfigured,
    },
    {
      label: "Location support",
      detail: typeof navigator !== "undefined" && "geolocation" in navigator ? "This browser can request location permission." : "This browser does not expose location support.",
      ok: typeof navigator !== "undefined" && "geolocation" in navigator,
    },
    {
      label: "Notification permission",
      detail: notificationState === "granted" ? "Browser notifications are allowed." : notificationState === "denied" ? "Browser notifications are blocked." : `Permission is ${notificationState.toLowerCase()}.`,
      ok: notificationState === "granted",
    },
  ];
}

export default function DiagnosticsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    const refresh = () => setChecks(collectChecks());
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, [open]);
  if (!open) return null;
  const summary = checks.map(check => `${check.label}: ${check.ok ? "OK" : "Needs attention"}`).join("\n");
  async function copySummary() {
    try {
      await navigator.clipboard.writeText(`ECR diagnostics\n${summary}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="diagnostics-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-3xl border border-white/80 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Release 5</p><h2 id="diagnostics-title" className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Connection diagnostics</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">A quick local check for troubleshooting. It does not read or display report details.</p></div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close diagnostics"><X size={20} /></button>
        </div>
        <div className="mt-6 space-y-3" aria-live="polite">{checks.map(check => <div key={check.label} className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70"><div className="mt-0.5">{check.ok ? <CheckCircle2 className="text-emerald-600" size={19} aria-hidden="true" /> : <XCircle className="text-amber-600" size={19} aria-hidden="true" />}</div><div><p className="text-sm font-bold text-slate-900 dark:text-white">{check.label}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{check.detail}</p></div></div>)}</div>
        <div className="mt-6 flex flex-wrap gap-2"><Button variant="outline" onClick={() => setChecks(collectChecks())}><RefreshCw size={15} className="mr-2" />Refresh</Button><Button variant="outline" onClick={copySummary}><Copy size={15} className="mr-2" />{copied ? "Copied" : "Copy summary"}</Button><Button onClick={onClose}>Done</Button></div>
      </div>
    </div>
  );
}
