import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VaultAuthProvider } from './vault-auth.provider';

export interface VaultSignResult {
  signature: string; // base64, "vault:vN:" prefix already stripped
  keyVersion: number;
}

export interface VaultPublicKey {
  version: number;
  publicKeyPem: string;
}

const SIGNATURE_PATTERN = /^vault:v(\d+):(.+)$/;

/**
 * Thin HTTP client over Vault's Transit secrets engine — sign and read
 * public keys only. The private key material never leaves Vault; this
 * class never sees it (brief §2.1).
 */
@Injectable()
export class VaultTransitClient {
  private readonly logger = new Logger(VaultTransitClient.name);
  private readonly baseUrl: string;
  private readonly keyName: string;

  constructor(
    private readonly auth: VaultAuthProvider,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('vault.addr') ?? 'http://127.0.0.1:8200';
    this.keyName = config.get<string>('vault.jwtKeyName') ?? 'mms-jwt-signing';
  }

  /**
   * Signs `signingInput` (the JWT's `header.payload` string) under the
   * named key's current version. Vault hashes the input itself (sha2-256,
   * per the URL) — the caller sends raw bytes, not a pre-hashed digest.
   *
   * signature_algorithm is explicit and load-bearing: Vault Transit's
   * default for an rsa-2048 key is PSS, but JWT's RS256 (RFC 7518 §3.3)
   * is specifically RSASSA-PKCS1-v1_5 — every standard JWT verifier
   * (jose, jsonwebtoken, ...) rejects a PSS signature under RS256 as an
   * invalid signature. Confirmed by hand: every access token this
   * service issued failed verification 100% of the time against a real
   * Vault instance until this was added — login always "succeeded"
   * (issuing a token), but every subsequent authenticated request 401'd,
   * silently, with no server-side error logged anywhere. Caught only by
   * testing a real browser login against a live (not mocked) Vault.
   */
  async sign(signingInput: string): Promise<VaultSignResult> {
    const body = await this.request(
      'POST',
      `transit/sign/${this.keyName}/sha2-256`,
      {
        input: Buffer.from(signingInput, 'utf8').toString('base64'),
        signature_algorithm: 'pkcs1v15',
      },
    );
    const raw = (body as { data: { signature: string } }).data.signature;
    const match = SIGNATURE_PATTERN.exec(raw);
    if (!match) {
      throw new Error(`Unexpected Vault signature format: ${raw}`);
    }
    return { keyVersion: Number(match[1]), signature: match[2] };
  }

  /** Reads the public key for a given version (or the latest, if omitted). */
  async getPublicKey(version?: number): Promise<VaultPublicKey> {
    const body = (await this.request(
      'GET',
      `transit/keys/${this.keyName}`,
    )) as {
      data: {
        latest_version: number;
        keys: Record<string, { public_key: string }>;
      };
    };
    const resolvedVersion = version ?? body.data.latest_version;
    const entry = body.data.keys[String(resolvedVersion)];
    if (!entry) {
      throw new Error(
        `Vault key "${this.keyName}" has no version ${resolvedVersion}`,
      );
    }
    return { version: resolvedVersion, publicKeyPem: entry.public_key };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    isRetry = false,
  ): Promise<unknown> {
    const token = await this.auth.getToken();
    const res = await fetch(`${this.baseUrl}/v1/${path}`, {
      method,
      headers: {
        'X-Vault-Token': token,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 403 && !isRetry) {
      // Token likely expired (AppRole TTL) — force a fresh login and retry
      // exactly once. See VaultAuthProvider's note on lease renewal.
      this.logger.warn(
        'Vault returned 403 — re-authenticating and retrying once',
      );
      await this.auth.relogin();
      return this.request(method, path, body, true);
    }

    if (!res.ok) {
      throw new Error(
        `Vault ${method} ${path} -> ${res.status}: ${await res.text()}`,
      );
    }
    return res.json();
  }
}
