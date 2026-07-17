const DAMM_TABLE: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 8, 7, 6, 5, 4, 0, 9, 1, 2],
  [7, 6, 5, 4, 3, 2, 1, 0, 9, 8],
  [8, 7, 6, 5, 4, 3, 2, 1, 0, 9],
  [9, 5, 6, 7, 8, 1, 2, 3, 4, 0],
];

export function dammCheckDigit(digits: number[]): number {
  let interim = 0;
  for (const d of digits) {
    interim = DAMM_TABLE[interim][d];
  }
  for (let i = 0; i <= 9; i++) {
    if (DAMM_TABLE[interim][i] === 0) return i;
  }
  return 0;
}

/** Build an 8-digit merchant/school Lipa Namba alias: [block3][seq4][check1]. */
export function buildEightDigitId(prefix: string, sequence: string): string {
  const body = `${prefix}${sequence}`.padStart(7, '0').slice(-7);
  const digits = body.split('').map((c) => parseInt(c, 10));
  const check = dammCheckDigit(digits);
  return `${body}${check}`;
}

/**
 * Build a 10-digit student alias: [780][globalSeq6][check1].
 * The body is always the 9-digit string "780" + the 6-digit padded sequence;
 * the Damm check digit is computed over all 9 body digits.
 */
export function buildTenDigitId(globalSeq6: string): string {
  const padded = globalSeq6.padStart(6, '0').slice(-6);
  const body = `780${padded}`; // 9 digits
  const digits = body.split('').map((c) => parseInt(c, 10));
  const check = dammCheckDigit(digits);
  return `${body}${check}`; // 10 digits
}

/**
 * Validate a Damm-protected numeric ID of any length (8-digit merchant aliases
 * and 10-digit student aliases both pass through here).
 * The last character is the check digit; all preceding characters form the body.
 */
export function validateDamm(id: string): boolean {
  if (!/^\d+$/.test(id) || id.length < 2) return false;
  const body = id.slice(0, -1);
  const digits = body.split('').map((c) => parseInt(c, 10));
  const expected = dammCheckDigit(digits);
  return parseInt(id[id.length - 1], 10) === expected;
}
