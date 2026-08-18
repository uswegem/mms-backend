import { MockCbsValidationProvider } from './mock-cbs-validation.provider';

describe('MockCbsValidationProvider', () => {
  const provider = new MockCbsValidationProvider();

  it('passes a well-formed numeric account number with a real account name', async () => {
    const result = await provider.verify(
      '0412887144',
      'YN Restaurants Limited',
    );
    expect(result).toEqual({
      result: 'PASS',
      verifiedAccountName: 'YN Restaurants Limited',
    });
  });

  it('strips whitespace before validating', async () => {
    const result = await provider.verify(
      '0412 8871 44',
      'YN Restaurants Limited',
    );
    expect(result.result).toBe('PASS');
  });

  it('fails an account number that is too short', async () => {
    const result = await provider.verify('12345', 'YN Restaurants Limited');
    expect(result).toEqual({ result: 'FAIL' });
  });

  it('fails a non-numeric account number', async () => {
    const result = await provider.verify(
      'ABCDEFGHIJ',
      'YN Restaurants Limited',
    );
    expect(result.result).toBe('FAIL');
  });

  it('fails a blank/too-short account name', async () => {
    const result = await provider.verify('0412887144', 'X');
    expect(result.result).toBe('FAIL');
  });
});
