import { MockNidaVerificationProvider } from './mock-nida-verification.provider';

describe('MockNidaVerificationProvider', () => {
  const provider = new MockNidaVerificationProvider();

  it('returns MATCH for a well-formed 20-digit ID not matching a magic suffix', async () => {
    const result = await provider.verify({
      nationalId: '19850101123456781234',
      expectedFullName: 'Amina Hassan',
    });
    expect(result).toEqual({ result: 'MATCH', verifiedName: 'Amina Hassan' });
  });

  it('returns NOT_FOUND with an actionable reason for a malformed ID (brief §4.3: not a generic failure)', async () => {
    const result = await provider.verify({
      nationalId: '12345',
      expectedFullName: 'Amina Hassan',
    });
    expect(result.result).toBe('NOT_FOUND');
    expect(result.reason).toMatch(/20 digits/);
  });

  it('returns MISMATCH for the magic 9999 suffix', async () => {
    const result = await provider.verify({
      nationalId: '19850101123456789999',
      expectedFullName: 'Amina Hassan',
    });
    expect(result.result).toBe('MISMATCH');
    expect(result.verifiedName).toBeDefined();
    expect(result.reason).toBeDefined();
  });

  it('returns PROVIDER_ERROR for the magic 0000 suffix', async () => {
    const result = await provider.verify({
      nationalId: '19850101123456780000',
      expectedFullName: 'Amina Hassan',
    });
    expect(result.result).toBe('PROVIDER_ERROR');
  });
});
