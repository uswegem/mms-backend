export interface MfaSetupResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export abstract class MfaServicePort {
  abstract generateSetup(userEmail: string): Promise<MfaSetupResult>;
  abstract verifyCode(secret: string, code: string): boolean;
  abstract encryptSecret(secret: string): Buffer;
  abstract decryptSecret(encrypted: Buffer): string;
}
