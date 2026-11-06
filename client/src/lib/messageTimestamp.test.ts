import { describe, expect, it } from "vitest";
import { formatMessageTimestamp } from "@shared/messageTimestamp";

const now = Date.parse("2026-11-06T12:00:00Z");
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

describe("community message timestamps", () => {
  it.each([
    [0, "Just now"],
    [59_999, "Just now"],
    [minute, "1 minute ago"],
    [3 * minute, "3 minutes ago"],
    [hour, "1 hour ago"],
    [23 * hour, "23 hours ago"],
    [day, "1 day ago"],
    [2 * day, "2 days ago"],
    [3 * day, "3 days ago"],
    [6 * day, "6 days ago"],
  ])("shows the age of a message %i milliseconds old", (age, label) => {
    expect(formatMessageTimestamp(now - age, now).label).toBe(label);
  });

  it("includes the calendar date and year for older messages", () => {
    const date = new Date(now - 7 * day);
    const timestamp = formatMessageTimestamp(date, now);
    expect(timestamp.label).toBe(
      date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    );
    expect(timestamp.label).toContain("2026");
  });

  it("provides the full date and time alongside the relative label", () => {
    const date = new Date(now - 2 * day);
    expect(formatMessageTimestamp(date, now)).toEqual({
      label: "2 days ago",
      dateTime: date.toISOString(),
      fullDate: date.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  });

  it.each([
    new Date(now - 2 * day),
    new Date(now - 2 * day).toISOString(),
    now - 2 * day,
    { toDate: () => new Date(now - 2 * day) },
  ])("accepts saved dates and Firestore timestamps", value => {
    expect(formatMessageTimestamp(value, now).label).toBe("2 days ago");
  });

  it.each([
    null,
    undefined,
    "invalid-date",
    NaN,
    Infinity,
    {},
    { toDate: "invalid" },
  ])(
    "keeps unavailable timestamps distinguishable from new messages",
    value => {
      expect(formatMessageTimestamp(value, now)).toEqual({
        label: "Time unavailable",
      });
    }
  );

  it("allows minor clock skew and shows the date for larger future differences", () => {
    expect(formatMessageTimestamp(now + 30_000, now).label).toBe("Just now");
    const future = new Date(now + day);
    expect(formatMessageTimestamp(future, now).label).toBe(
      future.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    );
  });

  it("updates relative age when a room's clock refreshes", () => {
    const createdAt = now - 59_000;
    expect(formatMessageTimestamp(createdAt, now).label).toBe("Just now");
    expect(formatMessageTimestamp(createdAt, now + minute).label).toBe(
      "1 minute ago"
    );
  });
});
