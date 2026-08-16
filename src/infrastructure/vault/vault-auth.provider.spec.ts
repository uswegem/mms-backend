import { VaultAuthProvider } from './vault-auth.provider';

describe('VaultAuthProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses VAULT_TOKEN directly when set — no AppRole login attempted', async () => {
    const config = {
      get: jest.fn((k: string) => ({ 'vault.token': 'dev-root-token' })[k]),
    };
    const fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock;

    const provider = new VaultAuthProvider(config as never);
    await expect(provider.getToken()).resolves.toBe('dev-root-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs in via AppRole when only role/secret ID are set, and caches the token', async () => {
    const config = {
      get: jest.fn(
        (k: string) =>
          ({
            'vault.addr': 'http://fake-vault',
            'vault.roleId': 'r',
            'vault.secretId': 's',
          })[k],
      ),
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ auth: { client_token: 'approle-token' } }),
        ),
      );
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock;

    const provider = new VaultAuthProvider(config as never);
    await expect(provider.getToken()).resolves.toBe('approle-token');
    await expect(provider.getToken()).resolves.toBe('approle-token');
    expect(fetchMock).toHaveBeenCalledTimes(1); // second call served from cache
  });

  it('rejects when neither VAULT_TOKEN nor AppRole credentials are configured', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const provider = new VaultAuthProvider(config as never);
    await expect(provider.getToken()).rejects.toThrow(/not configured/);
  });
});
