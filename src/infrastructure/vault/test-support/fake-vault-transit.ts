import { generateKeyPairSync, sign as nodeSign, type KeyObject } from 'crypto';

/**
 * In-process double for Vault's Transit HTTP API, backed by real RSA
 * keypairs and real PKCS1v15/SHA-256 signing (the same primitives RS256
 * and Vault Transit's default RSA signing both use) — so tests built on
 * this exercise real cryptographic correctness, not just a stubbed
 * contract shape. Mocks the HTTP transport only.
 *
 * This is not a substitute for the brief's "sign-then-verify round trip
 * against a Vault dev-mode instance" requirement — this sandbox has no
 * Docker available to run one (see vault-live.integration.spec.ts, which
 * targets a real Vault and self-skips when VAULT_ADDR isn't reachable).
 */
export class FakeVaultTransit {
  private readonly versions = new Map<
    number,
    { publicKeyPem: string; privateKey: KeyObject }
  >();
  private latest = 0;
  requestLog: string[] = [];

  constructor() {
    this.addVersion();
  }

  addVersion(): number {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    this.latest += 1;
    this.versions.set(this.latest, {
      publicKeyPem: publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
      privateKey,
    });
    return this.latest;
  }

  get latestVersion(): number {
    return this.latest;
  }

  fetch = jest.fn((url: string | URL, init?: RequestInit): Response => {
    const u = new URL(url.toString());
    const method = (init?.method ?? 'GET').toUpperCase();
    this.requestLog.push(`${method} ${u.pathname}`);

    if (method === 'POST' && u.pathname.endsWith('/sha2-256')) {
      const { input } = JSON.parse(init!.body as string) as { input: string };
      const version = this.latest;
      const { privateKey } = this.versions.get(version)!;
      const signature = nodeSign(
        'sha256',
        Buffer.from(input, 'base64'),
        privateKey,
      );
      return json({
        data: {
          signature: `vault:v${version}:${signature.toString('base64')}`,
        },
      });
    }

    if (method === 'GET' && /\/transit\/keys\/[^/]+$/.test(u.pathname)) {
      const keys: Record<string, { public_key: string }> = {};
      for (const [version, entry] of this.versions) {
        keys[String(version)] = { public_key: entry.publicKeyPem };
      }
      return json({ data: { latest_version: this.latest, keys } });
    }

    return new Response(`fake-vault: unhandled ${method} ${u.pathname}`, {
      status: 404,
    });
  });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
