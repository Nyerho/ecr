export type PendingReportPayload = {
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
    const parsed = JSON.parse(raw) as PendingReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(reports: PendingReport[]) {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(reports));
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
  patch: Partial<Pick<PendingReport, "attempts" | "lastError">>,
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
      ? String((error as { code?: unknown }).code)
      : "";
  return [
    "auth/network-request-failed",
    "unavailable",
    "deadline-exceeded",
    "network-request-failed",
  ].includes(code);
}
