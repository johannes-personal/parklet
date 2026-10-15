/**
 * Swedish organisationsnummer: 10 digits (NNNNNN-NNNN) with a Luhn check
 * digit. The third digit is >= 2 for legal entities, which distinguishes them
 * from personnummer.
 */
export function normalizeOrgNumber(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("16") ? digits.slice(2) : digits;
  if (ten.length !== 10) return null;
  if (Number(ten[2]) < 2) return null;
  if (!luhn(ten)) return null;
  return `${ten.slice(0, 6)}-${ten.slice(6)}`;
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
