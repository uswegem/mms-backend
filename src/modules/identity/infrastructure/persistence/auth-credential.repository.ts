import { Injectable } from '@nestjs/common';
import { PasswordAlgo } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

@Injectable()
export class AuthCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordFailedAttempt(
    userId: string,
    maxAttempts: number,
    lockoutMinutes: number,
  ) {
    const cred = await this.prisma.authCredential.findUnique({
      where: { userId },
    });
    if (!cred) return;

    const failedAttempts = cred.failedAttempts + 1;
    const lockoutUntil =
      failedAttempts >= maxAttempts
        ? new Date(Date.now() + lockoutMinutes * 60_000)
        : null;

    await this.prisma.authCredential.update({
      where: { userId },
      data: {
        failedAttempts,
        lockoutUntil,
      },
    });

    if (lockoutUntil) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: 'LOCKED' },
      });
    }
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    await this.prisma.authCredential.update({
      where: { userId },
      data: { failedAttempts: 0, lockoutUntil: null },
    });
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.status === 'LOCKED') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      });
    }
  }

  /**
   * Sets a freshly-hashed password (always Argon2id — see
   * PasswordHasherService). Used by both the self-service reset flow and
   * the forced-reset flow; either path clears mustResetPassword since a
   * successful reset is exactly what that flag was waiting for.
   */
  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.authCredential.update({
      where: { userId },
      data: {
        passwordHash,
        passwordAlgo: PasswordAlgo.ARGON2ID,
        passwordMigratedAt: new Date(),
        mustResetPassword: false,
        passwordChangedAt: new Date(),
        failedAttempts: 0,
        lockoutUntil: null,
      },
    });
  }

  /**
   * Lazy-rehash on login (brief §1.2): the plaintext was just proven valid
   * against the old bcrypt hash, so replace it with an Argon2id hash of the
   * same password. Deliberately does not touch mustResetPassword — a
   * privileged/backstop-flagged account still has to go through the
   * explicit reset flow (updatePassword above), not skip it via a
   * successful lazy rehash.
   */
  async migratePasswordHash(userId: string, newHash: string): Promise<void> {
    await this.prisma.authCredential.update({
      where: { userId },
      data: {
        passwordHash: newHash,
        passwordAlgo: PasswordAlgo.ARGON2ID,
        passwordMigratedAt: new Date(),
      },
    });
  }

  async setMustResetPassword(userId: string, value: boolean): Promise<void> {
    await this.prisma.authCredential.update({
      where: { userId },
      data: { mustResetPassword: value },
    });
  }

  async markResetWarningSent(userId: string): Promise<void> {
    await this.prisma.authCredential.update({
      where: { userId },
      data: { passwordResetWarnedAt: new Date() },
    });
  }

  async saveMfaSecret(
    userId: string,
    encrypted: Buffer,
    enabled: boolean,
  ): Promise<void> {
    await this.prisma.authCredential.update({
      where: { userId },
      data: { mfaSecretEnc: new Uint8Array(encrypted), mfaEnabled: enabled },
    });
  }

  async enableMfa(userId: string): Promise<void> {
    await this.prisma.authCredential.update({
      where: { userId },
      data: { mfaEnabled: true },
    });
  }
}
