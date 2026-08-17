import { ConfigService } from '@nestjs/config';
import {
  decryptIdNumber,
  encryptIdNumber,
  resolveIdNumberKey,
} from './id-number-crypto.util';

const TEST_KEY = 'a'.repeat(64); // 32 bytes hex

describe('id-number-crypto.util', () => {
  describe('encryptIdNumber / decryptIdNumber round trip', () => {
    it('decrypts back to the original plaintext', () => {
      const encrypted = encryptIdNumber('19850101123456789012', TEST_KEY);
      expect(decryptIdNumber(encrypted, TEST_KEY)).toBe('19850101123456789012');
    });

    it('produces a different ciphertext each time (random IV)', () => {
      const first = encryptIdNumber('19850101123456789012', TEST_KEY);
      const second = encryptIdNumber('19850101123456789012', TEST_KEY);
      expect(first.equals(second)).toBe(false);
      // ...but both still decrypt to the same plaintext.
      expect(decryptIdNumber(first, TEST_KEY)).toBe(
        decryptIdNumber(second, TEST_KEY),
      );
    });

    it('fails to decrypt with the wrong key rather than silently returning garbage that happens to parse', () => {
      const encrypted = encryptIdNumber('19850101123456789012', TEST_KEY);
      const wrongKey = 'b'.repeat(64);
      expect(() => decryptIdNumber(encrypted, wrongKey)).toThrow();
    });
  });

  describe('resolveIdNumberKey', () => {
    it('uses the configured MFA_ENCRYPTION_KEY when set', () => {
      const config = {
        get: jest.fn().mockReturnValue(TEST_KEY),
      } as unknown as ConfigService;
      expect(resolveIdNumberKey(config)).toBe(TEST_KEY);
    });

    it('falls back to the dev key when unset, rather than throwing', () => {
      const config = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;
      expect(resolveIdNumberKey(config)).toHaveLength(64);
    });
  });
});
