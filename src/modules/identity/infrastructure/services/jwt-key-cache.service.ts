import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { importSPKI, type KeyLike } from 'jose';
import { VaultTransitClient } from '@infrastructure/vault/vault-transit.client';

interface CachedKey {
  pem: string;
  key: KeyLike;
  fetchedAt: number;
}

/**
 * Caches Vault-issued RS256 public keys **by version**, not just "the
 * current one" (brief §2.4/§2.5) — so a token signed under a
 * recently-rotated-away-from version still verifies locally until it
 * expires, without a Vault round trip on every request.
 */
@Injectable()
export class JwtKeyCacheService {
  private readonly cache = new Map<number, CachedKey>();
  private latestVersion: number | null = null;
  private readonly ttlMs: number;

  constructor(
    private readonly vault: VaultTransitClient,
    config: ConfigService,
  ) {
    this.ttlMs = config.get<number>('jwt.publicKeyCacheTtlMs') ?? 3_600_000;
  }

  /** Latest key version — used when signing, so the JWT header's `kid` names the version Vault will actually sign with. */
  async getLatestVersion(): Promise<number> {
    if (this.latestVersion !== null) {
      const cached = this.cache.get(this.latestVersion);
      if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
        return this.latestVersion;
      }
    }
    const { version } = await this.vault.getPublicKey();
    await this.getKeyForVersion(version); // populate/refresh the cache entry
    this.latestVersion = version;
    return version;
  }

  /** Public key for a specific version, fetching and caching it on first use. */
  async getKeyForVersion(version: number): Promise<KeyLike> {
    const cached = this.cache.get(version);
    if (cached) return cached.key;

    const { publicKeyPem } = await this.vault.getPublicKey(version);
    const key = await importSPKI(publicKeyPem, 'RS256');
    this.cache.set(version, { pem: publicKeyPem, key, fetchedAt: Date.now() });
    return key;
  }

  /** Drops all cached entries — used after a signing-version mismatch (see JwtTokenService). */
  invalidate(): void {
    this.cache.clear();
    this.latestVersion = null;
  }
}
