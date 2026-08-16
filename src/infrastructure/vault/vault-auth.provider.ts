import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Resolves the Vault client token to send on every Transit call.
 *
 * Two modes, chosen by which env vars are set:
 *  - VAULT_TOKEN: used directly (dev-mode Vault's fixed root token — never
 *    for production).
 *  - VAULT_ROLE_ID + VAULT_SECRET_ID: AppRole login (brief §2.2) — the
 *    intended production path, scoped by the policy the setup script wrote.
 *
 * Lease renewal is not implemented — this caches the token from the login
 * response and re-authenticates on a 403 (see VaultTransitClient's
 * retry-once-on-403 behaviour), which is adequate for Phase 1's low
 * sign/verify volume but is not a substitute for proper lease management if
 * this ever needs sustained high throughput. Flagged as a known gap, not a
 * silent shortcut.
 */
@Injectable()
export class VaultAuthProvider {
  private readonly logger = new Logger(VaultAuthProvider.name);
  private readonly baseUrl: string;
  private readonly staticToken?: string;
  private readonly roleId?: string;
  private readonly secretId?: string;
  private cachedToken: string | null = null;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('vault.addr') ?? 'http://127.0.0.1:8200';
    this.staticToken = config.get<string>('vault.token') ?? undefined;
    this.roleId = config.get<string>('vault.roleId') ?? undefined;
    this.secretId = config.get<string>('vault.secretId') ?? undefined;
  }

  async getToken(): Promise<string> {
    if (this.staticToken) return this.staticToken;
    if (this.cachedToken) return this.cachedToken;
    return this.login();
  }

  /** Forces a fresh AppRole login, discarding any cached token. */
  async relogin(): Promise<string> {
    this.cachedToken = null;
    return this.login();
  }

  private async login(): Promise<string> {
    if (this.staticToken) return this.staticToken;
    if (!this.roleId || !this.secretId) {
      throw new Error(
        'Vault auth not configured — set VAULT_TOKEN (dev) or VAULT_ROLE_ID + VAULT_SECRET_ID (AppRole).',
      );
    }
    const res = await fetch(`${this.baseUrl}/v1/auth/approle/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: this.roleId, secret_id: this.secretId }),
    });
    if (!res.ok) {
      throw new Error(
        `Vault AppRole login failed: ${res.status} ${await res.text()}`,
      );
    }
    const body = (await res.json()) as { auth: { client_token: string } };
    this.cachedToken = body.auth.client_token;
    this.logger.log('Vault AppRole login succeeded');
    return this.cachedToken;
  }
}
