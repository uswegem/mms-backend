export class TlvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TlvValidationError';
  }
}

/** Build a single EMVCo-style TLV segment (ID + 2-digit length + value). */
export function buildTLV(id: string, value: string): string {
  if (!/^\d{2}$/.test(id)) {
    throw new TlvValidationError(`TLV id must be exactly 2 numeric characters: ${id}`);
  }
  validateTlvLength(value);
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

/** Wrap already-built child TLV strings in a parent TLV. */
export function buildNestedTLV(parentId: string, children: string): string {
  return buildTLV(parentId, children);
}

export function validateTlvLength(value: string): void {
  if (value.length < 1 || value.length > 99) {
    throw new TlvValidationError(
      `TLV value length must be between 1 and 99 characters (got ${value.length})`,
    );
  }
}
