/** Damm (Luhn mod 10 variant) check digit for 8-digit Lipa Namba / internal IDs. */
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

export function buildEightDigitId(prefix: string, sequence: string): string {
  const body = `${prefix}${sequence}`.padStart(7, '0').slice(-7);
  const digits = body.split('').map((c) => parseInt(c, 10));
  const check = dammCheckDigit(digits);
  return `${body}${check}`;
}

export function validateDamm(id8: string): boolean {
  if (!/^\d{8}$/.test(id8)) return false;
  const digits = id8.slice(0, 7).split('').map((c) => parseInt(c, 10));
  const expected = dammCheckDigit(digits);
  return parseInt(id8[7], 10) === expected;
}
