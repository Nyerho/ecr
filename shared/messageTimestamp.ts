export type MessageTimestamp = {
  label: string;
  dateTime?: string;
  fullDate?: string;
};

export function formatMessageTimestamp(
  value: unknown,
  now = Date.now()
): MessageTimestamp {
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (
    value !== null &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    date = value.toDate();
  } else if (typeof value === "string" || typeof value === "number") {
    date = new Date(value);
  } else {
    return { label: "Time unavailable" };
  }

  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return { label: "Time unavailable" };
  }

  const age = now - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  let label = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (age >= -minute && age < minute) {
    label = "Just now";
  } else if (age >= minute && age < 7 * day) {
    const unit = age >= day ? "day" : age >= hour ? "hour" : "minute";
    const duration = unit === "day" ? day : unit === "hour" ? hour : minute;
    const count = Math.floor(age / duration);
    label = `${count} ${unit}${count === 1 ? "" : "s"} ago`;
  }

  return {
    label,
    dateTime: date.toISOString(),
    fullDate: date.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}
