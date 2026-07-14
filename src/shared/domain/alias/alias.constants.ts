/** All acquirer alias blocks that exist. */
export const ALIAS_BLOCKS = ['780', '781', '782'] as const;

export type AliasBlock = (typeof ALIAS_BLOCKS)[number];

/** Block reserved exclusively for schools/students — never issued to a retail merchant. */
export const SCHOOL_ALIAS_BLOCKS: readonly AliasBlock[] = ['780'];

/** Blocks for retail merchants, tried in order (781 fills before 782 is touched) — never issued to a school/student. */
export const MERCHANT_ALIAS_BLOCKS: readonly AliasBlock[] = ['781', '782'];
