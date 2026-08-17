import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { ConfigService } from '@nestjs/config';

// Dev-only fallback so a missing env var doesn't hard-crash local/CI runs —
// matches the key AddBeneficialOwnerHandler already fell back to before
// this was extracted. A real deploy sets MFA_ENCRYPTION_KEY explicitly.
const DEV_FALLBACK_KEY_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export function resolveIdNumberKey(config: ConfigService): string {
  return config.get<string>('MFA_ENCRYPTION_KEY') ?? DEV_FALLBACK_KEY_HEX;
}

/**
 * AES-256-CBC, IV (16 bytes) prepended to the ciphertext, key derived from
 * the first 64 hex chars (32 bytes) of the configured key. Previously only
 * encryptIdNumber existed (inline in onboarding.handlers.ts) — nothing
 * could decrypt a beneficial owner's ID number back out, which is exactly
 * what NIDA verification needs to do. Extracted here so both directions
 * live together instead of the encrypt half being duplicated per caller.
 */
export function encryptIdNumber(idNumber: string, keyHex: string): Buffer {
  const key = Buffer.from(keyHex.slice(0, 64), 'hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(idNumber, 'utf8'), cipher.final()]);
}

export function decryptIdNumber(encrypted: Buffer, keyHex: string): string {
  const key = Buffer.from(keyHex.slice(0, 64), 'hex');
  const iv = encrypted.subarray(0, 16);
  const ciphertext = encrypted.subarray(16);
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
