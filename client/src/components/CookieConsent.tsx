import { Cookie, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

const CONSENT_KEY = "ecr-cookie-consent";

type ConsentChoice = "essential" | "all";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(!window.localStorage.getItem(CONSENT_KEY));
    } catch {
      setVisible(true);
    }
  }, []);

  function choose(choice: ConsentChoice) {
    try {
      window.localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ choice, savedAt: new Date().toISOString() })
      );
    } catch {
      // The banner can still be dismissed when browser storage is unavailable.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-3 bottom-3 z-[80] rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-2xl shadow-slate-950/20 backdrop-blur-xl sm:inset-x-auto sm:bottom-5 sm:left-5 sm:max-w-xl sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Cookie size={20} />
        </span>
        <div className="min-w-0">
          <h2
            id="cookie-consent-title"
            className="text-sm font-black text-slate-950"
          >
            Cookies and browser storage
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            ECR uses essential browser storage to keep secure sign-in, consent
            choices, and app preferences working. It does not sell personal
            information. Optional analytics will only be used if enabled in a
            future release.
          </p>
          <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] leading-4 text-slate-500">
            <ShieldCheck
              size={13}
              className="mt-0.5 shrink-0 text-emerald-600"
            />
            You can use the emergency contact directory and reporting tools
            without accepting optional analytics.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => choose("essential")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800"
            >
              Essential only
            </button>
            <button
              type="button"
              onClick={() => choose("all")}
              className="rounded-xl bg-[#063f3d] px-3 py-2 text-xs font-black text-white transition hover:bg-[#075b55]"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
