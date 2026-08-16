import { SignJWT } from 'jose';
import { UserStatus } from '@prisma/client';
import { AuthUser } from '../../domain/entities/auth-user.entity';
import { VaultAuthProvider } from '@infrastructure/vault/vault-auth.provider';
import { VaultTransitClient } from '@infrastructure/vault/vault-transit.client';
import { FakeVaultTransit } from '@infrastructure/vault/test-support/fake-vault-transit';
import { JwtKeyCacheService } from './jwt-key-cache.service';
import { JwtTokenService } from './jwt-token.service';

/**
 * RS256-via-Vault-Transit (auth migration brief §2). Real RSA signing and
 * verification run against FakeVaultTransit — see that file for why this
 * exercises genuine cryptographic correctness despite not hitting a live
 * Vault (no Docker in this sandbox; see vault-live.integration.spec.ts).
 */
describe('JwtTokenService — RS256 via Vault Transit', () => {
  const configValues: Record<string, unknown> = {
    'jwt.accessExpiresIn': '15m',
    'jwt.refreshExpiresIn': '7d',
    'jwt.publicKeyCacheTtlMs': 3_600_000,
    'vault.jwtKeyName': 'mms-jwt-signing',
  };
  const config = {
    get: jest.fn((k: string) => configValues[k]),
    getOrThrow: jest.fn((k: string) => configValues[k]),
  };

  const user = new AuthUser({
    id: 'user-1',
    email: 'a@mms.local',
    fullName: 'A User',
    acquirerId: 'acq-1',
    merchantId: null,
    status: UserStatus.ACTIVE,
    roles: ['BANK_ADMIN'],
    permissions: ['user:read'],
  });

  function buildStack() {
    const fakeVault = new FakeVaultTransit();
    (global as unknown as { fetch: typeof fetch }).fetch = fakeVault.fetch;

    const authConfig: Record<string, unknown> = {
      'vault.token': 'test-token',
      'vault.addr': 'http://fake-vault',
    };
    const authProviderConfig = { get: jest.fn((k: string) => authConfig[k]) };
    const auth = new VaultAuthProvider(authProviderConfig as never);
    const vaultClient = new VaultTransitClient(auth, config as never);
    const keyCache = new JwtKeyCacheService(vaultClient, config as never);

    const refreshTokens = { create: jest.fn().mockResolvedValue(undefined) };
    const tokens = new JwtTokenService(
      vaultClient,
      keyCache,
      config as never,
      refreshTokens as never,
    );

    return { fakeVault, keyCache, tokens };
  }

  it('signs a real RS256 JWT that verifies successfully end to end', async () => {
    const { tokens } = buildStack();

    const pair = await tokens.issueTokens(user);
    const [headerB64] = pair.accessToken.split('.');
    const header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString(),
    ) as Record<string, unknown>;
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe('1');

    const payload = await tokens.verifyAccessToken(pair.accessToken);
    expect(payload.sub).toBe('user-1');
    expect(payload.type).toBe('access');
  });

  it('rejects a forged HS256 token outright — no downgrade path exists', async () => {
    const { tokens } = buildStack();

    const forged = await new SignJWT({ sub: 'user-1', type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('any-secret-the-attacker-guessed'));

    await expect(tokens.verifyAccessToken(forged)).rejects.toThrow();
  });

  it('caches the public key — no Vault call for a second verification of the same version', async () => {
    const { fakeVault, tokens } = buildStack();

    const pair = await tokens.issueTokens(user);
    await tokens.verifyAccessToken(pair.accessToken);
    const callsAfterFirst = fakeVault.requestLog.length;

    await tokens.verifyAccessToken(pair.accessToken);
    expect(fakeVault.requestLog.length).toBe(callsAfterFirst); // no new Vault requests
  });

  it('keeps a pre-rotation token verifiable while new tokens sign under the rotated version', async () => {
    const { fakeVault, keyCache, tokens } = buildStack();

    const beforeRotation = await tokens.issueTokens(user);

    fakeVault.addVersion(); // simulates `vault write -f transit/keys/.../rotate`
    keyCache.invalidate(); // app picks up the new latest version, per §2.5

    const afterRotation = await tokens.issueTokens(user);

    const kidOf = (token: string) =>
      (
        JSON.parse(
          Buffer.from(token.split('.')[0], 'base64url').toString(),
        ) as { kid: string }
      ).kid;
    expect(kidOf(beforeRotation.accessToken)).toBe('1');
    expect(kidOf(afterRotation.accessToken)).toBe('2');

    // Both remain independently verifiable — this is the whole point of
    // caching keys by version rather than just "the current one".
    await expect(
      tokens.verifyAccessToken(beforeRotation.accessToken),
    ).resolves.toMatchObject({
      sub: 'user-1',
    });
    await expect(
      tokens.verifyAccessToken(afterRotation.accessToken),
    ).resolves.toMatchObject({
      sub: 'user-1',
    });
  });
});
