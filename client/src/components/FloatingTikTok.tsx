const TIKTOK_PROFILE = "https://www.tiktok.com/@emergency_com_response?_r=1&_t=ZS-9ACBmoCYvwe";

function TikTokMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 fill-current">
      <path d="M15.7 3c.3 1.8 1.3 3.2 3.3 3.8v3.1a8.8 8.8 0 0 1-3.3-1.1v5.9a6.3 6.3 0 1 1-5.4-6.2v3.3a3 3 0 1 0 2.1 2.9V3h3.3Z" />
    </svg>
  );
}

export default function FloatingTikTok() {
  return (
    <div className="fixed bottom-24 right-5 z-40 sm:bottom-28 sm:right-7">
      <a
        href={TIKTOK_PROFILE}
        target="_blank"
        rel="noreferrer"
        aria-label="Open the ECR TikTok profile"
        className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-xl shadow-slate-950/25 transition hover:-translate-y-1 hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300 focus-visible:ring-offset-2 sm:h-16 sm:w-16"
      >
        <TikTokMark />
        <span className="pointer-events-none absolute bottom-full right-0 mb-3 w-52 origin-bottom-right scale-95 rounded-2xl bg-slate-950 px-3 py-2 text-left text-[11px] font-bold leading-4 text-white opacity-0 shadow-xl transition group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100">
          Follow ECR on TikTok for community updates and safety information.
        </span>
      </a>
    </div>
  );
}
