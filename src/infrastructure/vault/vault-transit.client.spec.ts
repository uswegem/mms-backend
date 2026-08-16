import { VaultAuthProvider } from './vault-auth.provider';
import { VaultTransitClient } from './vault-transit.client';

describe('VaultTransitClient — HTTP contract', () => {
  const config = {
    get: jest.fn(
      (key: string) =>
        ({
          'vault.addr': 'http://fake-vault',
          'vault.jwtKeyName': 'mms-jwt-signing',
        })[key],
    ),
  };

  function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status });
  }

  afterEach(() => jest.restoreAllMocks());

  it('strips the "vault:vN:" prefix and reports the key version', async () => {
    const auth = {
      getToken: jest.fn().mockResolvedValue('t'),
      relogin: jest.fn(),
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { data: { signature: 'vault:v3:c2lnbmF0dXJl' } }),
      );
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock;

    const client = new VaultTransitClient(
      auth as unknown as VaultAuthProvider,
      config as never,
    );
    const result = await client.sign('header.payload');

    expect(result).toEqual({ keyVersion: 3, signature: 'c2lnbmF0dXJl' });
  });

  it('re-authenticates once on a 403 and retries, rather than failing immediately', async () => {
    const auth = {
      getToken: jest.fn().mockResolvedValue('stale-token'),
      relogin: jest.fn().mockResolvedValue('fresh-token'),
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(403, { errors: ['permission denied'] }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { signature: 'vault:v1:c2ln' } }),
      );
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock;

    const client = new VaultTransitClient(
      auth as unknown as VaultAuthProvider,
      config as never,
    );
    const result = await client.sign('header.payload');

    expect(auth.relogin).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.keyVersion).toBe(1);
  });

  it('does not retry a second time — a persistent 403 surfaces as an error', async () => {
    const auth = {
      getToken: jest.fn().mockResolvedValue('t'),
      relogin: jest.fn().mockResolvedValue('t2'),
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(403, { errors: ['still denied'] }));
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock;

    const client = new VaultTransitClient(
      auth as unknown as VaultAuthProvider,
      config as never,
    );

    await expect(client.sign('x')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2); // original + exactly one retry
  });

  it('throws with the response body on a non-403 error status', async () => {
    const auth = {
      getToken: jest.fn().mockResolvedValue('t'),
      relogin: jest.fn(),
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(500, { errors: ['internal'] }));
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock;

    const client = new VaultTransitClient(
      auth as unknown as VaultAuthProvider,
      config as never,
    );
    await expect(client.getPublicKey()).rejects.toThrow(/500/);
  });
});
