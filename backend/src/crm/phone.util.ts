/**
 * Normalize Bangladesh phone numbers to a canonical form.
 * All of these become "01712345678":
 *   01712345678
 *   +8801712345678
 *   8801712345678
 *   01712-345678
 *   ০১৭১২৩৪৫৬৭৮  (Bangla digits)
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Convert Bangla digits → ASCII
  let s = String(raw)
    .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
    .replace(/[\s\-().]/g, '');

  // Strip leading +88 or 88
  if (s.startsWith('+88')) s = s.slice(3);
  else if (s.startsWith('88') && s.length > 11) s = s.slice(2);

  // Must be 11 digits starting with 01[3-9]
  if (/^01[3-9]\d{8}$/.test(s)) return s;
  return null; // unparseable — return null so we don't overwrite
}

/**
 * Returns true if two phone strings refer to the same number.
 */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return !!na && !!nb && na === nb;
}
