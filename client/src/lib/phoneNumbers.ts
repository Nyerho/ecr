export function toDialablePhoneNumber(number: string) {
  const trimmed = number.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.length <= 6) return digits;
  if (digits.startsWith("234")) return `+${digits}`;
  return `+234${digits.replace(/^0/, "")}`;
}
