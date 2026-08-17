// Tanzanian mobile: starts with 255 + 9 digits, or 07/06 + 8 digits.
// Shared between the CSV bulk-upload row validator and the single-student
// DTO so the two paths can never drift apart on what counts as valid.
export const TZ_MOBILE_RE = /^(255[67]\d{8}|0[67]\d{8})$/;

/** Normalizes 07XXXXXXXX -> 2557XXXXXXXX; returns undefined if not a valid Tanzanian mobile. */
export function normalizeMobile(raw: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.replace(/\s+/g, '');
  if (s.startsWith('255') && TZ_MOBILE_RE.test(s)) return s;
  if (/^0[67]\d{8}$/.test(s)) return `255${s.slice(1)}`;
  return undefined;
}
