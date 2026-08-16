import {
  appendDammCheckDigit,
  validateDammDigits,
} from '@shared/domain/alias/damm.util';
import { INVOICE_CONTROL_PREFIX } from '../application/services/reference.service';

describe('fee reference formats (M4b)', () => {
  it('builds 13-digit invoice control with valid Damm', () => {
    const body = `${INVOICE_CONTROL_PREFIX}042${'1'.padStart(8, '0')}`;
    const ref = appendDammCheckDigit(body);
    expect(ref).toHaveLength(13);
    expect(ref.startsWith('9')).toBe(true);
    expect(validateDammDigits(ref)).toBe(true);
  });

  it('rejects bad check digit', () => {
    const body = `${INVOICE_CONTROL_PREFIX}042${'1'.padStart(8, '0')}`;
    const ref = appendDammCheckDigit(body);
    const flipped = `${ref.slice(0, -1)}${(Number(ref.slice(-1)) + 1) % 10}`;
    expect(validateDammDigits(flipped)).toBe(false);
  });
});
