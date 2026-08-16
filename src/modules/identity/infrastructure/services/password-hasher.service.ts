import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as argon2 from 'argon2';
import { PasswordAlgo } from '@prisma/client';
import { PasswordHasherPort } from '../../application/ports/password-hasher.port';

/**
 * Dual-algorithm hasher for the bcrypt -> Argon2id migration (brief §1).
 * `hash()` always produces Argon2id — bcrypt is only ever used on the
 * verify path, for credentials that haven't been migrated yet. Once the
 * 90-day backstop (§1.4) has run its course and every account is confirmed
 * ARGON2ID, the bcrypt branch and dependency can be removed.
 */
@Injectable()
export class PasswordHasherService extends PasswordHasherPort {
  readonly currentAlgorithm = PasswordAlgo.ARGON2ID;

  private readonly argon2Options: argon2.HashOptions;

  constructor(config: ConfigService) {
    super();
    this.argon2Options = {
      type: argon2.argon2id,
      memoryCost: config.get<number>('argon2.memoryCostKib') ?? 19456,
      timeCost: config.get<number>('argon2.timeCost') ?? 2,
      parallelism: config.get<number>('argon2.parallelism') ?? 1,
    };
  }

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.argon2Options);
  }

  async verify(
    plain: string,
    hash: string,
    algorithm: PasswordAlgo,
  ): Promise<boolean> {
    if (algorithm === PasswordAlgo.ARGON2ID) {
      return argon2.verify(hash, plain);
    }
    return bcrypt.compare(plain, hash);
  }
}
