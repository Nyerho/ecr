import type { LocalUser } from "./localAuth";

export type ChatterCategory = "general" | "need_help" | "hazard" | "supplies" | "check_in";
export type ChatterStatus = "open" | "resolved";

export type ChatterMessage = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  area: string | null;
  category: ChatterCategory;
  status: ChatterStatus;
  resolvedAt: string | null;
  createdAt: string;
  replyToId: string | null;
};

export type ChatterReport = {
  id: string;
  messageId: string;
  reporterId: string;
  reason: string;
  reportedAt: string;
};

const CHATTER_KEY = "ecr-local-chatter";
const REPORTS_KEY = "ecr-chatter-reports";
const MUTED_KEY = "ecr-chatter-muted";

const MAX_MESSAGE_LENGTH = 500;
const MAX_AREA_LENGTH = 120;

export const CHATTER_CATEGORIES: {
  id: ChatterCategory;
  label: string;
  description: string;
  badgeClass: string;
}[] = [
  { id: "general", label: "General", description: "General community update", badgeClass: "bg-slate-100 text-slate-700 border-slate-200" },
  { id: "need_help", label: "Need Help", description: "Informal assistance requested", badgeClass: "bg-rose-100 text-rose-800 border-rose-200" },
  { id: "hazard", label: "Hazard", description: "Obstruction, road risk, flooding", badgeClass: "bg-amber-100 text-amber-800 border-amber-200" },
  { id: "supplies", label: "Supplies", description: "Sharing or seeking food, water, tools", badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  { id: "check_in", label: "Check-in", description: "Safe status or neighbourhood update", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200" },
];

function readMessages(): ChatterMessage[] {
  try {
    const raw = localStorage.getItem(CHATTER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<ChatterMessage>[];
    return parsed
      .filter(message => typeof message?.body === "string" && typeof message?.authorName === "string" && typeof message?.createdAt === "string")
      .map(message => ({
        id: message.id || `chatter-${crypto.randomUUID()}`,
        authorId: message.authorId || "anonymous",
        authorName: message.authorName || "Neighbour",
        body: message.body || "",
        area: message.area || null,
        category: (message.category as ChatterCategory) || "general",
        status: (message.status as ChatterStatus) || "open",
        resolvedAt: message.resolvedAt || null,
        createdAt: message.createdAt || new Date().toISOString(),
        replyToId: message.replyToId || null,
      }));
  } catch {
    return [];
  }
}

function writeMessages(messages: ChatterMessage[]) {
  localStorage.setItem(CHATTER_KEY, JSON.stringify(messages));
}

export function loadLocalChatter(): ChatterMessage[] {
  return readMessages().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function createLocalChatterMessage(
  user: LocalUser,
  input: { body: string; area?: string; category?: ChatterCategory; replyToId?: string | null }
): ChatterMessage {
  const body = input.body.trim();
  const area = input.area?.trim() || null;
  if (body.length < 2) throw new Error("Write a little more so your neighbours can understand the alert.");
  if (body.length > MAX_MESSAGE_LENGTH) throw new Error(`Keep messages to ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  if (area && area.length > MAX_AREA_LENGTH) throw new Error(`Keep the area to ${MAX_AREA_LENGTH} characters or fewer.`);

  const message: ChatterMessage = {
    id: `chatter-${crypto.randomUUID()}`,
    authorId: user.id,
    authorName: user.name,
    body,
    area,
    category: input.category || "general",
    status: "open",
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    replyToId: input.replyToId ?? null,
  };
  writeMessages([...readMessages(), message]);
  return message;
}

export function toggleResolveLocalChatterMessage(messageId: string, user: LocalUser): ChatterMessage {
  const messages = readMessages();
  const index = messages.findIndex(candidate => candidate.id === messageId);
  if (index === -1) throw new Error("Message not found.");

  const current = messages[index];
  if (current.authorId !== user.id && user.role !== "admin") {
    throw new Error("Only the original author can change the resolution status of this request.");
  }

  const isResolving = current.status !== "resolved";
  const updated: ChatterMessage = {
    ...current,
    status: isResolving ? "resolved" : "open",
    resolvedAt: isResolving ? new Date().toISOString() : null,
  };

  messages[index] = updated;
  writeMessages(messages);
  return updated;
}

export function reportLocalChatterMessage(messageId: string, reporterId: string, reason: string): ChatterReport {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    const reports: ChatterReport[] = raw ? JSON.parse(raw) : [];
    const report: ChatterReport = {
      id: `report-${crypto.randomUUID()}`,
      messageId,
      reporterId,
      reason,
      reportedAt: new Date().toISOString(),
    };
    reports.push(report);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
    return report;
  } catch {
    throw new Error("Could not submit report.");
  }
}

export function getReportedMessageIds(reporterId?: string): string[] {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    if (!raw) return [];
    const reports: ChatterReport[] = JSON.parse(raw);
    return reports
      .filter(report => !reporterId || report.reporterId === reporterId)
      .map(report => report.messageId);
  } catch {
    return [];
  }
}

export function getMutedUserIds(): string[] {
  try {
    const raw = localStorage.getItem(MUTED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function toggleMuteUser(userId: string): boolean {
  try {
    const muted = getMutedUserIds();
    const isMuted = muted.includes(userId);
    const updated = isMuted ? muted.filter(id => id !== userId) : [...muted, userId];
    localStorage.setItem(MUTED_KEY, JSON.stringify(updated));
    return !isMuted;
  } catch {
    return false;
  }
}

export function subscribeToLocalChatter(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === CHATTER_KEY || event.key === MUTED_KEY || event.key === REPORTS_KEY) {
      onChange();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

export function formatTimeAgo(value: string): string {
  const date = new Date(value);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 45) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export const LOCAL_CHATTER_NOTICE = "Prototype mode: Chatter is shared between accounts in this browser and open tabs until Firestore is connected.";
