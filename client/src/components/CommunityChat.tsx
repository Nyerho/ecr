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
  Trash2,
} from "lucide-react";
import {
  deleteCommunityMessage,
  firebaseConfigured,
  hideCommunityMessage,
  observeFirebaseUser,
  unhideCommunityMessage,
  sendCommunityMessage,
  subscribeToAdminCommunityChat,
  subscribeToCommunityChat,
  type CommunityMessage,
} from "@/lib/firebase";
import { formatMessageTimestamp } from "@shared/messageTimestamp";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type CommunityChatProps = {
  adminMode?: boolean;
};

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
  const [authorUid, setAuthorUid] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [messageToDelete, setMessageToDelete] =
    useState<CommunityMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deletionInFlight = useRef(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );
  const latestMessageTime = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return observeFirebaseUser(user => setAuthorUid(user?.uid ?? null));
  }, []);

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
        const latest = nextMessages[nextMessages.length - 1];
        const latestDate = formatMessageTimestamp(latest?.createdAt).dateTime;
        const timestamp = latestDate ? Date.parse(latestDate) : 0;
        if (
          latest &&
          latestMessageTime.current !== null &&
          timestamp > latestMessageTime.current &&
          notificationsEnabled &&
          typeof Notification !== "undefined"
        ) {
          new Notification(
            latest.kind === "alert" ? "New ECR alert" : "ECR community update",
            { body: latest.text.slice(0, 140) }
          );
        }
        latestMessageTime.current = Math.max(
          latestMessageTime.current ?? 0,
          timestamp
        );
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

  async function moderateMessage(message: CommunityMessage) {
    try {
      if (message.visibility === "hidden") {
        await unhideCommunityMessage(message.id);
        toast.success("Message restored to the public room.");
      } else {
        await hideCommunityMessage(message.id);
        toast.success("Message hidden from the public room.");
      }
    } catch {
      toast.error("Could not moderate this message.");
    }
  }

  async function confirmDelete() {
    if (!messageToDelete || deletionInFlight.current) return;
    deletionInFlight.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteCommunityMessage(messageToDelete.id);
      setMessages(current =>
        current.filter(message => message.id !== messageToDelete.id)
      );
      setMessageToDelete(null);
      toast.success("Message deleted from the community room.");
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Could not delete this message. Please try again."
      );
    } finally {
      deletionInFlight.current = false;
      setDeleting(false);
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
        <div className="max-h-120 space-y-3 overflow-y-auto p-4 sm:p-6">
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
          {messages.map(message => {
            const timestamp = formatMessageTimestamp(message.createdAt, now);
            return (
              <article
                key={message.id}
                className={`rounded-2xl border p-4 ${messageTone(message.kind)}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                  <time
                    dateTime={timestamp.dateTime}
                    title={timestamp.fullDate}
                    aria-label={
                      timestamp.fullDate
                        ? `${timestamp.label}, ${timestamp.fullDate}`
                        : timestamp.label
                    }
                    className="text-[11px] font-semibold text-slate-600"
                  >
                    {timestamp.label}
                  </time>
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
                {(adminMode || message.authorUid === authorUid) && (
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    {adminMode && (
                      <button
                        type="button"
                        onClick={() => moderateMessage(message)}
                        className="inline-flex items-center gap-1.5 text-xs font-black text-rose-700 hover:underline"
                      >
                        {message.visibility === "hidden" ? (
                          <>
                            <CheckCircle2 size={13} /> Unhide message
                          </>
                        ) : (
                          <>
                            <EyeOff size={13} /> Hide message
                          </>
                        )}
                      </button>
                    )}
                    {message.authorUid === authorUid && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError("");
                          setMessageToDelete(message);
                        }}
                        className="message-delete-button inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100"
                      >
                        <Trash2 size={13} aria-hidden="true" /> Delete message
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
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
        <p className="border-t border-slate-100 bg-white px-4 pb-4 text-[11px] leading-5 text-slate-600 sm:px-5">
          Do not post personal contact details, exact private locations, or
          sensitive medical information. Call official emergency services when
          someone is in immediate danger.
        </p>
      </div>
      <AlertDialog
        open={Boolean(messageToDelete)}
        onOpenChange={open => {
          if (!open && !deletionInFlight.current) setMessageToDelete(null);
        }}
      >
        <AlertDialogContent className="message-delete-dialog bg-white text-slate-950">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your message?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">
              This permanently removes your message from the community room.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
            {messageToDelete?.text}
          </p>
          {deleteError && (
            <p
              role="alert"
              className="message-delete-error rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
            >
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className="message-delete-cancel border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
            >
              Keep message
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={event => {
                event.preventDefault();
                void confirmDelete();
              }}
              className="message-delete-confirm bg-rose-700 text-white hover:bg-rose-800"
            >
              {deleting ? "Deleting…" : "Delete message"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
