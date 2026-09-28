import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, MapPin, MessageCircleHeart, Radio, Send, ShieldCheck, Siren } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { createLocalChatterMessage, loadLocalChatter, LOCAL_CHATTER_NOTICE, subscribeToLocalChatter, type ChatterMessage } from "@/lib/localChatter";

function formatTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return isToday ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

export default function Chatter() {
  const { user, isAuthenticated, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/sign-in" });
  const [messages, setMessages] = useState<ChatterMessage[]>(() => loadLocalChatter());
  const [body, setBody] = useState("");
  const [area, setArea] = useState("");
  const [replyTo, setReplyTo] = useState<ChatterMessage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const repliesByMessage = useMemo(() => messages.reduce<Record<string, ChatterMessage[]>>((groups, message) => {
    if (message.replyToId) (groups[message.replyToId] ??= []).push(message);
    return groups;
  }, {}), [messages]);
  const topLevelMessages = useMemo(() => messages.filter(message => !message.replyToId), [messages]);

  function refresh() {
    setMessages(loadLocalChatter());
  }

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToLocalChatter(refresh);
    const timer = window.setInterval(refresh, 2000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, []);

  function sendMessage() {
    if (!user || !body.trim()) return;
    setIsSending(true);
    try {
      createLocalChatterMessage(user, { body, area: replyTo ? undefined : area, replyToId: replyTo?.id });
      setBody("");
      setArea("");
      setReplyTo(null);
      refresh();
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Your message could not be sent.");
    } finally {
      setIsSending(false);
    }
  }

  if (!isAuthenticated || !user) return null;

  return <main className="min-h-screen bg-[#f5f8f7] text-slate-950">
    <header className="sticky top-0 z-40 border-b border-white/70 bg-white/80 shadow-[0_12px_40px_rgba(6,63,61,0.06)] backdrop-blur-2xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/app" className="flex min-w-0 items-center gap-3 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#063f3d] text-white shadow-lg shadow-emerald-950/10"><ShieldCheck size={21} /></span><span className="min-w-0"><span className="block text-[15px] font-black tracking-[0.18em] text-[#063f3d]">ECR CHATTER</span><span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Community help channel</span></span></Link>
        <div className="flex items-center gap-1 sm:gap-2"><Link href="/app" className="hidden rounded-full px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 sm:inline-flex">Citizen app</Link><button onClick={() => logout()} className="rounded-full px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Sign out</button></div>
      </div>
    </header>
    <section className="border-b border-emerald-100 bg-[#063f3d] px-4 py-8 text-white sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-5xl"><p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-100"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> Community coordination</p><h1 className="mt-4 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">Ask for attention. Share safe, useful updates.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/75">Use Chatter to alert nearby community members when you need help or see something concerning. Do not confront a threat or share exact addresses, phone numbers, or personal details here.</p><div className="mt-5 flex flex-wrap gap-3"><a href="tel:112" className="inline-flex items-center gap-2 rounded-xl bg-[#13b981] px-4 py-2.5 text-sm font-black text-[#022c2b] hover:bg-[#34d399]"><Radio size={16} /> Call 112 for immediate danger</a><Link href="/app" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/15"><Siren size={16} /> File an ECR report</Link></div></div>
    </section>
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-8">
      <section className="min-w-0">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><MessageCircleHeart size={19} /></span><div><h2 className="text-base font-black">Post to Chatter</h2><p className="mt-1 text-xs leading-5 text-slate-500">Keep it brief and action-focused. Your name is shown to registered users.</p></div></div>
          {replyTo && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-cyan-50 px-3 py-2 text-xs text-cyan-900"><span className="truncate">Replying to {replyTo.authorName}: {replyTo.body}</span><button onClick={() => setReplyTo(null)} className="shrink-0 font-black underline">Cancel</button></div>}
          <textarea value={body} onChange={event => setBody(event.target.value)} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendMessage(); }} maxLength={500} rows={4} placeholder={replyTo ? "Share a useful update or say how you can safely help…" : "What is happening? Include only safe details people need to know…"} className="mt-4 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none transition focus:bg-white focus:ring-2 focus:ring-emerald-500" />
          {!replyTo && <label className="mt-3 block"><span className="text-xs font-bold text-slate-600">Approximate area <span className="font-normal text-slate-400">optional — no exact address</span></span><div className="relative mt-1"><MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input value={area} onChange={event => setArea(event.target.value)} maxLength={120} placeholder="e.g. Near Central Market" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500" /></div></label>}
          <div className="mt-3 flex items-center justify-between gap-3"><span className="text-[11px] text-slate-400">{body.length}/500 · Ctrl/⌘ + Enter to send</span><Button disabled={!body.trim() || isSending} onClick={sendMessage} className="rounded-xl bg-[#063f3d] font-black hover:bg-[#075b55]">{isSending ? "Sending…" : replyTo ? "Send reply" : "Send alert"}<Send className="ml-2" size={15} /></Button></div>
        </div>
        <div className="mt-6"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Live community feed</p><h2 className="mt-1 text-xl font-black">Recent messages</h2></div><button onClick={refresh} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 hover:border-emerald-300 hover:text-emerald-800">Refresh</button></div>
          <div className="mt-4 space-y-3">{topLevelMessages.length ? topLevelMessages.map(message => <MessageCard key={message.id} message={message} replies={repliesByMessage[message.id] ?? []} currentUserId={user.id} onReply={() => { setReplyTo(message); document.querySelector<HTMLTextAreaElement>("textarea")?.focus(); }} />) : <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white p-9 text-center"><MessageCircleHeart className="mx-auto text-slate-300" size={30} /><p className="mt-3 text-sm font-black">No Chatter messages yet</p><p className="mt-1 text-xs leading-5 text-slate-500">When it is safe, be the first to share an alert or helpful update.</p></div>}<div ref={bottomRef} /></div>
        </div>
      </section>
      <aside className="space-y-4"><div className="rounded-[1.5rem] border border-amber-100 bg-amber-50 p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Use safely</p><ul className="mt-3 space-y-2 text-xs leading-5 text-amber-950/80"><li>• Call official emergency services for immediate danger.</li><li>• Do not chase, confront, or put yourself at risk.</li><li>• Share an approximate area, never an exact home address.</li><li>• Only post information you can safely verify.</li></ul></div><div className="rounded-[1.5rem] border border-cyan-100 bg-cyan-50/70 p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">Prototype storage</p><p className="mt-2 text-xs leading-5 text-cyan-950/75">{LOCAL_CHATTER_NOTICE}</p></div></aside>
    </div>
  </main>;
}

function MessageCard({ message, replies, currentUserId, onReply }: { message: ChatterMessage; replies: ChatterMessage[]; currentUserId: string; onReply: () => void }) {
  return <article className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xs font-black ${message.authorId === currentUserId ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{initials(message.authorName)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="text-sm font-black">{message.authorId === currentUserId ? "You" : message.authorName}</p><span className="text-xs text-slate-400">{formatTime(message.createdAt)}</span>{message.area && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><MapPin size={12} /> {message.area}</span>}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{message.body}</p><button onClick={onReply} className="mt-3 text-xs font-black text-emerald-700 hover:text-emerald-900">Reply with a safe update</button></div></div>{replies.length > 0 && <div className="mt-4 space-y-3 border-l-2 border-emerald-100 pl-4">{replies.map(reply => <div key={reply.id} className="flex gap-2.5"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[9px] font-black text-slate-600">{initials(reply.authorName)}</span><div className="min-w-0"><p className="text-xs font-black">{reply.authorId === currentUserId ? "You" : reply.authorName} <span className="ml-1 font-normal text-slate-400">{formatTime(reply.createdAt)}</span></p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600">{reply.body}</p></div></div>)}</div>}</article>;
}
