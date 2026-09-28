import type { LocalUser } from "./localAuth";

export type ChatterMessage = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  area: string | null;
  createdAt: string;
  replyToId: string | null;
};

const CHATTER_KEY = "ecr-local-chatter";
const MAX_MESSAGE_LENGTH = 500;
const MAX_AREA_LENGTH = 120;

function readMessages(): ChatterMessage[] {
  try {
    const raw = localStorage.getItem(CHATTER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatterMessage[];
    return parsed
      .filter(message => typeof message?.body === "string" && typeof message?.authorName === "string" && typeof message?.createdAt === "string")
      .map(message => ({ ...message, area: message.area || null, replyToId: message.replyToId || null }));
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

export function createLocalChatterMessage(user: LocalUser, input: { body: string; area?: string; replyToId?: string | null }): ChatterMessage {
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
    createdAt: new Date().toISOString(),
    replyToId: input.replyToId ?? null,
  };
  writeMessages([...readMessages(), message]);
  return message;
}

export function subscribeToLocalChatter(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === CHATTER_KEY) onChange();
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

export const LOCAL_CHATTER_NOTICE = "Prototype mode: Chatter is shared only between accounts in this browser and its open tabs until Firestore is connected.";
