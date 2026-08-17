import { MockTraVerificationProvider } from './mock-tra-verification.provider';

describe('MockTraVerificationProvider', () => {
  const provider = new MockTraVerificationProvider();

  it('returns MATCH for a well-formed 9-digit TIN not matching a magic suffix', async () => {
    const result = await provider.verify({
      tin: '123456781',
      expectedLegalName: 'YN Restaurants Limited',
    });
    expect(result).toEqual({
      result: 'MATCH',
      verifiedName: 'YN Restaurants Limited',
    });
  });

  it('returns NOT_FOUND with an actionable reason for a malformed TIN', async () => {
    const result = await provider.verify({
      tin: '123',
      expectedLegalName: 'YN Restaurants Limited',
    });
    expect(result.result).toBe('NOT_FOUND');
    expect(result.reason).toMatch(/9 digits/);
  });

  it('returns MISMATCH for the magic 999 suffix', async () => {
    const result = await provider.verify({
      tin: '123456999',
      expectedLegalName: 'YN Restaurants Limited',
    });
    expect(result.result).toBe('MISMATCH');
  });

  it('returns PROVIDER_ERROR for the magic 000 suffix', async () => {
    const result = await provider.verify({
      tin: '123456000',
      expectedLegalName: 'YN Restaurants Limited',
    });
    expect(result.result).toBe('PROVIDER_ERROR');
  });
});
