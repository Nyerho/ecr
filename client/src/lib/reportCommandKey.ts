const STORAGE_KEY = "ecr-report-command-key";
const VALID_KEY = /^[A-Za-z0-9._:-]{8,96}$/;

export function newReportCommandKey(): string {
  const key = `web-${crypto.randomUUID()}`;
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Reporting can continue with an in-memory key when storage is unavailable.
  }
  return key;
}

export function loadReportCommandKey(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_KEY.test(stored)) return stored;
  } catch {
    // Keep retries stable in the current page even without browser storage.
  }
  return newReportCommandKey();
}
