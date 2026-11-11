export type PendingReportPayload = {
  commandKey?: string;
  category: string;
  description: string;
  reporterName?: string;
  locationLabel?: string;
  latitude?: string;
  longitude?: string;
  reporterPhone?: string;
  reporterEmail?: string;
};

export type PendingReport = PendingReportPayload & {
  id: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
};

const STORAGE_KEY = "ecr-pending-reports";

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function read(): PendingReport[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPendingReport) : [];
  } catch {
    return [];
  }
}

function isPendingReport(value: unknown): value is PendingReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.id === "string" &&
    typeof report.queuedAt === "string" &&
    typeof report.category === "string" &&
    typeof report.description === "string" &&
    (report.commandKey === undefined || typeof report.commandKey === "string") &&
    typeof report.attempts === "number" &&
    Number.isInteger(report.attempts) &&
    report.attempts >= 0
  );
}

function write(reports: PendingReport[]) {
  if (!globalThis.localStorage) {
    throw new Error("This browser cannot save reports on this device.");
  }
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

export function loadPendingReports(): PendingReport[] {
  return read().sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export function queuePendingReport(
  payload: PendingReportPayload,
  errorMessage = "Waiting for a connection",
): PendingReport {
  const pending: PendingReport = {
    ...payload,
    id: makeId(),
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: errorMessage,
  };
  write([...read(), pending]);
  return pending;
}

export function updatePendingReport(
  id: string,
  patch: Partial<Pick<PendingReport, "attempts" | "lastError" | "commandKey">>,
) {
  write(read().map(report => (report.id === id ? { ...report, ...patch } : report)));
}

export function removePendingReport(id: string) {
  write(read().filter(report => report.id !== id));
}

export function isRetryableReportError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code).toLowerCase()
      : "";
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 0;
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  if (
    error instanceof TypeError &&
    /failed to fetch|fetch failed|load failed|network\s?(?:error|request failed)/i.test(error.message)
  ) return true;
  return [
    "auth/network-request-failed",
    "unavailable",
    "deadline-exceeded",
    "network-request-failed",
  ].includes(code);
}
