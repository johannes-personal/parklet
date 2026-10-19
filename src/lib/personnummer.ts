/** 12 digits (YYYYMMDDNNNN) from an e-ID's `ssn` claim, or null if it isn't a personnummer. */
export function normalizePersonnummer(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 ? digits : null;
}
