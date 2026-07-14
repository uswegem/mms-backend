/** Acquirer Lipa Namba blocks assigned to this FSP. */
export const LIPA_NAMBA_BLOCKS = {
  /** Schools and school-linked student public IDs */
  SCHOOL: '780',
  /** Primary block for retail / non-school merchants */
  MERCHANT_PRIMARY: '781',
  /** Overflow block for retail / non-school merchants */
  MERCHANT_SECONDARY: '782',
} as const;

export type LipaNambaBlock =
  (typeof LIPA_NAMBA_BLOCKS)[keyof typeof LIPA_NAMBA_BLOCKS];

export const VALID_LIPA_NAMBA_BLOCKS: readonly LipaNambaBlock[] = [
  LIPA_NAMBA_BLOCKS.SCHOOL,
  LIPA_NAMBA_BLOCKS.MERCHANT_PRIMARY,
  LIPA_NAMBA_BLOCKS.MERCHANT_SECONDARY,
];

/** @deprecated Prefer LIPA_NAMBA_BLOCKS.SCHOOL — kept for older call sites. */
export const LIPA_NAMBA_PREFIX = LIPA_NAMBA_BLOCKS.SCHOOL;

/** TIPS Acquirer ID (tag 26/01) for this FSP. */
export const DEFAULT_TIPS_ACQUIRER_ID5 = '01044';
