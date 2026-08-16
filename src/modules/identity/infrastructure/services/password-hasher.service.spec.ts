import * as bcrypt from 'bcrypt';
import { PasswordAlgo } from '@prisma/client';
import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService (brief §1) — real crypto, not mocked', () => {
  const config = { get: jest.fn().mockReturnValue(undefined) }; // falls back to the OWASP-floor defaults
  const hasher = new PasswordHasherService(config as never);

  it('hash() always produces an Argon2id hash, verifiable as ARGON2ID', async () => {
    const hash = await hasher.hash('Sup3rSecret!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(
      hasher.verify('Sup3rSecret!', hash, PasswordAlgo.ARGON2ID),
    ).resolves.toBe(true);
    await expect(
      hasher.verify('wrong', hash, PasswordAlgo.ARGON2ID),
    ).resolves.toBe(false);
  });

  it('verify() dispatches to bcrypt for BCRYPT-tagged hashes', async () => {
    const legacyHash = await bcrypt.hash('OldPassword1!', 4); // low rounds — test speed only
    await expect(
      hasher.verify('OldPassword1!', legacyHash, PasswordAlgo.BCRYPT),
    ).resolves.toBe(true);
    await expect(
      hasher.verify('wrong', legacyHash, PasswordAlgo.BCRYPT),
    ).resolves.toBe(false);
  });
});
