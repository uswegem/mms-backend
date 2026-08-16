import { VaultAuthProvider } from './vault-auth.provider';
import { VaultTransitClient } from './vault-transit.client';

/**
 * The brief's actual ask: "sign-then-verify round trip against a Vault
 * dev-mode instance." Targets a real Vault — `docker compose up vault`,
 * then `npm run vault:setup` to create the key, then run this test.
 *
 * Self-skips (not fails) when Vault isn't reachable, which is the honest
 * behaviour for this sandbox specifically: it has no Docker daemon, so
 * this suite has never actually executed against a live Vault here. The
 * mocked-but-real-crypto coverage in jwt-rs256-vault.spec.ts is what has
 * been verified in this environment — this file exists so CI (which does
 * have Docker, per the brief's docker-compose Vault service) can close
 * that specific gap for real.
 */
const VAULT_ADDR = process.env.VAULT_ADDR ?? 'http://127.0.0.1:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN ?? 'mms-dev-root-token';
const KEY_NAME = process.env.VAULT_JWT_KEY_NAME ?? 'mms-jwt-signing';

async function vaultReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${VAULT_ADDR}/v1/sys/health?standbyok=true`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

describe('Vault Transit — live round trip', () => {
  let skip = false;

  beforeAll(async () => {
    skip = !(await vaultReachable());
    if (skip) {
      console.warn(
        `[vault-live.integration.spec] Vault not reachable at ${VAULT_ADDR} — skipping. ` +
          'Run `docker compose up vault` + `npm run vault:setup` to exercise this for real.',
      );
    }
  });

  it('signs with the real Vault Transit engine and verifies against its real public key', async () => {
    if (skip) return;

    const auth = new VaultAuthProvider({
      get: (k: string) =>
        ({ 'vault.addr': VAULT_ADDR, 'vault.token': VAULT_TOKEN })[k],
    } as never);
    const client = new VaultTransitClient(auth, {
      get: (k: string) =>
        ({ 'vault.addr': VAULT_ADDR, 'vault.jwtKeyName': KEY_NAME })[k],
    } as never);

    const signingInput = 'header.payload';
    const { signature, keyVersion } = await client.sign(signingInput);
    expect(keyVersion).toBeGreaterThan(0);

    const { publicKeyPem } = await client.getPublicKey(keyVersion);

    const { createPublicKey, verify } = await import('crypto');
    const ok = verify(
      'sha256',
      Buffer.from(signingInput, 'utf8'),
      createPublicKey(publicKeyPem),
      Buffer.from(signature, 'base64'),
    );
    expect(ok).toBe(true);
  });
});
