import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Filter,
  Flag,
  HandHelping,
  HelpCircle,
  MapPin,
  MessageCircleHeart,
  MoreVertical,
  Package,
  Radio,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  CHATTER_CATEGORIES,
  createLocalChatterMessage,
  formatTimeAgo,
  getMutedUserIds,
  getReportedMessageIds,
  loadLocalChatter,
  LOCAL_CHATTER_NOTICE,
  reportLocalChatterMessage,
  subscribeToLocalChatter,
  toggleMuteUser,
  toggleResolveLocalChatterMessage,
  type ChatterCategory,
  type ChatterMessage,
  type ChatterStatus,
  type ChatterUrgency,
} from "@/lib/localChatter";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

const REPORT_REASONS = [
  "False or misleading emergency information",
  "Dangerous advice or encouraging confrontation",
  "Contains private phone numbers or exact residential address",
  "Harassment, abuse, or offensive content",
  "Spam, advertising, or unrelated content",
];

export default function Chatter() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/sign-in" });

  const [messages, setMessages] = useState<ChatterMessage[]>(() => loadLocalChatter());
  const [body, setBody] = useState("");
  const [area, setArea] = useState("");
  const [category, setCategory] = useState<ChatterCategory>("general");
  const [urgency, setUrgency] = useState<ChatterUrgency>("low");
  const [replyTo, setReplyTo] = useState<ChatterMessage | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ChatterStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showMuted, setShowMuted] = useState(false);

  // Moderation state
  const [mutedUserIds, setMutedUserIds] = useState<string[]>(() => getMutedUserIds());
  const [reportedMessageIds, setReportedMessageIds] = useState<string[]>(() => getReportedMessageIds(user?.id));
  const [reportingMessage, setReportingMessage] = useState<ChatterMessage | null>(null);
  const [selectedReportReason, setSelectedReportReason] = useState(REPORT_REASONS[0]);

  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = () => {
    setMessages(loadLocalChatter());
    setMutedUserIds(getMutedUserIds());
    if (user?.id) setReportedMessageIds(getReportedMessageIds(user.id));
  };

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToLocalChatter(refresh);
    const timer = window.setInterval(refresh, 2500);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [user?.id]);

  const repliesByMessage = useMemo(() => {
    return messages.reduce<Record<string, ChatterMessage[]>>((groups, message) => {
      if (message.replyToId) (groups[message.replyToId] ??= []).push(message);
      return groups;
    }, {});
  }, [messages]);

  const topLevelMessages = useMemo(() => {
    return messages.filter(message => !message.replyToId);
  }, [messages]);

  const filteredMessages = useMemo(() => {
    return topLevelMessages.filter(message => {
      // Mute filter
      if (!showMuted && mutedUserIds.includes(message.authorId)) return false;

      // Status filter
      if (statusFilter !== "all" && message.status !== statusFilter) return false;

      // Category filter
      if (categoryFilter !== "all" && message.category !== categoryFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesBody = message.body.toLowerCase().includes(query);
        const matchesArea = Boolean(message.area?.toLowerCase().includes(query));
        const matchesAuthor = message.authorName.toLowerCase().includes(query);
        const matchesReplies = (repliesByMessage[message.id] ?? []).some(r =>
          r.body.toLowerCase().includes(query) || r.authorName.toLowerCase().includes(query)
        );
        if (!matchesBody && !matchesArea && !matchesAuthor && !matchesReplies) return false;
      }

      return true;
    });
  }, [topLevelMessages, mutedUserIds, showMuted, statusFilter, categoryFilter, searchQuery, repliesByMessage]);

  const activeCount = useMemo(() => topLevelMessages.filter(m => m.status === "open").length, [topLevelMessages]);
  const resolvedCount = useMemo(() => topLevelMessages.filter(m => m.status === "resolved").length, [topLevelMessages]);

  function sendMessage() {
    if (!user || !body.trim()) return;
    setIsSending(true);
    try {
      createLocalChatterMessage(user, {
        body,
        area: replyTo ? undefined : area,
        category: replyTo ? undefined : category,
        urgency: replyTo ? undefined : urgency,
        replyToId: replyTo?.id,
      });
      setBody("");
      setArea("");
      setUrgency("low");
      setReplyTo(null);
      refresh();
      toast.success(replyTo ? "Reply posted to thread" : "Alert posted to Chatter feed");
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Your message could not be sent.");
    } finally {
      setIsSending(false);
    }
  }

  function handleToggleResolve(message: ChatterMessage) {
    if (!user) return;
    try {
      const updated = toggleResolveLocalChatterMessage(message.id, user);
      refresh();
      toast.success(
        updated.status === "resolved"
          ? "Alert marked as resolved. Neighbors will see this request is fulfilled."
          : "Alert reopened as active."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update alert status.");
    }
  }

  function handleEscalate(message: ChatterMessage) {
    let formalCategory = "other";
    if (message.category === "need_help") formalCategory = "medical";
    else if (message.category === "hazard") formalCategory = "road_accident";

    sessionStorage.setItem(
      "ecr_prefill_report",
      JSON.stringify({
        description: message.body,
        locationLabel: message.area || "",
        category: formalCategory,
      })
    );
    navigate("/app");
  }

  function handleReportSubmit() {
    if (!reportingMessage || !user) return;
    try {
      reportLocalChatterMessage(reportingMessage.id, user.id, selectedReportReason);
      setReportedMessageIds(prev => [...prev, reportingMessage.id]);
      setReportingMessage(null);
      toast.success("Thank you. This message has been flagged for moderation review.");
    } catch {
      toast.error("Could not submit content report.");
    }
  }

  function handleToggleMute(authorId: string, authorName: string) {
    const isNowMuted = toggleMuteUser(authorId);
    setMutedUserIds(getMutedUserIds());
    if (isNowMuted) {
      toast.info(`Muted ${authorName}. Their messages will be hidden in this browser.`);
    } else {
      toast.success(`Unmuted ${authorName}.`);
    }
  }

  if (!isAuthenticated || !user) return null;

  return (
    <main className="min-h-screen bg-[#f5f8f7] text-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/80 shadow-[0_12px_40px_rgba(6,63,61,0.06)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/app" className="flex min-w-0 items-center gap-3 text-left">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#063f3d] text-white shadow-lg shadow-emerald-950/10">
              <ShieldCheck size={21} />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-black tracking-[0.18em] text-[#063f3d]">ECR CHATTER</span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Community coordination channel
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800"
            >
              <Siren size={13} className="text-emerald-600" />
              Citizen app
            </Link>
            <button
              onClick={() => logout()}
              className="rounded-full px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Safety & Emergency Notice Banner */}
      <section className="border-b border-emerald-950/20 bg-[#063f3d] px-4 py-7 text-white sm:px-6 sm:py-9 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Community Help Channel
              </p>
              <h1 className="mt-3 max-w-2xl text-2xl font-black tracking-tight sm:text-3xl">
                Ask for informal help. Share safe, local alerts.
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-emerald-50/75 sm:text-sm">
                Chatter connects nearby neighbours for mutual aid. It is <strong>not official dispatch</strong> and is not
                continuously monitored. Never share exact home addresses or phone numbers publicly.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 sm:self-center">
              <a
                href="tel:112"
                className="inline-flex items-center gap-2 rounded-xl bg-[#13b981] px-4 py-2 text-xs font-black text-[#022c2b] shadow-md transition hover:bg-[#34d399]"
              >
                <Radio size={14} /> Call 112 for urgent danger
              </a>
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20"
              >
                <Siren size={14} /> File formal ECR report
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Layout */}
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_310px] lg:px-8">
        <section className="min-w-0 space-y-6">
          {/* Post Creation Box */}
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <MessageCircleHeart size={18} />
                </span>
                <div>
                  <h2 className="text-sm font-black">{replyTo ? "Reply to thread" : "Post a community alert"}</h2>
                  <p className="text-[11px] text-slate-400">
                    Posting as <span className="font-bold text-slate-700">{user.name}</span>
                  </p>
                </div>
              </div>
              {replyTo && (
                <button
                  onClick={() => setReplyTo(null)}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200"
                >
                  Cancel reply
                </button>
              )}
            </div>

            {/* Replying banner */}
            {replyTo && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50/80 p-2.5 text-xs text-emerald-950">
                <div className="flex-1 truncate">
                  <span className="font-bold text-emerald-800">Replying to {replyTo.authorName}: </span>
                  <span className="text-slate-600">{replyTo.body}</span>
                </div>
              </div>
            )}

            {/* Category Selector Chips (only for new top-level posts) */}
            {!replyTo && (
              <div className="mt-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Alert Category:</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {CHATTER_CATEGORIES.map(cat => {
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`rounded-xl border px-3 py-1 text-xs font-bold transition ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:border-slate-300"
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Urgency Selector (only for new top-level posts) */}
            {!replyTo && (
              <div className="mt-3.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Alert Urgency:
                  </span>

            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
              { id: "low", label: "Low" },
              { id: "medium", label: "Medium" },
              { id: "high", label: "High" },
              { id: "critical", label: "Critical" },
              ].map(level => {
              const isSelected = urgency === level.id;

            return (
                <button
                key={level.id}
                type="button"
                onClick={() => setUrgency(level.id as ChatterUrgency)}
                className={`rounded-xl border px-3 py-1 text-xs font-bold transition ${
                isSelected
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:border-slate-300"
                  }`}
                  >
                  {level.label}
                </button>
                  );
                })}
                </div>
              </div>
            )}

            {/* Textarea */}
            <textarea
              value={body}
              onChange={event => setBody(event.target.value)}
              onKeyDown={event => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendMessage();
              }}
              maxLength={500}
              rows={replyTo ? 3 : 4}
              placeholder={
                replyTo
                  ? "Share a safe update or how you can assist in this thread…"
                  : "What is happening? Describe the situation safely and concisely…"
              }
              className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            />

            {/* Approximate Area input */}
            {!replyTo && (
              <label className="mt-2.5 block">
                <span className="text-[11px] font-bold text-slate-500">
                  Approximate area <span className="font-normal text-slate-400">(e.g. Near Market Square, North Gate — no exact door numbers)</span>
                </span>
                <div className="relative mt-1">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    value={area}
                    onChange={event => setArea(event.target.value)}
                    maxLength={120}
                    placeholder="e.g. Broad Street area, Ward 4"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </label>
            )}

            {/* Bottom Row with Character Count Warning */}
            <div className="mt-3 flex items-center justify-between gap-3">
              <span
                className={`text-[11px] transition ${
                  body.length > 480
                    ? "font-black text-rose-600"
                    : body.length > 420
                    ? "font-bold text-amber-600"
                    : "text-slate-400"
                }`}
              >
                {body.length}/500 chars · ⌘/Ctrl+Enter to post
              </span>
              <Button
                disabled={!body.trim() || isSending}
                onClick={sendMessage}
                className="rounded-xl bg-[#063f3d] px-4 py-2 text-xs font-black text-white hover:bg-[#075b55]"
              >
                {isSending ? "Posting…" : replyTo ? "Send reply" : "Publish alert"}
                <Send className="ml-1.5" size={13} />
              </Button>
            </div>
          </div>

          {/* Feed Filter & Search Controls */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="Search alerts by landmark, need, or keyword…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold text-slate-600">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`rounded-lg px-2.5 py-1 transition ${statusFilter === "all" ? "bg-white text-slate-950 shadow-xs font-black" : "hover:text-slate-900"}`}
                >
                  All ({topLevelMessages.length})
                </button>
                <button
                  onClick={() => setStatusFilter("open")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 transition ${statusFilter === "open" ? "bg-white text-emerald-800 shadow-xs font-black" : "hover:text-slate-900"}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active ({activeCount})
                </button>
                <button
                  onClick={() => setStatusFilter("resolved")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 transition ${statusFilter === "resolved" ? "bg-white text-slate-800 shadow-xs font-black" : "hover:text-slate-900"}`}
                >
                  <Check size={11} className="text-slate-500" />
                  Resolved ({resolvedCount})
                </button>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Filter:</span>
              <button
                onClick={() => setCategoryFilter("all")}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
                  categoryFilter === "all"
                    ? "bg-[#063f3d] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All categories
              </button>
              {CHATTER_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
                    categoryFilter === cat.id
                      ? "bg-[#063f3d] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {cat.label}
                </button>
              ))}

              {mutedUserIds.length > 0 && (
                <button
                  onClick={() => setShowMuted(prev => !prev)}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                >
                  <UserX size={11} />
                  {showMuted ? "Hide muted users" : `Show muted (${mutedUserIds.length})`}
                </button>
              )}
            </div>
          </div>

          {/* Live Message Feed */}
          <div className="space-y-3.5">
            {filteredMessages.length ? (
              filteredMessages.map(message => (
                <MessageCard
                  key={message.id}
                  message={message}
                  replies={repliesByMessage[message.id] ?? []}
                  currentUserId={user.id}
                  isReported={reportedMessageIds.includes(message.id)}
                  isAuthorMuted={mutedUserIds.includes(message.authorId)}
                  onReply={() => {
                    setReplyTo(message);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    document.querySelector<HTMLTextAreaElement>("textarea")?.focus();
                  }}
                  onToggleResolve={() => handleToggleResolve(message)}
                  onEscalate={() => handleEscalate(message)}
                  onOpenReport={() => setReportingMessage(message)}
                  onToggleMute={() => handleToggleMute(message.authorId, message.authorName)}
                />
              ))
            ) : (
              <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white p-10 text-center">
                <MessageCircleHeart className="mx-auto text-slate-300" size={32} />
                <p className="mt-3 text-sm font-black text-slate-700">No alerts match your filter</p>
                <p className="mt-1 text-xs text-slate-400">
                  Try changing your search terms or category filter, or post a new alert above.
                </p>
                {(searchQuery || statusFilter !== "all" || categoryFilter !== "all") && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                      setCategoryFilter("all");
                    }}
                    className="mt-3.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white"
                  >
                    <RotateCcw size={12} /> Clear filters
                  </button>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </section>

        {/* Sidebar Info & Safety */}
        <aside className="space-y-4">
          <div className="rounded-3xl border border-amber-200/80 bg-amber-50/90 p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-200 text-amber-900">
                <AlertTriangle size={13} />
              </span>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-900">Safety & Conduct</p>
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-amber-950/85">
              <li className="flex gap-1.5">
                <span className="font-bold">•</span>
                <span><strong>Emergency:</strong> Call 112 for imminent threat to life or property.</span>
              </li>
              <li className="flex gap-1.5">
                <span className="font-bold">•</span>
                <span><strong>No confrontation:</strong> Do not approach dangerous scenes or suspect vehicles.</span>
              </li>
              <li className="flex gap-1.5">
                <span className="font-bold">•</span>
                <span><strong>Coarse locations only:</strong> Provide landmarks, never exact personal door numbers.</span>
              </li>
              <li className="flex gap-1.5">
                <span className="font-bold">•</span>
                <span><strong>Resolve when done:</strong> Click "Mark as resolved" once you receive help.</span>
              </li>
            </ul>
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-200 text-emerald-900">
                <HandHelping size={13} />
              </span>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-900">Need Official Responders?</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-emerald-950/80">
              Community chatter is for mutual neighbour support. If you need official emergency units dispatched:
            </p>
            <Link
              href="/app"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#063f3d] py-2.5 text-xs font-black text-white hover:bg-[#075b55]"
            >
              <Siren size={14} /> Open ECR Report Form
            </Link>
          </div>

          <div className="rounded-3xl border border-cyan-100 bg-cyan-50/70 p-5 shadow-xs">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-800">Prototype Storage</p>
            <p className="mt-2 text-xs leading-5 text-cyan-950/75">{LOCAL_CHATTER_NOTICE}</p>
          </div>
        </aside>
      </div>

      {/* Moderation Reporting Dialog */}
      {reportingMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-100 text-rose-700">
                  <Flag size={17} />
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900">Report Message</h3>
                  <p className="text-xs text-slate-500">Flagged content is reviewed by local administrators.</p>
                </div>
              </div>
              <button
                onClick={() => setReportingMessage(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
              <span className="font-bold text-slate-800">{reportingMessage.authorName}: </span>
              <span className="italic">"{reportingMessage.body}"</span>
            </div>

            <div className="mt-4">
              <p className="text-xs font-bold text-slate-700">Select a reason for reporting:</p>
              <div className="mt-2 space-y-2">
                {REPORT_REASONS.map(reason => (
                  <label
                    key={reason}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 p-2.5 text-xs transition hover:bg-slate-50"
                  >
                    <input
                      type="radio"
                      name="report_reason"
                      checked={selectedReportReason === reason}
                      onChange={() => setSelectedReportReason(reason)}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-medium text-slate-800">{reason}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <Button variant="outline" onClick={() => setReportingMessage(null)} className="rounded-xl text-xs">
                Cancel
              </Button>
              <Button onClick={handleReportSubmit} className="rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700">
                Submit report
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function MessageCard({
  message,
  replies,
  currentUserId,
  isReported,
  isAuthorMuted,
  onReply,
  onToggleResolve,
  onEscalate,
  onOpenReport,
  onToggleMute,
}: {
  message: ChatterMessage;
  replies: ChatterMessage[];
  currentUserId: string;
  isReported: boolean;
  isAuthorMuted: boolean;
  onReply: () => void;
  onToggleResolve: () => void;
  onEscalate: () => void;
  onOpenReport: () => void;
  onToggleMute: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isAuthor = message.authorId === currentUserId;
  const isResolved = message.status === "resolved";

  const categoryMeta = CHATTER_CATEGORIES.find(c => c.id === message.category) ?? CHATTER_CATEGORIES[0];
const urgencyMeta = {
  low: {
    label: "Low",
    className: "border-slate-300 bg-slate-50 text-slate-600",
  },
  medium: {
    label: "Medium",
    className: "border-amber-400 bg-amber-50 text-amber-700",
  },
  high: {
    label: "High",
    className: "border-orange-400 bg-orange-50 text-orange-700",
  },
  critical: {
    label: "Critical",
    className: "border-red-500 bg-red-50 text-red-700",
  },
}[message.urgency];

  return (
    <article
      className={`rounded-[1.6rem] border transition shadow-sm p-4 sm:p-5 ${
        isResolved
          ? "border-slate-200 bg-white/70"
          : message.category === "need_help"
          ? "border-rose-200 bg-white"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Author Avatar */}
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xs font-black ${
            isAuthor ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
          }`}
        >
          {initials(message.authorName)}
        </span>

        {/* Content Body */}
        <div className="min-w-0 flex-1">
          {/* Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-sm font-black text-slate-900">{isAuthor ? "You" : message.authorName}</span>

              {/* Status Badge */}
              {isResolved ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                  <Check size={10} className="text-emerald-600" /> Resolved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                </span>
              )}

              {/* Category Badge */}
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${categoryMeta.badgeClass}`}>
                {categoryMeta.label}
              </span>
              
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${urgencyMeta.className}`}>
                  {urgencyMeta.label}
                  </span>

              {/* Relative Time */}
              <span
                className="text-[11px] text-slate-400"
                title={new Date(message.createdAt).toLocaleString()}
              >
                {formatTimeAgo(message.createdAt)}
              </span>

              {/* Approximate Area */}
              {message.area && (
                <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-700">
                  <MapPin size={11} /> {message.area}
                </span>
              )}

              {isReported && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                  <Flag size={9} /> Reported
                </span>
              )}
            </div>

            {/* Actions Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(prev => !prev)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="More options"
              >
                <MoreVertical size={16} />
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-full z-20 mt-1 w-48 rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  {isAuthor && (
                    <button
                      onClick={() => {
                        onToggleResolve();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      {isResolved ? "Reopen as active" : "Mark as resolved"}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onEscalate();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-bold text-emerald-800 hover:bg-emerald-50"
                  >
                    <Siren size={14} className="text-emerald-600" />
                    File official report
                  </button>
                  {!isAuthor && (
                    <>
                      <button
                        onClick={() => {
                          onOpenReport();
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-bold text-rose-700 hover:bg-rose-50"
                      >
                        <Flag size={14} />
                        Report message
                      </button>
                      <button
                        onClick={() => {
                          onToggleMute();
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-bold text-slate-600 hover:bg-slate-50"
                      >
                        <UserX size={14} />
                        {isAuthorMuted ? `Unmute ${message.authorName}` : `Mute ${message.authorName}`}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Message Text */}
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{message.body}</p>

          {/* Resolved Announcement */}
          {isResolved && (
            <div className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-1.5 text-xs text-slate-600 border border-slate-100">
              <CheckCircle2 size={13} className="text-emerald-600" />
              <span>
                <strong>Notice:</strong> This request was marked as resolved by {isAuthor ? "you" : message.authorName}.
              </span>
            </div>
          )}

          {/* Bottom Action Bar */}
          <div className="mt-3 flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={onReply}
              className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:text-emerald-900"
            >
              Reply with safe update {replies.length > 0 && `(${replies.length})`}
            </button>

            {isAuthor && (
              <button
                onClick={onToggleResolve}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-emerald-700"
              >
                <Check size={12} /> {isResolved ? "Reopen request" : "Mark resolved"}
              </button>
            )}

            <button
              onClick={onEscalate}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-emerald-700"
            >
              <Siren size={11} /> Escalate to official ECR report
            </button>
          </div>
        </div>
      </div>

      {/* Thread Replies */}
      {replies.length > 0 && (
        <div className="mt-4 space-y-2.5 border-l-2 border-emerald-100 pl-4 sm:ml-5">
          {replies.map(reply => (
            <div key={reply.id} className="flex items-start gap-2.5 rounded-xl bg-slate-50/70 p-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-200 text-[10px] font-black text-slate-700">
                {initials(reply.authorName)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-black text-slate-900">
                    {reply.authorId === currentUserId ? "You" : reply.authorName}
                  </p>
                  <span
                    className="text-[10px] text-slate-400"
                    title={new Date(reply.createdAt).toLocaleString()}
                  >
                    {formatTimeAgo(reply.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">{reply.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
