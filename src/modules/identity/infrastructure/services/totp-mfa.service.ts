import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import {
  MfaServicePort,
  MfaSetupResult,
} from '../../application/ports/mfa.service.port';

@Injectable()
export class TotpMfaService extends MfaServicePort {
  private readonly encryptionKey: Buffer;
  private readonly issuer: string;

  constructor(config: ConfigService) {
    super();
    const keyHex = config.getOrThrow<string>('auth.mfaEncryptionKey');
    this.encryptionKey = Buffer.from(keyHex, 'hex');
    if (this.encryptionKey.length !== 32) {
      throw new Error('MFA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    this.issuer = config.get<string>('auth.mfaIssuer') ?? 'MMS';
  }

  async generateSetup(userEmail: string): Promise<MfaSetupResult> {
    const secret = generateSecret();
    const otpauthUrl = generateURI({
      issuer: this.issuer,
      label: userEmail,
      secret,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  verifyCode(secret: string, code: string): boolean {
    return verifySync({ secret, token: code }).valid;
  }

  encryptSecret(secret: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
  }

  decryptSecret(encrypted: Buffer): string {
    const iv = encrypted.subarray(0, 12);
    const tag = encrypted.subarray(12, 28);
    const data = encrypted.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }
}
