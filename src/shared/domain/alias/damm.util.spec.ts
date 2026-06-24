import { buildEightDigitId, validateDamm } from './damm.util';

describe('Damm checksum', () => {
  it('builds 8-digit IDs with valid check digit', () => {
    const id = buildEightDigitId('780', '0001');
    expect(id).toHaveLength(8);
    expect(validateDamm(id)).toBe(true);
  });

  it('builds internal routing IDs from school + student seq', () => {
    const id = buildEightDigitId('001', '0001');
    expect(id).toHaveLength(8);
    expect(validateDamm(id)).toBe(true);
  });

  it('rejects invalid checksum', () => {
    expect(validateDamm('12345678')).toBe(false);
  });
});
