import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalChatterMessage,
  loadLocalChatter,
  type ChatterMessage,
} from "./localChatter";
import type { LocalUser } from "./localAuth";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const mockUser: LocalUser = {
  id: "user-1",
  name: "Community Member",
  email: "member@example.com",
  role: "user",
  createdAt: "2026-09-24T12:00:00.000Z",
};

describe("localChatter", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
  });

  it("creates a chatter post with validation", () => {
    expect(() =>
      createLocalChatterMessage(mockUser, { body: "a" })
    ).toThrow("Write a little more so your neighbours can understand the alert.");

    const post = createLocalChatterMessage(mockUser, {
      body: "Tree branch blocking the north lane near the roundabout.",
      area: "North Roundabout",
    });

    expect(post.authorName).toBe("Community Member");
    expect(post.area).toBe("North Roundabout");
    expect(post.replyToId).toBeNull();

    const loaded = loadLocalChatter();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(post.id);
  });

  it("creates a reply to an existing chatter post", () => {
    const parent = createLocalChatterMessage(mockUser, {
      body: "Does anyone have sandbags available near Main Street?",
      area: "Main Street",
    });

    const reply = createLocalChatterMessage(mockUser, {
      body: "Yes, 10 sandbags left at the community depot.",
      replyToId: parent.id,
    });

    expect(reply.replyToId).toBe(parent.id);
    const messages = loadLocalChatter();
    expect(messages).toHaveLength(2);
    expect(messages[1].replyToId).toBe(parent.id);
  });
});
