import { buildEightDigitId, validateDamm } from '../domain/damm';

describe('damm (re-exported MMS implementation)', () => {
  it('builds valid 8-digit Lipa Namba IDs', () => {
    const alias = buildEightDigitId('780', '0002');
    expect(alias).toHaveLength(8);
    expect(validateDamm(alias)).toBe(true);
  });

  it('builds valid internal routing IDs', () => {
    const internal = buildEightDigitId('001', '0001');
    expect(internal).toHaveLength(8);
    expect(validateDamm(internal)).toBe(true);
  });

  it('rejects invalid checksum digits', () => {
    expect(validateDamm('12345678')).toBe(false);
  });
});
