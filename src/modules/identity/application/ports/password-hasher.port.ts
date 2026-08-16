import type { PasswordAlgo } from '@prisma/client';

export abstract class PasswordHasherPort {
  /** Algorithm every new hash() call produces. */
  abstract readonly currentAlgorithm: PasswordAlgo;

  /** Always hashes with {@link currentAlgorithm} (Argon2id). */
  abstract hash(plain: string): Promise<string>;

  /**
   * Verifies against whichever algorithm the stored hash actually used —
   * callers must pass the credential's recorded `passwordAlgo`, never infer
   * it from the hash string.
   */
  abstract verify(
    plain: string,
    hash: string,
    algorithm: PasswordAlgo,
  ): Promise<boolean>;
}
