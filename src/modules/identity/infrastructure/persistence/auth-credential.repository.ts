import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';

@Injectable()
export class AuthCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordFailedAttempt(userId: string, maxAttempts: number, lockoutMinutes: number) {
    const cred = await this.prisma.authCredential.findUnique({ where: { userId } });
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

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.authCredential.update({
      where: { userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedAttempts: 0,
        lockoutUntil: null,
      },
    });
  }

  async saveMfaSecret(userId: string, encrypted: Buffer, enabled: boolean): Promise<void> {
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
