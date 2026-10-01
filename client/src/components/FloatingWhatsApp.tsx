import { MessageCircle } from "lucide-react";

const WHATSAPP_REPORT_CHAT = "https://wa.me/2348100760542?text=Hello%20ECR%2C%20I%20need%20community%20help.%20My%20location%20is%3A%20";

export default function FloatingWhatsApp() {
  return (
    <div className="fixed bottom-5 right-5 z-40 sm:bottom-7 sm:right-7">
      <span className="pointer-events-none absolute -inset-1 animate-ping rounded-full bg-emerald-400/30" />
      <a
        href={WHATSAPP_REPORT_CHAT}
        target="_blank"
        rel="noreferrer"
        aria-label="Open the ECR WhatsApp report chat"
        className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl shadow-emerald-950/25 transition hover:-translate-y-1 hover:bg-[#1ebe5d] focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 sm:h-16 sm:w-16"
      >
        <MessageCircle size={28} strokeWidth={2.4} />
        <span className="pointer-events-none absolute bottom-full right-0 mb-3 w-56 origin-bottom-right scale-95 rounded-2xl bg-slate-950 px-3 py-2 text-left text-[11px] font-bold leading-4 text-white opacity-0 shadow-xl transition group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100">
          Send ECR a text or voice-note report through WhatsApp.
        </span>
      </a>
    </div>
  );
}
