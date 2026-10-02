import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  EyeOff,
  MessageCircle,
  Send,
  ShieldCheck,
  Siren,
} from "lucide-react";
import {
  firebaseConfigured,
  hideCommunityMessage,
  sendCommunityMessage,
  subscribeToAdminCommunityChat,
  subscribeToCommunityChat,
  type CommunityMessage,
} from "@/lib/firebase";
import { toast } from "sonner";

type CommunityChatProps = {
  adminMode?: boolean;
};

function messageTime(value: unknown) {
  if (!value) return "Just now";
  const date =
    typeof value === "object" && value !== null && "toDate" in value
      ? (value as { toDate: () => Date }).toDate()
      : new Date(value as string | number);
  return Number.isNaN(date.getTime())
    ? "Just now"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function messageTone(kind: CommunityMessage["kind"]) {
  if (kind === "alert") return "border-rose-100 bg-rose-50/80";
  if (kind === "admin_update") return "border-emerald-100 bg-emerald-50/80";
  return "border-slate-100 bg-white";
}

export default function CommunityChat({
  adminMode = false,
}: CommunityChatProps) {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );
  const firstSnapshot = useRef(true);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }
    const subscribe = adminMode
      ? subscribeToAdminCommunityChat
      : subscribeToCommunityChat;
    const stop = subscribe(
      nextMessages => {
        if (
          !firstSnapshot.current &&
          nextMessages.length > messages.length &&
          notificationsEnabled
        ) {
          const latest = nextMessages[nextMessages.length - 1];
          if (typeof Notification !== "undefined") {
            new Notification(
              latest.kind === "alert"
                ? "New ECR alert"
                : "ECR community update",
              { body: latest.text.slice(0, 140) }
            );
          }
        }
        firstSnapshot.current = false;
        setMessages(nextMessages);
        setLoading(false);
      },
      () => {
        setLoading(false);
        toast.error("The community room is temporarily unavailable.");
      }
    );
    return stop;
  }, [adminMode, notificationsEnabled]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await sendCommunityMessage({
        text: draft,
        kind: adminMode ? "admin_update" : "comment",
      });
      setDraft("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send the message."
      );
    } finally {
      setSending(false);
    }
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      toast.error("Notifications are not available in this browser.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
    if (permission !== "granted")
      toast.error("Notification permission was not enabled.");
  }

  async function hideMessage(message: CommunityMessage) {
    try {
      await hideCommunityMessage(message.id);
      toast.success("Message hidden from the public room.");
    } catch {
      toast.error("Could not moderate this message.");
    }
  }

  return (
    <section
      className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
      aria-label="ECR community chat"
    >
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
              <MessageCircle size={21} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                {adminMode ? "Moderation room" : "Community room"}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {adminMode
                  ? "Monitor alerts and updates"
                  : "See what is happening nearby"}
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                Sanitized alert cards are shared automatically. Community
                comments and verified ECR updates stay in the same live room.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={enableNotifications}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
          >
            {notificationsEnabled ? <Bell size={14} /> : <BellOff size={14} />}
            {notificationsEnabled ? "Notifications on" : "Enable alerts"}
          </button>
        </div>
        <div className="max-h-[30rem] space-y-3 overflow-y-auto p-4 sm:p-6">
          {loading && (
            <p className="py-10 text-center text-sm text-slate-500">
              Loading community updates…
            </p>
          )}
          {!loading && !messages.length && (
            <div className="grid min-h-40 place-items-center text-center text-sm text-slate-500">
              <div>
                <Siren className="mx-auto text-emerald-600" size={24} />
                <p className="mt-3 font-bold">No community updates yet.</p>
                <p className="mt-1 text-xs">
                  Be the first to share a useful observation.
                </p>
              </div>
            </div>
          )}
          {messages.map(message => (
            <article
              key={message.id}
              className={`rounded-2xl border p-4 ${messageTone(message.kind)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  {message.kind === "alert" ? (
                    <Siren size={14} className="text-rose-600" />
                  ) : message.kind === "admin_update" ? (
                    <ShieldCheck size={14} className="text-emerald-700" />
                  ) : (
                    <MessageCircle size={14} />
                  )}
                  {message.kind === "alert"
                    ? "Emergency alert"
                    : message.kind === "admin_update"
                      ? "Verified ECR update"
                      : "Community comment"}
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  {messageTime(message.createdAt)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {message.text}
              </p>
              {message.publicReference && (
                <a
                  href={`/?report=${encodeURIComponent(message.publicReference)}#track-report`}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:underline"
                >
                  Track {message.publicReference}
                </a>
              )}
              {adminMode && (
                <button
                  type="button"
                  onClick={() => hideMessage(message)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-rose-700 hover:underline"
                >
                  <EyeOff size={13} /> Hide message
                </button>
              )}
            </article>
          ))}
        </div>
        <form
          onSubmit={sendMessage}
          className="flex gap-2 border-t border-slate-200 bg-white p-4 sm:p-5"
        >
          <label
            className="sr-only"
            htmlFor={adminMode ? "admin-chat-draft" : "community-chat-draft"}
          >
            Message
          </label>
          <input
            id={adminMode ? "admin-chat-draft" : "community-chat-draft"}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            maxLength={800}
            placeholder={
              adminMode
                ? "Post a verified ECR update…"
                : "Share an observation or helpful comment…"
            }
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#063f3d] px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            <Send size={15} /> <span className="hidden sm:inline">Send</span>
          </button>
        </form>
        <p className="border-t border-slate-100 bg-white px-4 pb-4 text-[11px] leading-5 text-slate-400 sm:px-5">
          Do not post personal contact details, exact private locations, or
          sensitive medical information. Call official emergency services when
          someone is in immediate danger.
        </p>
      </div>
    </section>
  );
}
