import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalChatterMessage,
  formatTimeAgo,
  getMutedUserIds,
  getReportedMessageIds,
  loadLocalChatter,
  reportLocalChatterMessage,
  toggleMuteUser,
  toggleResolveLocalChatterMessage,
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

const otherUser: LocalUser = {
  id: "user-2",
  name: "Another Neighbour",
  email: "other@example.com",
  role: "user",
  createdAt: "2026-09-24T12:00:00.000Z",
};

describe("localChatter", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
  });

  it("creates a chatter post with category and validation", () => {
    expect(() =>
      createLocalChatterMessage(mockUser, { body: "a" })
    ).toThrow("Write a little more so your neighbours can understand the alert.");

    const post = createLocalChatterMessage(mockUser, {
      body: "Tree branch blocking the north lane near the roundabout.",
      area: "North Roundabout",
      category: "hazard",
    });

    expect(post.authorName).toBe("Community Member");
    expect(post.area).toBe("North Roundabout");
    expect(post.category).toBe("hazard");
    expect(post.status).toBe("open");
    expect(post.replyToId).toBeNull();

    const loaded = loadLocalChatter();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(post.id);
  });

  it("creates a reply to an existing chatter post", () => {
    const parent = createLocalChatterMessage(mockUser, {
      body: "Does anyone have sandbags available near Main Street?",
      area: "Main Street",
      category: "supplies",
    });

    const reply = createLocalChatterMessage(otherUser, {
      body: "Yes, 10 sandbags left at the community depot.",
      replyToId: parent.id,
    });

    expect(reply.replyToId).toBe(parent.id);
    const messages = loadLocalChatter();
    expect(messages).toHaveLength(2);
    expect(messages[1].replyToId).toBe(parent.id);
  });

  it("allows the author to mark a request as resolved and reopen it", () => {
    const post = createLocalChatterMessage(mockUser, {
      body: "Elderly resident needs assistance moving upstairs.",
      category: "need_help",
    });

    expect(post.status).toBe("open");

    // Other user cannot resolve
    expect(() => toggleResolveLocalChatterMessage(post.id, otherUser)).toThrow(
      "Only the original author can change the resolution status of this request."
    );

    // Author resolves
    const resolved = toggleResolveLocalChatterMessage(post.id, mockUser);
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).toBeTruthy();

    // Author reopens
    const reopened = toggleResolveLocalChatterMessage(post.id, mockUser);
    expect(reopened.status).toBe("open");
    expect(reopened.resolvedAt).toBeNull();
  });

  it("supports reporting a message and muting an author", () => {
    const post = createLocalChatterMessage(otherUser, {
      body: "False rumor about water supply.",
      category: "general",
    });

    // Report
    const report = reportLocalChatterMessage(post.id, mockUser.id, "False or misleading emergency information");
    expect(report.messageId).toBe(post.id);
    expect(getReportedMessageIds(mockUser.id)).toContain(post.id);

    // Mute
    expect(toggleMuteUser(otherUser.id)).toBe(true);
    expect(getMutedUserIds()).toContain(otherUser.id);
    // Unmute
    expect(toggleMuteUser(otherUser.id)).toBe(false);
    expect(getMutedUserIds()).not.toContain(otherUser.id);
  });

  it("formats relative timestamps correctly", () => {
    const now = new Date().toISOString();
    expect(formatTimeAgo(now)).toBe("Just now");

    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(formatTimeAgo(tenMinAgo)).toBe("10m ago");

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatTimeAgo(twoHoursAgo)).toBe("2h ago");
  });
});
